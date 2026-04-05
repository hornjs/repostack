import { confirm, isCancel } from "@clack/prompts";
import { join } from "node:path";
import { loadConfig, loadConfigWithUser, useRepo, writeConfig } from "../config";
import { getRemoteUrl, isGitRepo, initGitRepo, pathExists } from "../git";
import { ensureGitignore } from "./init";
import { snapshot } from "./snapshot";

export async function use(
  root: string,
  repoPath: string,
  options: { yes?: boolean; onDebug?: (message: string) => void } = {},
): Promise<void> {
  const debug = options.onDebug ?? (() => {});

  // Check user if defined (throws if users exist but none selected)
  await loadConfigWithUser(root, { onDebug: debug });

  // Use base config for modification
  const config = await loadConfig(root);
  const fullPath = join(root, repoPath);

  debug(`use: root=${root} repoPath=${repoPath} fullPath=${fullPath}`);

  // Check if path exists
  const exists = await pathExists(fullPath);
  debug(`use: pathExists=${exists}`);
  if (!exists) {
    if (options.yes) {
      debug("use: auto-creating directory (yes mode)");
    } else {
      const answer = await confirm({
        message: `Path "${repoPath}" does not exist. Create it?`,
        initialValue: false,
      });
      if (isCancel(answer) || !answer) {
        throw new Error("Aborted: user declined to create directory");
      }
    }
  }

  // Check if it's a git repo
  const isRepo = await isGitRepo(fullPath);
  debug(`use: isGitRepo=${isRepo}`);
  if (!isRepo) {
    if (options.yes) {
      debug("use: auto-initializing git repo (yes mode)");
      await initGitRepo(fullPath);
    } else {
      const answer = await confirm({
        message: `"${repoPath}" is not a git repository. Initialize it?`,
        initialValue: true,
      });
      if (isCancel(answer) || !answer) {
        throw new Error("Aborted: user declined to initialize git repository");
      }
      await initGitRepo(fullPath);
    }
  }

  // Confirm adding to stack
  if (!options.yes) {
    const answer = await confirm({
      message: `Add "${repoPath}" to repostack?`,
      initialValue: true,
    });
    if (isCancel(answer) || !answer) {
      throw new Error("Aborted: user declined to add repo");
    }
  }

  const remoteSource = await getRemoteUrl(fullPath);
  debug(`use: remoteSource=${remoteSource ?? "(none)"}`);

  const next = await useRepo(config, {
    cwd: root,
    path: repoPath,
    source: remoteSource ?? undefined,
  });
  debug(`use: adding repo name=${next.repos[next.repos.length - 1]?.name}`);
  await writeConfig(join(root, "repostack.yaml"), next);
  debug("use: config written");

  // Auto-snapshot after adding repo
  debug("use: auto-snapshotting");
  await snapshot(root, next, { onDebug: debug });
  debug("use: snapshot written");

  // Ensure .gitignore has .repostackrc
  const gitignoreUpdated = await ensureGitignore(root);
  debug(`use: gitignoreUpdated=${gitignoreUpdated}`);
}
