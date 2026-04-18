import { join } from "node:path";
import type { RepoEntry, RepostackConfig } from "../shared/types";
import { getCurrentBranch, getHeadRevision, isDirty } from "../shared/git";
import type { Logger } from "logtra";

export type RepoListRow = {
  name: string;
  path: string;
  branch: string;
  revision: string;
  dirty: boolean;
  tags: string[];
};

type ListOptions = {
  root: string;
  config: RepostackConfig;
  repos?: RepoEntry[];
  logger?: Logger;
};

export async function list({
  root,
  config,
  repos = config.repos,
  logger,
}: ListOptions): Promise<RepoListRow[]> {
  logger?.debug(`list: processing ${repos.length} repos`);

  return Promise.all(
    repos.map(async (repo) => {
      const cwd = join(root, repo.path);
      logger?.debug(`list: reading ${repo.name} at ${cwd}`);
      return {
        name: repo.name,
        path: repo.path,
        branch: await getCurrentBranch(cwd),
        revision: (await getHeadRevision(cwd)).slice(0, 12),
        dirty: await isDirty(cwd),
        tags: repo.tags ?? [],
      };
    }),
  );
}
