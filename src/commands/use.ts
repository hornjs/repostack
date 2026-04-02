import { createInterface } from "node:readline";
import { join } from "node:path";
import { loadConfig, loadConfigWithUser, useRepo, writeConfig } from "../config";
import { isGitRepo, initGitRepo, pathExists } from "../git";
import { ensureGitignore } from "./init";
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

export async function useRepoCommand(
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
      const answer = await prompt(`Path "${repoPath}" does not exist. Create it? (y/N) `);
      if (answer !== "y" && answer !== "yes") {
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
      const answer = await prompt(`"${repoPath}" is not a git repository. Initialize it? (Y/n) `);
      if (answer === "" || answer === "y" || answer === "yes") {
        await initGitRepo(fullPath);
      } else {
        throw new Error("Aborted: user declined to initialize git repository");
      }
    }
  }

  // Confirm adding to stack
  if (!options.yes) {
    const answer = await prompt(`Add "${repoPath}" to repostack? (Y/n) `);
    if (answer !== "" && answer !== "y" && answer !== "yes") {
      throw new Error("Aborted: user declined to add repo");
    }
  }

  const next = await useRepo(config, { cwd: root, path: repoPath });
  debug(`use: adding repo name=${next.repos[next.repos.length - 1]?.name}`);
  await writeConfig(join(root, "repostack.yaml"), next);
  debug("use: config written");

  // Auto-snapshot after adding repo
  debug("use: auto-snapshotting");
  await writeSnapshot(root, next, { onDebug: debug });
  debug("use: snapshot written");

  // Ensure .gitignore has .repostackrc
  const gitignoreUpdated = await ensureGitignore(root);
  debug(`use: gitignoreUpdated=${gitignoreUpdated}`);
}
