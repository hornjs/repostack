import { confirm, isCancel } from "@clack/prompts";
import { join } from "node:path";
import {
  loadConfig,
  loadConfigWithUser,
  useRepo,
  writeConfig,
} from "../shared/config";
import {
  getRemoteUrl,
  isGitRepo,
  initGitRepo,
  pathExists,
} from "../shared/git";
import type { OutputContext } from "../shared/output";
import { ensureGitignore } from "./init";
import { snapshot } from "./snapshot";
import type { Logger } from "logtra";

type UseOptions = {
  root: string;
  repoPath: string;
  logger?: Logger;
  yes?: boolean;
};

export async function use({
  root,
  repoPath,
  logger,
  yes,
}: UseOptions): Promise<void> {
  const validateStep = logger?.step("Validate repo");
  const out: OutputContext | undefined = validateStep ?? logger;

  // Check user if defined (throws if users exist but none selected)
  await loadConfigWithUser(root, out);

  // Use base config for modification
  const config = await loadConfig(root);
  const fullPath = join(root, repoPath);

  out?.debug(`use: root=${root} repoPath=${repoPath} fullPath=${fullPath}`);

  // Check if path exists
  const exists = await pathExists(fullPath);
  out?.debug(`use: pathExists=${exists}`);
  if (!exists) {
    if (yes) {
      out?.debug("use: auto-creating directory (yes mode)");
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
  out?.debug(`use: isGitRepo=${isRepo}`);
  if (!isRepo) {
    if (yes) {
      out?.debug("use: auto-initializing git repo (yes mode)");
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
  if (!yes) {
    const answer = await confirm({
      message: `Add "${repoPath}" to repostack?`,
      initialValue: true,
    });
    if (isCancel(answer) || !answer) {
      throw new Error("Aborted: user declined to add repo");
    }
  }

  const remoteSource = await getRemoteUrl(fullPath);
  out?.debug(`use: remoteSource=${remoteSource ?? "(none)"}`);
  validateStep?.done();

  const registerStep = logger?.step("Register repo");
  const registerOut: OutputContext | undefined = registerStep ?? logger;
  const next = await useRepo(config, {
    cwd: root,
    path: repoPath,
    source: remoteSource ?? undefined,
  });
  registerOut?.debug(`use: adding repo name=${next.repos[next.repos.length - 1]?.name}`);
  await writeConfig(join(root, "repostack.yaml"), next);
  registerOut?.debug("use: config written");
  registerStep?.done();

  // Auto-snapshot after adding repo
  const snapshotStep = logger?.step("Snapshot");
  const snapshotOut: OutputContext | undefined = snapshotStep ?? logger;
  snapshotOut?.debug("use: auto-snapshotting");
  await snapshot({ root, config: next, logger: snapshotOut });
  snapshotOut?.debug("use: snapshot written");
  snapshotStep?.done();

  // Ensure .gitignore has .repostackrc
  const gitignoreStep = logger?.step("Gitignore");
  const gitignoreOut: OutputContext | undefined = gitignoreStep ?? logger;
  const gitignoreUpdated = await ensureGitignore(root);
  gitignoreOut?.debug(`use: gitignoreUpdated=${gitignoreUpdated}`);
  gitignoreStep?.done(gitignoreUpdated ? "<green>UPDATED</green>" : "<yellow>UNCHANGED</yellow>");
}
