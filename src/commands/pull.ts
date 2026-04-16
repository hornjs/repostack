import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { usesImplicitSource } from "../shared/config";
import type { RepostackConfig } from "../shared/types";
import { cloneRepo, pathExists } from "../shared/git";
import { loadLock } from "../shared/lock";

export type PullOptions = {
  onDebug?: (message: string) => void;
  concurrency?: number;
  maxAttempts?: number;
  clone?: (source: string, destination: string) => Promise<void>;
  onRepoStart?: (repo: string) => void;
  onRepoDone?: (repo: string, attempts: number) => void;
  onRepoRetry?: (repo: string, attempt: number, error: Error) => void;
  onRepoFailed?: (repo: string, attempts: number, error: Error) => void;
};

export async function pull(
  root: string,
  config: RepostackConfig,
  options: PullOptions = {},
): Promise<void> {
  const debug = options.onDebug ?? (() => {});
  debug(`download: checking ${config.repos.length} repos`);
  const lock = await loadLock(root, options);
  const clone = options.clone ?? cloneRepo;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const pending: Array<{ name: string; source: string; destination: string }> = [];

  for (const repo of config.repos) {
    const destination = join(root, repo.path);
    debug(`download: checking ${repo.name} at ${destination}`);
    if (await pathExists(destination)) {
      debug(`download: ${repo.name} already exists, skipping`);
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
    options.onRepoStart?.(task.name);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await mkdir(dirname(task.destination), { recursive: true });
        debug(`download: cloning ${task.source} -> ${task.destination} (attempt ${attempt}/${maxAttempts})`);
        await clone(task.source, task.destination);
        debug(`download: cloned ${task.name} in ${attempt} attempt(s)`);
        options.onRepoDone?.(task.name, attempt);
        return;
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        if (await pathExists(task.destination)) {
          await rm(task.destination, { recursive: true, force: true });
        }

        if (attempt === maxAttempts) {
          options.onRepoFailed?.(task.name, attempt, normalized);
          throw normalized;
        }

        const nextAttempt = attempt + 1;
        debug(`download: retrying ${task.name} (${nextAttempt}/${maxAttempts}) after ${normalized.message}`);
        options.onRepoRetry?.(task.name, nextAttempt, normalized);
      }
    }
  }

  async function runWorker() {
    while (!stopped) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= pending.length) {
        return;
      }

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
