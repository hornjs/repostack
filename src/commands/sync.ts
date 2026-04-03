import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import YAML from "yaml";
import { confirm, isCancel } from "@clack/prompts";
import type { RepostackConfig, RepostackLock } from "../types";
import { checkoutRevision, fetchRepo, isDirty, pathExists } from "../git";
import { pull } from "./pull";
import { snapshot } from "./snapshot";

function calculateChecksum(lock: Omit<RepostackLock, "checksum">): string {
  const content = JSON.stringify(lock, Object.keys(lock).sort());
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export async function loadLock(
  root: string,
  options: { onDebug?: (message: string) => void } = {},
): Promise<RepostackLock | null> {
  const debug = options.onDebug ?? (() => {});
  const path = join(root, "repostack.lock.yaml");
  if (!(await pathExists(path))) {
    debug("loadLock: lock file not found");
    return null;
  }
  const source = await readFile(path, "utf8");
  const lock = YAML.parse(source) as RepostackLock;

  if (lock.checksum) {
    const { checksum, ...lockWithoutChecksum } = lock;
    const expected = calculateChecksum(lockWithoutChecksum);
    if (checksum !== expected) {
      throw new Error(
        `Lock file checksum mismatch: expected ${expected}, got ${checksum}. The lock file may have been corrupted or manually edited.`,
      );
    }
    debug("loadLock: checksum verified");
  } else {
    debug("loadLock: no checksum found (legacy lock file)");
  }

  return lock;
}

export async function sync(
  root: string,
  config: RepostackConfig,
  options: { onDebug?: (message: string) => void; yes?: boolean } = {},
): Promise<RepostackLock> {
  const debug = options.onDebug ?? (() => {});
  debug(`sync: root=${root} repos=${config.repos.length}`);

  await pull(root, config, options);
  const lock = await loadLock(root, options);
  debug(`sync: lock file ${lock ? "found" : "not found"}`);

  for (const repo of config.repos) {
    const cwd = join(root, repo.path);
    debug(`sync: fetching ${repo.name}`);
    await fetchRepo(cwd);
    const pinned = lock?.repos[repo.name]?.revision;
    if (pinned) {
      debug(`sync: checking out ${repo.name} @ ${pinned.slice(0, 12)}`);

      const dirty = await isDirty(cwd);
      if (dirty) {
        if (options.yes) {
          debug(`sync: ${repo.name} has uncommitted changes, proceeding because --yes is set`);
        } else {
          const answer = await confirm({
            message: `Repo "${repo.name}" has uncommitted changes. Checkout ${pinned.slice(0, 12)} anyway?`,
            initialValue: false,
          });
          if (isCancel(answer) || !answer) {
            throw new Error(`Aborted: user declined to checkout ${repo.name}`);
          }
        }
      }

      await checkoutRevision(cwd, pinned);
    }
  }

  return snapshot(root, config, options);
}
