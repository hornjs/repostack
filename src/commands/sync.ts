import { join } from "node:path";
import { confirm, isCancel } from "@clack/prompts";
import type { RepostackConfig, RepostackLock } from "../shared/types";
import { checkoutRevision, fetchRepo, isDirty } from "../git";
import { loadLock } from "../lock";
import { pull } from "./pull";
import { snapshot } from "./snapshot";

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
