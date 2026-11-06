import { randomUUID } from "node:crypto";
import { getAddress } from "viem";
import type { Snapshot } from "../core/types";
import { scanHook, type ScanInput } from "./scan";
import { indexHookActivity } from "./activity";
import * as db from "./db";
import * as repo from "./repository";
import { clientFor } from "./chains";

// One place that performs and records a scan.
//
// Both the HTTP route and the scheduler call `runScan`. Keeping a single
// implementation matters more than it looks: the scheduler must produce
// exactly the same snapshot, the same hook row and the same activity rows as a
// user-triggered scan, or "monitored history" and "manual history" would
// silently diverge.

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
export async function persistScanRelations(snapshot: Snapshot) {
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

/**
 * Run one scan end to end and persist it.
 *
 * Returns the saved snapshot. Throws with a caller-safe message when the
 * observation fails; the job row (when a job is used) carries the stage that
 * was in progress so a failure is attributable to a step, not just "error".
 */
export async function runScan(
  input: ScanInput,
  hooks: {
    onStage?: (stage: string) => void;
    jobId?: string;
    trigger?: string;
    onError?: (message: string) => void;
  } = {},
): Promise<Snapshot> {
  const id = hooks.jobId ?? randomUUID();
  const onStage = hooks.onStage ?? (() => {});
  try {
    onStage("Connecting to chain");
    const snapshot = await scanHook(input, onStage);
    snapshot.id = id;
    db.saveSnapshot(snapshot, hooks.trigger ?? "manual");
    try {
      await persistScanRelations(snapshot);
    } catch (error) {
      // The snapshot above is the hashed, truthful record. Relational rows are
      // derived convenience data; failing to write them must not discard a
      // real observation, but it must be visible.
      console.error(
        "relational persistence failed for scan " + id,
        error instanceof Error ? error.message : error,
      );
    }
    return snapshot;
  } catch (error) {
    const stage = db.getJob(id)?.stage || "scan";
    const raw = error instanceof Error ? error.message : String(error);
    // Keep messages that describe what the chain or provider actually said.
    // A storage failure is named explicitly, because "check the RPC" would be
    // the wrong advice for (say) a database constraint.
    const identifiable =
      /No deployed code|RPC chain|Chain reorganized|Pending block|FOREIGN KEY|UNIQUE constraint|Activity rows could not be recorded/i.test(
        raw,
      );
    const message = identifiable
      ? raw
      : `Live observation failed during ${stage}. Check the configured RPC endpoint and retry.`;
    hooks.onError?.(message);
    // Attach the stage so a monitor run records where it stopped, not just that
    // it stopped.
    const wrapped = new Error(message);
    wrapped.name = "ScanFailed";
    (wrapped as Error & { stage?: string }).stage = stage;
    throw wrapped;
  }
}
