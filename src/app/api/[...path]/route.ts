import { randomUUID } from "node:crypto";
import { isAddress, getAddress } from "viem";
import { z } from "zod";
import { body, protect, failure, HttpError } from "@/server/http";
import * as db from "@/server/db";
import * as repo from "@/server/repository";
import { indexHookActivity } from "@/server/activity";
import { scanHook } from "@/server/scan";
import { compareSnapshots } from "@/core/diff";
import { explain } from "@/server/ai";
import { createPassport, verifyPassport } from "@/server/passport";
import { NETWORKS } from "@/server/chains";
import { clientFor } from "@/server/chains";
import { readFileSync } from "node:fs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * Write the hook row, observed activities and participants for a saved
 * snapshot.
 *
 * The snapshot itself only carries an activity summary (counts and window), so
 * the same bounded window is re-queried here to obtain the individual log rows.
 * Those reads are pinned to the snapshot's recorded range and deduplicated on
 * (chain, tx, logIndex), so a rescan of unchanged chain state inserts zero new
 * rows. A provider failure is thrown so the caller logs it; it never becomes a
 * fabricated activity row.
 */
async function persistScanRelations(snapshot: import("@/core/types").Snapshot) {
  repo.upsertHook({
    chainId: snapshot.chainId,
    address: snapshot.address,
    status:
      snapshot.hookStatus === "UNKNOWN" ? "ADDRESS_ONLY" : snapshot.hookStatus,
    isHook: snapshot.hookStatus === "POOL_OBSERVED",
    deployer: snapshot.deployment?.deployer ?? null,
    deploymentTxHash: snapshot.deployment?.txHash ?? null,
    deploymentBlock: snapshot.deployment?.blockNumber ?? null,
    deploymentTimestamp: snapshot.deployment?.timestamp ?? null,
    scanId: snapshot.id,
  });

  let inserted = 0;
  const summary = snapshot.activity;
  if (summary && summary.status !== "UNKNOWN") {
    let indexed;
    try {
      indexed = await indexHookActivity(clientFor(snapshot.chainId), {
        chainId: snapshot.chainId,
        address: getAddress(snapshot.address),
        fromBlock: BigInt(summary.fromBlock),
        toBlock: BigInt(summary.toBlock),
        scanId: snapshot.id,
      });
    } catch (error) {
      throw new Error(
        "Activity rows could not be recorded: " +
          (error instanceof Error ? error.message : "unknown error"),
      );
    }
    inserted = repo.recordActivities(indexed.activities);
    repo.setLastIndexedBlock(
      snapshot.chainId,
      snapshot.address,
      indexed.toBlock,
    );
  }

  for (const p of snapshot.participants) {
    repo.upsertParticipant({
      chainId: snapshot.chainId,
      hookAddress: snapshot.address,
      address: p.address,
      role: p.role as repo.ParticipantRole,
      evidence: p.evidence,
      status: p.status,
      activityCount: p.activityCount ?? 0,
    });
  }
  return inserted;
}
const address = z.string().refine((a) => isAddress(a), "Invalid EVM address");
const ACTIVITY_KINDS = [
  "deployment",
  "pool-initialized",
  "liquidity-added",
  "liquidity-removed",
  "swap",
  "donation",
  "transfer",
] as const;
const scanSchema = z
  .object({
    address,
    chainId: z
      .number()
      .refine((n) => NETWORKS.some((c) => c.id === n), "Unsupported chain"),
    blockNumber: z.string().regex(/^\d+$/).optional(),
    poolFromBlock: z.string().regex(/^\d+$/).optional(),
    explain: z.boolean().default(false),
  })
  .strict();
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) {
  try {
    const { path: p } = await context.params;
    if (p[0] === "health" && p[1] === "live") {
      const checks = await Promise.all(
        NETWORKS.map(async ({ id, name }) => {
          try {
            const client = clientFor(id);
            const [actualChainId, block] = await Promise.all([
              client.getChainId(),
              client.getBlockNumber(),
            ]);
            return {
              id,
              name,
              status: actualChainId === id ? "available" : "wrong_chain",
              blockNumber: block.toString(),
              checkedAt: new Date().toISOString(),
            };
          } catch {
            return {
              id,
              name,
              status: "unavailable",
              blockNumber: null,
              checkedAt: new Date().toISOString(),
            };
          }
        }),
      );
      return Response.json({ networks: checks });
    }
    if (p[0] === "health")
      return Response.json({
        status: "ok",
        database: !!db.database(),
        networks: NETWORKS.map(({ id, name }) => ({ id, name })),
        inferenceConfigured:
          !!process.env.ZERO_G_API_KEY && !!process.env.ZERO_G_MODEL,
        freeCreditsConfirmed:
          process.env.ZERO_G_FREE_CREDITS_CONFIRMED === "true",
        registryConfigured: !!process.env.REGISTRY_ADDRESS,
      });
    if (p[0] === "scans" && !p[1]) return Response.json(db.recent());
    if (p[0] === "fixture") {
      try {
        return Response.json(
          JSON.parse(
            readFileSync(process.cwd() + "/data/fixture.json", "utf8"),
          ),
        );
      } catch {
        throw new HttpError(404, "No local fixture deployed");
      }
    }
    if (p[0] === "scans" && p[1]) {
      const job = db.getJob(p[1]);
      if (!job) throw new HttpError(404, "Scan not found");
      return Response.json({ ...job, inference: db.latestAI(p[1]) });
    }
    if (p[0] === "hooks" && p[1] && p[2] && p[3] === "history") {
      address.parse(p[2]);
      return Response.json(db.history(Number(p[1]), p[2]));
    }
    if (p[0] === "hooks" && p[1] && p[2] && p[3] === "activity") {
      address.parse(p[2]);
      const chainId = Number(p[1]);
      if (!NETWORKS.some((n) => n.id === chainId))
        throw new HttpError(400, "Unsupported chain");
      const q = new URL(request.url).searchParams;
      const kind = q.get("kind") ?? undefined;
      const limit = q.get("limit") ? Number(q.get("limit")) : 50;
      const offset = q.get("offset") ? Number(q.get("offset")) : 0;
      if (
        kind &&
        !ACTIVITY_KINDS.includes(kind as (typeof ACTIVITY_KINDS)[number])
      )
        throw new HttpError(400, "Unknown activity kind");
      if (!Number.isFinite(limit) || !Number.isFinite(offset))
        throw new HttpError(400, "limit and offset must be numbers");
      const hookAddress = p[2];
      return Response.json({
        ...repo.listActivities({
          chainId,
          hookAddress,
          kind: kind as repo.ActivityKind | undefined,
          fromBlock: q.get("fromBlock") ?? undefined,
          toBlock: q.get("toBlock") ?? undefined,
          limit,
          offset,
        }),
        counts: repo.activityKindCounts(chainId, hookAddress),
        lastIndexedBlock: repo.lastIndexedBlock(chainId, hookAddress),
      });
    }
    if (p[0] === "hooks" && p[1] && p[2] && p[3] === "profile") {
      address.parse(p[2]);
      const chainId = Number(p[1]);
      if (!NETWORKS.some((n) => n.id === chainId))
        throw new HttpError(400, "Unsupported chain");
      const hook = repo.getHook(chainId, p[2]);
      return Response.json({
        observed: hook !== null,
        hook,
        participants: repo.listParticipants(chainId, p[2]),
        counts: repo.activityKindCounts(chainId, p[2]),
        lastIndexedBlock: repo.lastIndexedBlock(chainId, p[2]),
        notice:
          "Every field here was written from a block-pinned scan. Participants carry the evidence that justified their role.",
      });
    }
    if (p[0] === "evidence" && p[1]) {
      const s = db.getSnapshot(p[1]);
      if (!s) throw new HttpError(404, "Scan not found");
      return Response.json(s.evidence);
    }
    if (p[0] === "passports" && p[1]) {
      const v = db.getPassport(p[1]);
      if (!v) throw new HttpError(404, "Passport not found");
      return Response.json(v, {
        headers: {
          "Content-Disposition": `inline; filename="hscan-${p[1]}.json"`,
        },
      });
    }
    if (p[0] === "passports") return Response.json(db.passports());
    if (p[0] === "verify" && p[1]) {
      protect(request);
      return Response.json(
        await verifyPassport(
          p[1],
          new URL(request.url).searchParams.get("current") === "true",
        ),
      );
    }
    if (p[0] === "ai" && p[1] === "requests" && p[2])
      return Response.json(db.latestAI(p[2]));
    if (p[0] === "simulations")
      return Response.json(db.executions("simulation"));
    if (p[0] === "cre") return Response.json(db.executions("cre"));
    if (p[0] === "registry")
      return Response.json({
        configured: !!process.env.REGISTRY_ADDRESS,
        address: process.env.REGISTRY_ADDRESS || null,
        chainId: Number(process.env.REGISTRY_CHAIN_ID || 11155111),
        passports: db.passports(),
        executions: db.executions("publication"),
        notice: "Saved passports are not automatically on-chain publications.",
      });
    throw new HttpError(404, "Route not found");
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const { path: p } = await context.params;
    protect(request, p[0] === "ai" || p[0] === "cre" || p[0] === "registry");
    const data = await body(request);
    if (p[0] === "scans") {
      const input = scanSchema.parse(data);
      if (input.explain && process.env.ZERO_G_API_KEY) protect(request, true);
      const id = randomUUID();
      db.createJob({
        id,
        chainId: input.chainId,
        address: input.address,
        status: "queued",
        stage: "Queued",
        error: null,
        createdAt: new Date().toISOString(),
      });
      setImmediate(async () => {
        try {
          db.stageJob(id, "running", "Connecting to chain");
          const s = await scanHook(input, (stage) =>
            db.stageJob(id, "running", stage),
          );
          s.id = id;
          db.saveSnapshot(s);
          // Persist the relational record (hook, activities, participants) so
          // the same observation is queryable across hooks. Failure here is
          // reported on the job, not hidden: the snapshot above is the hashed
          // record and stays truthful either way.
          try {
            await persistScanRelations(s);
          } catch (error) {
            console.error(
              "relational persistence failed for scan " + id,
              error instanceof Error ? error.message : error,
            );
          }
          if (input.explain) {
            db.stageJob(id, "running", "Requesting 0G explanation");
            await explain(s, null);
            db.stageJob(id, "complete", "Scan complete");
          }
        } catch (e) {
          const message =
            e instanceof Error &&
            /No deployed code|RPC chain|Chain reorganized|Pending block/.test(
              e.message,
            )
              ? e.message
              : `Live ${NETWORKS.find((n) => n.id === input.chainId)?.name || "chain"} observation failed during ${db.getJob(id)?.stage || "scan"}. Check the configured RPC endpoint and retry.`;
          db.stageJob(id, "failed", "Scan failed", message);
        }
      });
      return Response.json({ id }, { status: 202 });
    }
    if (p[0] === "diffs") {
      const { previousId, currentId } = z
        .object({ previousId: z.string().uuid(), currentId: z.string().uuid() })
        .parse(data);
      const a = db.getSnapshot(previousId),
        b = db.getSnapshot(currentId);
      if (!a || !b) throw new HttpError(404, "Scan not found");
      return Response.json(compareSnapshots(a, b));
    }
    if (p[0] === "ai" && p[1] === "explain") {
      const { scanId } = z.object({ scanId: z.string().uuid() }).parse(data);
      const s = db.getSnapshot(scanId);
      if (!s) throw new HttpError(404, "Scan not found");
      return Response.json(await explain(s, null));
    }
    if (p[0] === "passports") {
      const { scanId } = z.object({ scanId: z.string().uuid() }).parse(data);
      return Response.json(createPassport(scanId), { status: 201 });
    }
    if (p[0] === "verify" && p[1]) {
      const { report } = z.object({ report: z.unknown() }).parse(data);
      return Response.json(await verifyPassport(p[1], false, report));
    }
    throw new HttpError(404, "Route not found");
  } catch (e) {
    return failure(e);
  }
}
