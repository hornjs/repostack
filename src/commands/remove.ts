import { confirm, isCancel } from "@clack/prompts";
import { join } from "node:path";
import { loadConfig, loadConfigWithUser, removeRepo, writeConfig } from "../shared/config";
import type { OutputContext } from "../shared/output";
import { snapshot } from "./snapshot";
import type { Logger } from "logtra";

type RemoveOptions = {
  root: string;
  repoName: string;
  logger?: Logger;
  yes?: boolean;
};

export async function remove({
  root,
  repoName,
  logger,
  yes
}: RemoveOptions): Promise<void> {
  logger?.debug(`remove: root=${root} repoName=${repoName}`);
  const configStep = logger?.step("Update config");
  const out: OutputContext | undefined = configStep ?? logger;

  // Check user if defined (throws if users exist but none selected)
  await loadConfigWithUser(root, out);

  // Use base config for modification
  const config = await loadConfig(root);

  // Check if repo exists
  const repo = config.repos.find((r) => r.name === repoName);
  if (!repo) {
    throw new Error(`Repo not found: ${repoName}`);
  }
  out?.debug(`remove: found repo path=${repo.path}`);

  // Confirm removal
  if (!yes) {
    const answer = await confirm({
      message: `Remove "${repoName}" from repostack?`,
      initialValue: false,
    });
    if (isCancel(answer) || !answer) {
      throw new Error("Aborted: user declined to remove repo");
    }
  }

  const next = removeRepo(config, repoName);
  out?.debug(`remove: removed ${repoName}, ${next.repos.length} repos remaining`);
  await writeConfig(join(root, "repostack.yaml"), next);
  out?.debug("remove: config written");
  configStep?.done();

  // Auto-snapshot after removing repo
  const snapshotStep = logger?.step("Snapshot");
  const snapshotOut: OutputContext | undefined = snapshotStep ?? logger;
  snapshotOut?.debug("remove: auto-snapshotting");
  await snapshot({ root, config: next, logger: snapshotOut });
  snapshotOut?.debug("remove: snapshot written");
  snapshotStep?.done();
}
