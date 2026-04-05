import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import YAML from "yaml";
import type { RepostackConfig, RepostackLock } from "../types";
import { getCurrentBranch, getHeadRevision, getRemoteUrl } from "../git";

export { list as listRepos } from "./list";

function calculateChecksum(lock: Omit<RepostackLock, "checksum">): string {
  const content = JSON.stringify(lock, Object.keys(lock).sort());
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export async function buildSnapshot(
  root: string,
  config: RepostackConfig,
  options: { onDebug?: (message: string) => void } = {},
): Promise<RepostackLock> {
  const debug = options.onDebug ?? (() => {});
  const lock: Omit<RepostackLock, "checksum"> = {
    version: 1,
    repos: {},
  };

  for (const repo of config.repos) {
    const cwd = join(root, repo.path);
    debug(`snapshot: reading ${repo.name} at ${cwd}`);
    const source = await getRemoteUrl(cwd, repo.branch) ?? repo.source;
    lock.repos[repo.name] = {
      path: repo.path,
      source,
      branch: await getCurrentBranch(cwd),
      revision: await getHeadRevision(cwd),
    };
    debug(`snapshot: ${repo.name} @ ${lock.repos[repo.name].revision.slice(0, 12)}`);
  }

  const checksum = calculateChecksum(lock);
  debug(`snapshot: calculated checksum ${checksum}`);

  return { ...lock, checksum };
}

export async function snapshot(
  root: string,
  config: RepostackConfig,
  options: { onDebug?: (message: string) => void } = {},
): Promise<RepostackLock> {
  const debug = options.onDebug ?? (() => {});
  const lock = await buildSnapshot(root, config, options);
  const path = join(root, "repostack.lock.yaml");
  debug(`snapshot: writing to ${path}`);
  await writeFile(path, YAML.stringify(lock), "utf8");
  debug("snapshot: done");
  return lock;
}
