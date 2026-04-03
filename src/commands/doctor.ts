import { access, readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { loadConfig, loadRepostackrc, repostackrcExists } from "../config";
import { isGitRepo, pathExists } from "../git";
import type { RepostackConfig } from "../types";

export type DoctorIssue = {
  type: "error" | "warning" | "info";
  message: string;
};

export type DoctorResult = {
  issues: DoctorIssue[];
  hasErrors: boolean;
  hasWarnings: boolean;
};

export async function doctor(
  root: string,
  options: { onDebug?: (message: string) => void } = {},
): Promise<DoctorResult> {
  const debug = options.onDebug ?? (() => {});
  const issues: DoctorIssue[] = [];

  // 1. Check repostack.yaml exists
  debug("doctor: checking repostack.yaml");
  try {
    await access(join(root, "repostack.yaml"));
  } catch {
    issues.push({ type: "error", message: "repostack.yaml not found. Run: repostack init" });
    return { issues, hasErrors: true, hasWarnings: false };
  }

  // 2. Load and validate config
  let config: RepostackConfig;
  try {
    config = await loadConfig(root);
  } catch (error) {
    issues.push({
      type: "error",
      message: `Failed to load repostack.yaml: ${error instanceof Error ? error.message : String(error)}`,
    });
    return { issues, hasErrors: true, hasWarnings: false };
  }

  // 3. Check if users are defined and user is selected
  debug("doctor: checking users");
  const hasUsers = config.users && Object.keys(config.users).length > 0;
  const userName = await loadRepostackrc(root);
  const hasRepostackrc = await repostackrcExists(root);

  if (hasUsers) {
    // Users defined: check .repostackrc exists and has valid user
    if (!hasRepostackrc) {
      const available = Object.keys(config.users!).join(", ");
      issues.push({
        type: "error",
        message: `Users defined but .repostackrc not found. Available users: ${available}. Run: repostack user switch <name>`,
      });
    } else if (!userName) {
      issues.push({
        type: "error",
        message: `.repostackrc exists but no user selected. Run: repostack user switch <name>`,
      });
    } else if (!config.users![userName]) {
      issues.push({ type: "error", message: `Selected user '${userName}' not found in config` });
    } else {
      issues.push({ type: "info", message: `Using user: ${userName}` });
    }
  } else {
    // No users defined: .repostackrc should not exist (unused)
    if (hasRepostackrc) {
      issues.push({
        type: "warning",
        message: `.repostackrc exists but no users defined in config. Run: repostack user unset to remove it`,
      });
    }
  }

  // 4. Check .gitignore has .repostackrc (only if users might use it)
  debug("doctor: checking .gitignore");
  if (hasUsers || hasRepostackrc) {
    try {
      const gitignore = await readFile(join(root, ".gitignore"), "utf8");
      if (!gitignore.includes(".repostackrc")) {
        issues.push({
          type: "warning",
          message: ".gitignore should contain '.repostackrc' to prevent committing user config",
        });
      }
    } catch {
      issues.push({ type: "warning", message: ".gitignore not found. Recommended to create one with .repostackrc" });
    }
  }

  // 5. Check repos
  debug("doctor: checking repos");
  if (config.repos.length === 0) {
    issues.push({ type: "warning", message: "No repos defined. Use: repostack use <path>" });
  } else {
    for (const repo of config.repos) {
      const repoPath = join(root, repo.path);
      
      // Check path exists
      if (!(await pathExists(repoPath))) {
        issues.push({ type: "error", message: `Repo '${repo.name}': path not found at ${repo.path}` });
        continue;
      }

      // Check is git repo
      if (!(await isGitRepo(repoPath))) {
        issues.push({ type: "error", message: `Repo '${repo.name}': not a git repository` });
        continue;
      }

      issues.push({ type: "info", message: `Repo '${repo.name}': OK` });
    }
  }

  // 6. Check lock file
  debug("doctor: checking lock file");
  try {
    await access(join(root, "repostack.lock.yaml"));
    issues.push({ type: "info", message: "Lock file exists" });
  } catch {
    issues.push({ type: "warning", message: "Lock file not found. Run: repostack snapshot" });
  }

  // 7. Check stack root is git repo
  debug("doctor: checking stack root git");
  if (!(await isGitRepo(root))) {
    issues.push({ type: "warning", message: "Stack root is not a git repository. Recommended for time-travel workflow" });
  } else {
    issues.push({ type: "info", message: "Stack root is a git repository" });
  }

  // 8. Check if repo parent directories are in .gitignore
  debug("doctor: checking repo parents in .gitignore");
  let gitignoreContent = "";
  try {
    gitignoreContent = await readFile(join(root, ".gitignore"), "utf8");
  } catch {
    // .gitignore not found, already warned above
  }

  const repoParentPaths = new Set<string>();
  for (const repo of config.repos) {
    const parentDir = dirname(repo.path);
    if (parentDir !== "." && parentDir !== "/") {
      repoParentPaths.add(parentDir);
    }
  }

  for (const parentPath of repoParentPaths) {
    // Check if parent path or its pattern is in .gitignore
    const patterns = [
      parentPath,
      `${parentPath}/`,
      `${parentPath}/*`,
      `${parentPath}/**/`,
    ];
    const isIgnored = patterns.some((p) => gitignoreContent.includes(p));
    if (!isIgnored) {
      issues.push({
        type: "warning",
        message: `.gitignore should contain '${parentPath}/' to prevent committing sub-repos`,
      });
    }
  }

  // 9. Check for untracked git repositories
  debug("doctor: scanning for untracked git repos");
  const repoPaths = new Set(config.repos.map((r) => join(root, r.path)));
  const scannedDirs = new Set<string>();

  async function scanForGitRepos(dir: string, depth = 0): Promise<void> {
    if (depth > 2) return; // Limit scan depth
    if (scannedDirs.has(dir)) return;
    scannedDirs.add(dir);

    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === ".git") continue;

        const fullPath = join(dir, entry.name);

        // Skip if this is a registered repo
        if (repoPaths.has(fullPath)) continue;

        // Check if it's a git repo
        if (await isGitRepo(fullPath)) {
          const relativePath = fullPath.slice(root.length + 1);
          issues.push({
            type: "info",
            message: `Found untracked git repository: ${relativePath} (not in repostack.yaml)`,
          });
        } else {
          // Recurse into subdirectories
          await scanForGitRepos(fullPath, depth + 1);
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  await scanForGitRepos(root);

  const hasErrors = issues.some((i) => i.type === "error");
  const hasWarnings = issues.some((i) => i.type === "warning");

  return { issues, hasErrors, hasWarnings };
}
