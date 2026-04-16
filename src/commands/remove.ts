import { confirm, isCancel } from "@clack/prompts";
import { join } from "node:path";
import { loadConfig, loadConfigWithUser, removeRepo, writeConfig } from "../shared/config";
import { snapshot } from "./snapshot";

export async function remove(
  root: string,
  repoName: string,
  options: { yes?: boolean; onDebug?: (message: string) => void } = {},
): Promise<void> {
  const debug = options.onDebug ?? (() => {});
  debug(`remove: root=${root} repoName=${repoName}`);

  // Check user if defined (throws if users exist but none selected)
  await loadConfigWithUser(root, { onDebug: debug });

  // Use base config for modification
  const config = await loadConfig(root);

  // Check if repo exists
  const repo = config.repos.find((r) => r.name === repoName);
  if (!repo) {
    throw new Error(`Repo not found: ${repoName}`);
  }
  debug(`remove: found repo path=${repo.path}`);

  // Confirm removal
  if (!options.yes) {
    const answer = await confirm({
      message: `Remove "${repoName}" from repostack?`,
      initialValue: false,
    });
    if (isCancel(answer) || !answer) {
      throw new Error("Aborted: user declined to remove repo");
    }
  }

  const next = removeRepo(config, repoName);
  debug(`remove: removed ${repoName}, ${next.repos.length} repos remaining`);
  await writeConfig(join(root, "repostack.yaml"), next);
  debug("remove: config written");

  // Auto-snapshot after removing repo
  debug("remove: auto-snapshotting");
  await snapshot(root, next, { onDebug: debug });
  debug("remove: snapshot written");
}
