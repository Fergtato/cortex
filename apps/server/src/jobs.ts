import type { CortexServerModule, ServerContext } from "@cortex/core/server";

/**
 * In-process scheduler for module jobs (connector syncs later). One instance
 * per container is assumed; a run is skipped if the previous one is still going.
 */
export function startJobs(ctx: ServerContext, modules: CortexServerModule[]): () => void {
  const timers: NodeJS.Timeout[] = [];
  for (const mod of modules) {
    for (const job of mod.jobs ?? []) {
      const name = `${mod.id}.${job.id}`;
      let running = false;
      const tick = async () => {
        if (running) return;
        running = true;
        try {
          await job.run(ctx);
        } catch (e) {
          console.error(`[jobs] ${name} failed:`, e);
        } finally {
          running = false;
        }
      };
      timers.push(setInterval(tick, job.everyMinutes * 60_000));
    }
  }
  return () => timers.forEach(clearInterval);
}
