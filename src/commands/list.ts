import { join } from "node:path";
import type { RepoEntry, RepostackConfig } from "../types";
import { getCurrentBranch, getHeadRevision, isDirty } from "../git";

export type RepoListRow = {
  name: string;
  path: string;
  branch: string;
  revision: string;
  dirty: boolean;
  tags: string[];
};

export async function listRepos(
  root: string,
  config: RepostackConfig,
  repos: RepoEntry[] = config.repos,
  options: { onDebug?: (message: string) => void } = {},
): Promise<RepoListRow[]> {
  const debug = options.onDebug ?? (() => {});
  debug(`list: processing ${repos.length} repos`);

  return Promise.all(
    repos.map(async (repo) => {
      const cwd = join(root, repo.path);
      debug(`list: reading ${repo.name} at ${cwd}`);
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
