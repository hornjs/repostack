import { join } from "node:path";
import { confirm, isCancel } from "@clack/prompts";
import type { RepostackConfig, RepostackLock } from "../shared/types";
import {
  fastForward,
  fetchRepo,
  getCurrentBranch,
  getUpstreamRef,
  isDirty,
  refExists,
  switchBranch,
} from "../shared/git";
import type { Logger } from "logtra";
import { pull } from "./pull";
import { snapshot } from "./snapshot";

type SyncOptions = {
  root: string;
  config: RepostackConfig;
  logger?: Logger;
  concurrency?: number;
  yes?: boolean;
};

export async function sync({
  root,
  config,
  logger,
  ...options
}: SyncOptions): Promise<RepostackLock> {
  logger?.debug(`sync: root=${root} repos=${config.repos.length}`);

  await pull({ root, config, logger, ...options });

  for (const repo of config.repos) {
    const cwd = join(root, repo.path);
    logger?.debug(`sync: fetching ${repo.name}`);
    await fetchRepo(cwd);

    const dirty = await isDirty(cwd);
    if (dirty) {
      if (options.yes) {
        logger?.debug(`sync: ${repo.name} has uncommitted changes, proceeding because --yes is set`);
      } else {
        const answer = await confirm({
          message: `Repo "${repo.name}" has uncommitted changes. Update ${repo.branch} anyway?`,
          initialValue: false,
        });
        if (isCancel(answer) || !answer) {
          throw new Error(`Aborted: user declined to update ${repo.name}`);
        }
      }
    }

    const currentBranch = await getCurrentBranch(cwd);
    if (currentBranch !== repo.branch) {
      logger?.debug(`sync: switching ${repo.name} from ${currentBranch} to ${repo.branch}`);
      await switchBranch(cwd, repo.branch);
    }

    const upstream = await getUpstreamRef(cwd, repo.branch);
    const fallbackRemote = `origin/${repo.branch}`;
    const target = upstream ?? ((await refExists(cwd, fallbackRemote)) ? fallbackRemote : null);

    if (target) {
      logger?.debug(`sync: fast-forwarding ${repo.name} from ${target}`);
      await fastForward(cwd, target);
    } else {
      logger?.debug(`sync: no upstream found for ${repo.name}:${repo.branch}; leaving local branch unchanged`);
    }
  }

  return snapshot({ root, config, logger });
}
