import { createInterface } from "node:readline";
import { join } from "node:path";
import { loadConfig, loadConfigWithUser, removeRepo, writeConfig } from "../config";
import { writeSnapshot } from "./snapshot";

function prompt(message: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

export async function removeRepoCommand(
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
    const answer = await prompt(`Remove "${repoName}" from repostack? (y/N) `);
    if (answer !== "y" && answer !== "yes") {
      throw new Error("Aborted: user declined to remove repo");
    }
  }

  const next = removeRepo(config, repoName);
  debug(`remove: removed ${repoName}, ${next.repos.length} repos remaining`);
  await writeConfig(join(root, "repostack.yaml"), next);
  debug("remove: config written");

  // Auto-snapshot after removing repo
  debug("remove: auto-snapshotting");
  await writeSnapshot(root, next, { onDebug: debug });
  debug("remove: snapshot written");
}
