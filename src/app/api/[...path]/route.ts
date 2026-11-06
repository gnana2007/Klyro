import { randomUUID } from "node:crypto";
import { isAddress, getAddress } from "viem";
import { z } from "zod";
import { body, protect, failure, HttpError } from "@/server/http";
import * as db from "@/server/db";
import * as repo from "@/server/repository";
import { runScan } from "@/server/scanner";
import * as monitor from "@/server/monitor";
import { schedulerStatus, startScheduler, tick } from "@/server/scheduler";
import { compareSnapshots } from "@/core/diff";
import { explain, listModels } from "@/server/ai";
import { createPassport, verifyPassport, publicationIntent } from "@/server/passport";
import {
  artifact,
  confirmDeployment,
  confirmPublication,
  getDeployment,
  getPublication,
  listDeployments,
  listPublications,
  prepareDeployment,
  registryState,
  verificationStatus,
} from "@/server/deploy";
import { NETWORKS } from "@/server/chains";
import { clientFor } from "@/server/chains";
import { readFileSync } from "node:fs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * The browser needs the ABI to encode its own wallet transactions (deploy,
 * publish, owner configuration). Only the ABI is exposed: no bytecode, no
 * endpoints, no secrets. The deployment path asks for bytecode separately when
 * preparing, and the wallet — not this server — sends the deployment.
 */
