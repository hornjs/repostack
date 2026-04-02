import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInitialConfig, writeConfig } from "../config";
import { initGitRepo, isGitRepo } from "../git";

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

export async function initStack(
  root: string,
  options: { onDebug?: (message: string) => void; yes?: boolean } = {},
): Promise<{ configCreated: boolean; gitInitialized: boolean; gitignoreUpdated: boolean }> {
  const debug = options.onDebug ?? (() => {});
  const path = join(root, "repostack.yaml");

  let configCreated = false;
  let gitInitialized = false;

  // Create config if not exists
  try {
    await access(path);
    debug(`init: config already exists at ${path}`);
  } catch {
    debug(`init: creating config at ${path}`);
    await writeConfig(path, createInitialConfig());
    debug("init: config created");
    configCreated = true;
  }

  // Check if root is a git repo
  const isRepo = await isGitRepo(root);
  debug(`init: isGitRepo=${isRepo}`);

  if (!isRepo) {
    if (options.yes) {
      debug("init: auto-initializing git repo (yes mode)");
      await initGitRepo(root);
      gitInitialized = true;
    } else {
      // Don't prompt in non-TTY environments, just skip
      debug("init: not a git repo, skipping (use --yes to auto-init)");
    }
  }

  // Update .gitignore
  const gitignoreUpdated = await ensureGitignore(root);
  debug(`init: gitignoreUpdated=${gitignoreUpdated}`);

  return { configCreated, gitInitialized, gitignoreUpdated };
}
