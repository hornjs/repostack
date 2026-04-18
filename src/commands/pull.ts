import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { usesImplicitSource } from "../shared/config";
import type { RepostackConfig } from "../shared/types";
import { cloneRepo, pathExists } from "../shared/git";
import { loadLock } from "../shared/lock";
import type { Logger } from "logtra";

export type PullOptions = {
  root: string;
  config: RepostackConfig;
  logger?: Logger;
  concurrency?: number;
  maxAttempts?: number;
  clone?: (source: string, destination: string) => Promise<void>;
};

export async function pull({ root, config, logger, ...options }: PullOptions): Promise<void> {
  logger?.debug(`checking ${config.repos.length} repos`);

  const lock = await loadLock(root, logger);
  const cloneFn = options.clone ?? cloneRepo;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const pending: Array<{ name: string; source: string; destination: string }> = [];

  for (const repo of config.repos) {
    const destination = join(root, repo.path);
    logger?.debug(`checking ${repo.name} at ${destination}`);
    if (await pathExists(destination)) {
      logger?.debug(`${repo.name} already exists, skipping`);
      continue;
    }
    const lockedSource = lock?.repos[repo.name]?.source;
    const source = usesImplicitSource(repo) && lockedSource ? lockedSource : repo.source;
    pending.push({ name: repo.name, source, destination });
  }

  const workerCount = Math.max(
    1,
    Math.min(options.concurrency ?? config.settings.concurrency, pending.length || 1),
  );
  let nextIndex = 0;
  let firstError: Error | null = null;
  let stopped = false;

  async function cloneWithRetry(task: { name: string; source: string; destination: string }) {
    const spin = logger?.spin(`Cloning ${task.name}...`);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        if (attempt > 1) {
          spin?.update(`Cloning ${task.name}... (${attempt}/${maxAttempts})`);
        }
        await mkdir(dirname(task.destination), { recursive: true });
        logger?.debug(`cloning ${task.source} -> ${task.destination} (attempt ${attempt}/${maxAttempts})`);
        await cloneFn(task.source, task.destination);
        logger?.debug(`cloned ${task.name} in ${attempt} attempt(s)`);
        const suffix = attempt > 1 ? ` (${attempt} attempts)` : "";
        spin?.done(`Cloned ${task.name}${suffix}`);
        return;
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        if (await pathExists(task.destination)) {
          await rm(task.destination, { recursive: true, force: true });
        }
        if (attempt === maxAttempts) {
          spin?.fail(`Clone failed: ${task.name} — ${normalized.message}`);
          throw normalized;
        }
        logger?.debug(`retrying ${task.name} (${attempt + 1}/${maxAttempts}) after ${normalized.message}`);
        spin?.update(`Retrying ${task.name}... (${attempt + 1}/${maxAttempts})`);
        logger?.warn(`Retrying clone (${attempt + 1}/${maxAttempts}): ${task.name}`);
      }
    }
  }

  async function runWorker() {
    while (!stopped) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= pending.length) return;
      try {
        await cloneWithRetry(pending[currentIndex]);
      } catch (error) {
        firstError = error instanceof Error ? error : new Error(String(error));
        stopped = true;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  if (firstError) {
    throw firstError;
  }
}