function abiForBrowser() {
  const art = artifact();
  return {
    contractName: art.contractName,
    solcVersion: art.solcVersion,
    bytecode: art.bytecode,
    bytecodeBytes: art.sizeBytes,
    abi: art.abi,
  };
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
    if (p[0] === "health") {
      // Health must answer even when storage is broken: the whole point of the
      // endpoint is to say what is working. It reports storage honestly rather
      // than failing the request, so a monitor can distinguish "the app is down"
      // from "the disk is not persistent".
      const location = db.databaseLocation();
      let storage: {
        ok: boolean;
        path: string | null;
        durable: boolean;
        note: string;
      } = { ok: false, path: location.path, durable: location.durable, note: location.reason };
      try {
        const handle = db.database();
        handle.prepare("SELECT 1").get();
        const active = db.activePath();
        storage = {
          ok: true,
          path: active,
          durable: location.durable && active === location.path,
          note: db.lastDatabaseError() ?? location.reason,
        };
      } catch (error) {
        storage = {
          ...storage,
          ok: false,
          note:
            error instanceof Error
              ? error.message
              : "Storage is unavailable",
        };
      }
      return Response.json({
        status: storage.ok ? "ok" : "degraded",
        database: storage.ok,
        storage,
        networks: NETWORKS.map(({ id, name }) => ({ id, name })),
        inferenceConfigured:
          !!process.env.ZERO_G_API_KEY && !!process.env.ZERO_G_MODEL,
        // The explainer is optional. This flag exists so the UI can offer it
        // when it is genuinely usable, never so it can gate a scan.
        aiOptional: true,
        freeCreditsConfirmed:
          process.env.ZERO_G_FREE_CREDITS_CONFIRMED === "true",
        registryConfigured: !!process.env.REGISTRY_ADDRESS,
      });
    }
    if (p[0] === "scans" && !p[1]) {
      // Scan history. The shape stays `{ scans, unreadable }` so a client can
      // tell an empty history from a corrupted one instead of seeing an empty
      // array that looks like success.
      const history = db.recent();
      return Response.json({
        scans: history.scans,
        unreadable: history.unreadable,
        storage: db.databaseLocation().durable
          ? "durable"
          : "ephemeral",
        notice:
          history.unreadable.length > 0
            ? history.unreadable.length +
              " stored snapshot(s) could not be parsed and were omitted."
            : null,
      });
    }
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
      const fromBlock = q.get("fromBlock") ?? undefined;
      const toBlock = q.get("toBlock") ?? undefined;
      const fromTimestamp = q.get("fromTimestamp") ?? undefined;
      const toTimestamp = q.get("toTimestamp") ?? undefined;
      const participant = q.get("address") ?? undefined;
      if (
        kind &&
        !ACTIVITY_KINDS.includes(kind as (typeof ACTIVITY_KINDS)[number])
      )
        throw new HttpError(400, "Unknown activity kind");
      if (!Number.isFinite(limit) || !Number.isFinite(offset))
        throw new HttpError(400, "limit and offset must be numbers");
      if (limit < 1 || limit > 500)
        throw new HttpError(400, "limit must be between 1 and 500");
      if (offset < 0) throw new HttpError(400, "offset must not be negative");
      for (const [name, value] of [
        ["fromBlock", fromBlock],
        ["toBlock", toBlock],
      ] as const)
        if (value !== undefined && !/^\d+$/.test(value))
          throw new HttpError(400, name + " must be a decimal block number");
      for (const [name, value] of [
        ["fromTimestamp", fromTimestamp],
        ["toTimestamp", toTimestamp],
      ] as const)
        if (value !== undefined && Number.isNaN(Date.parse(value)))
          throw new HttpError(400, name + " must be an ISO 8601 timestamp");
      if (participant !== undefined && !isAddress(participant))
        throw new HttpError(400, "address filter must be an EVM address");
      const hookAddress = p[2];
      return Response.json({
        ...repo.listActivities({
          chainId,
          hookAddress,
          kind: kind as repo.ActivityKind | undefined,
          address: participant,
          fromBlock,
          toBlock,
          fromTimestamp,
          toTimestamp,
          limit,
          offset,
        }),
        filters: {
          kind: kind ?? null,
          address: participant ?? null,
          fromBlock: fromBlock ?? null,
          toBlock: toBlock ?? null,
          fromTimestamp: fromTimestamp ?? null,
          toTimestamp: toTimestamp ?? null,
        },
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
    if (p[0] === "passports" && p[1] && p[2] === "publication-intent") {
      // The route has to be matched before the plain passport route below,
      // otherwise `passports/<id>/publication-intent` never reaches here and
      // the caller receives the whole report instead of the five fields a
      // publish transaction needs.
      const intent = publicationIntent(p[1]);
      return Response.json({
        ...intent,
        hook: getAddress(intent.hook),
      });
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
    if (p[0] === "deploy" && p[1] === "artifact")
      return Response.json(abiForBrowser());
    if (p[0] === "deploy" && p[1] === "records") {
      return Response.json({
        deployments: listDeployments(),
        publications: listPublications(),
      });
    }
    if (p[0] === "deploy" && p[1] === "record" && p[2] && p[3])
      return Response.json(
        p[2] === "deployments" ? getDeployment(p[3]) : getPublication(p[3]),
      );
    if (p[0] === "deploy" && p[1] === "verification" && p[2] && p[3])
      return Response.json(await verificationStatus(Number(p[2]), p[3]));
    if (p[0] === "deploy" && p[1] === "prepare") {
      const q = new URL(request.url).searchParams;
      return Response.json(
        await prepareDeployment(Number(q.get("chainId")), q.get("owner") || ""),
      );
    }
    if (p[0] === "registry" && p[1] === "state")
      return Response.json(await registryState());
    if (p[0] === "ai" && p[1] === "models") {
      // Free, documented, unauthenticated catalog read. Lets an operator
      // verify ZERO_G_MODEL before spending a single inference credit.
      try {
        const catalog = await listModels();
        return Response.json({
          ...catalog,
          guidance:
            "Set ZERO_G_MODEL to one of these ids exactly. Prefer a model whose verifiability is TeeML and that supports JSON mode.",
        });
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Model catalog is unavailable",
            configuredModel: process.env.ZERO_G_MODEL || null,
          },
          { status: 502 },
        );
      }
    }
    if (p[0] === "ai" && p[1] === "requests" && p[2])
      return Response.json(db.latestAI(p[2]));
    if (p[0] === "monitors" && p[1] === "status")
      return Response.json(schedulerStatus());
    if (p[0] === "monitors" && p[1] === "runs")
      return Response.json({ runs: monitor.listRuns(Number(p[2] ?? 50)) });
    if (p[0] === "monitors")
      return Response.json({
        monitors: monitor.monitoredHooks(),
        scheduler: schedulerStatus(),
        limits: {
          minIntervalMinutes: monitor.MIN_INTERVAL_MINUTES,
          maxIntervalMinutes: monitor.MAX_INTERVAL_MINUTES,
        },
        notice:
          "A monitored hook is rescanned on an interval. A failed run backs off and keeps its error; a missed interval is not backfilled.",
      });
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
          // runScan is shared with the scheduler, so a manual scan and a
          // monitored scan cannot drift apart.
          const s = await runScan(input, {
            jobId: id,
            onStage: (stage) => db.stageJob(id, "running", stage),
          });
          if (input.explain) {
            db.stageJob(id, "running", "Requesting the optional AI explanation");
            await explain(s, null);
            db.stageJob(id, "complete", "Scan complete");
          }
        } catch (e) {
          db.stageJob(
            id,
            "failed",
            "Scan failed",
            e instanceof Error ? e.message : "Scan failed",
          );
        }
      });
      return Response.json({ id }, { status: 202 });
    }
    if (p[0] === "monitors") {
      protect(request, true);
      if (p[1] === "run") {
        // Run one monitor now, using the same lock as the scheduler so a manual
        // trigger cannot race an automatic one.
        const input = z
          .object({ chainId: z.number(), address })
          .parse(data);
        const chainId = input.chainId;
        const hook = monitor.addMonitor({
          chainId,
          hookAddress: input.address,
        });
        if (!hook) throw new HttpError(400, "Monitor could not be created");
        if (!monitor.claim(chainId, hook.hookAddress, "manual"))
          throw new HttpError(409, "This hook is already being scanned");
        const runId = monitor.recordRunStart({
          chainId,
          hookAddress: hook.hookAddress,
          trigger: "manual",
        });
        try {
          const snapshot = await runScan({
            chainId,
            address: hook.hookAddress,
          });
          monitor.recordRunFinish(runId, {
            status: "complete",
            scanId: snapshot.id,
            blockNumber: snapshot.blockNumber,
          });
          monitor.finishMonitor({
            chainId,
            hookAddress: hook.hookAddress,
            ok: true,
            blockNumber: snapshot.blockNumber,
          });
          return Response.json({ scanId: snapshot.id, blockNumber: snapshot.blockNumber });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "monitored scan failed";
          monitor.recordRunFinish(runId, { status: "failed", error: message });
          monitor.finishMonitor({
            chainId,
            hookAddress: hook.hookAddress,
            ok: false,
            error: message,
          });
          throw new HttpError(502, message);
        } finally {
          monitor.release(chainId, hook.hookAddress, "manual");
        }
      }
      if (p[1] === "remove") {
        const input = z.object({ chainId: z.number(), address }).parse(data);
        return Response.json({
          removed: monitor.removeMonitor(input.chainId, input.address),
        });
      }
      if (p[1] === "toggle") {
        const input = z
          .object({ chainId: z.number(), address, enabled: z.boolean() })
          .parse(data);
        const updated = monitor.setEnabled(
          input.chainId,
          input.address,
          input.enabled,
        );
        if (!updated) throw new HttpError(404, "Monitor not found");
        return Response.json(updated);
      }
      const { chainId, address: hookAddress, intervalMinutes } = z
        .object({
          chainId: z.number().refine(
            (n) => NETWORKS.some((c) => c.id === n),
            "Unsupported chain",
          ),
          address,
          intervalMinutes: z.number().optional(),
        })
        .parse(data);
      startScheduler();
      return Response.json(
        monitor.addMonitor({ chainId, hookAddress, intervalMinutes }),
        { status: 201 },
      );
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
    if (p[0] === "deploy" && p[1] === "confirm") {
      // Records the receipt of a transaction the browser wallet already sent.
      // Nothing is broadcast here, and the record stays `unconfirmed` unless a
      // receipt is actually read back from the chain.
      const input = z
        .object({
          id: z.string().uuid(),
          chainId: z.number(),
          txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
          owner: address,
          deployer: address,
        })
        .strict()
        .parse(data);
      const record = await confirmDeployment({
        ...input,
        txHash: input.txHash as `0x${string}`,
      });
      return Response.json(record);
    }
    if (p[0] === "deploy" && p[1] === "publish-confirm") {
      const input = z
        .object({
          id: z.string().uuid(),
          chainId: z.number(),
          registry: address,
          hook: address,
          reportHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
          fingerprintHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
          riskLevel: z.number().int().min(0).max(3),
          passportId: z.string().uuid().nullable(),
          txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
          publisher: address,
        })
        .strict()
        .parse(data);
      return Response.json(
        await confirmPublication({
          ...input,
          registry: input.registry as `0x${string}`,
          reportHash: input.reportHash as `0x${string}`,
          fingerprintHash: input.fingerprintHash as `0x${string}`,
          txHash: input.txHash as `0x${string}`,
        }),
      );
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
