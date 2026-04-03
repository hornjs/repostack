import { join } from "node:path";
import type { RepostackConfig } from "../types";
import { cloneRepo, pathExists } from "../git";

export async function pull(
  root: string,
  config: RepostackConfig,
  options: { onDebug?: (message: string) => void } = {},
): Promise<void> {
  const debug = options.onDebug ?? (() => {});
  debug(`download: checking ${config.repos.length} repos`);

  for (const repo of config.repos) {
    const destination = join(root, repo.path);
    debug(`download: checking ${repo.name} at ${destination}`);
    if (await pathExists(destination)) {
      debug(`download: ${repo.name} already exists, skipping`);
      continue;
    }
    debug(`download: cloning ${repo.source} -> ${destination}`);
    await cloneRepo(repo.source, destination);
    debug(`download: cloned ${repo.name}`);
  }
}
