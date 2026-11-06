/**
 * Server startup hook.
 *
 * Next.js calls `register()` once per server instance, before requests are
 * served. This is the correct place to start the monitoring scheduler: it needs
 * a long-lived Node process and must not run in an Edge/build context.
 *
 * Starting is idempotent — `startScheduler` returns early if a timer already
 * exists, so calling it here and from a monitor API route cannot create two
 * schedulers in one process.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.MONITOR_ENABLED === "false") return;
  try {
    const { startScheduler } = await import("./server/scheduler");
    const status = startScheduler();
    // Log the fact of startup, never any credential.
    console.log(
      "Klyro monitor scheduler started for holder",
      status.holder,
      status.recovery
        ? `(recovered: ${status.recovery.interruptedRuns} interrupted run(s), ${status.recovery.expiredLocks} stale lock(s))`
        : "",
    );
  } catch (error) {
    // A scheduler that cannot start must not take the whole web app down;
    // manual scanning still works and the failure is visible in the log.
    console.error(
      "Klyro monitor scheduler failed to start:",
      error instanceof Error ? error.message : error,
    );
  }
}
