import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInitialConfig, repostackrcExists, writeConfig } from "../shared/config";
import type { OutputContext } from "../shared/output";
import { initGitRepo, isGitRepo } from "../shared/git";
import type { Logger } from "logtra";

const REPOSTACK_GITIGNORE = `# Repostack user configuration
.repostackrc
`;

export async function ensureGitignore(root: string): Promise<boolean> {
  const gitignorePath = join(root, ".gitignore");

  try {
    let content = "";
    try {
      content = await readFile(gitignorePath, "utf8");
    } catch {
      // File doesn't exist, will create new
    }

    // Check if already contains .repostackrc
    if (content.includes(".repostackrc")) {
      return false; // Already present
    }

    // Append to existing or create new
    const newContent = content
      ? content.trimEnd() + "\n\n" + REPOSTACK_GITIGNORE
      : REPOSTACK_GITIGNORE;

    await writeFile(gitignorePath, newContent, "utf8");
    return true;
  } catch {
    return false;
  }
}

type InitOptions = {
  root: string;
  logger?: Logger;
  yes?: boolean;
}

export async function init(options: InitOptions): Promise<{
  configCreated: boolean;
  gitInitialized: boolean;
  gitignoreUpdated: boolean;
}> {
  const { root, logger } = options;
  const path = join(root, "repostack.yaml");

  let configCreated = false;
  let gitInitialized = false;
  const configStep = logger?.step("Config");
  const configOut: OutputContext | undefined = configStep ?? logger;

  // Create config if not exists
  try {
    await access(path);
    configOut?.debug(`init: config already exists at ${path}`);
    configStep?.done("<yellow>EXISTS</yellow>");
  } catch {
    configOut?.debug(`init: creating config at ${path}`);
    await writeConfig(path, createInitialConfig());
    configOut?.debug("init: config created");
    configCreated = true;
    configStep?.done();
  }

  const gitStep = logger?.step("Git");
  const gitOut: OutputContext | undefined = gitStep ?? logger;
  // Check if root is a git repo
  const isRepo = await isGitRepo(root);
  gitOut?.debug(`init: isGitRepo=${isRepo}`);

  if (!isRepo) {
    if (options.yes) {
      gitOut?.debug("init: auto-initializing git repo (yes mode)");
      await initGitRepo(root);
      gitInitialized = true;
      gitStep?.done("<green>INITIALIZED</green>");
    } else {
      // Don't prompt in non-TTY environments, just skip
      gitOut?.debug("init: not a git repo, skipping (use --yes to auto-init)");
      gitStep?.done("<yellow>SKIPPED</yellow>");
    }
  } else {
    gitStep?.done("<yellow>EXISTS</yellow>");
  }

  const gitignoreStep = logger?.step("Gitignore");
  const gitignoreOut: OutputContext | undefined = gitignoreStep ?? logger;
  // Update .gitignore only if .repostackrc exists
  const rcExists = await repostackrcExists(root);
  gitignoreOut?.debug(`init: repostackrcExists=${rcExists}`);
  const gitignoreUpdated = rcExists ? await ensureGitignore(root) : false;
  gitignoreOut?.debug(`init: gitignoreUpdated=${gitignoreUpdated}`);
  if (!rcExists) {
    gitignoreStep?.done("<yellow>SKIPPED</yellow>");
  } else if (gitignoreUpdated) {
    gitignoreStep?.done("<green>UPDATED</green>");
  } else {
    gitignoreStep?.done("<yellow>UNCHANGED</yellow>");
  }

  return {
    configCreated,
    gitInitialized,
    gitignoreUpdated,
  };
}
