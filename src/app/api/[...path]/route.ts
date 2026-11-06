import { randomUUID } from "node:crypto";
import { isAddress } from "viem";
import { z } from "zod";
import { body, protect, failure, HttpError } from "@/server/http";
import * as db from "@/server/db";
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
const address = z.string().refine((a) => isAddress(a), "Invalid EVM address");
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
    if (p[0] === "hooks" && p[1] && p[2]) {
      address.parse(p[2]);
      return Response.json(db.history(Number(p[1]), p[2]));
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
