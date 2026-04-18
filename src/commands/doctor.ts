import { access, readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import YAML from "yaml";
import { loadConfig, loadRepostackrc, repostackrcExists } from "../shared/config";
import { isGitRepo, pathExists } from "../shared/git";
import type { IssueContext } from "../shared/output";
import type { RepostackConfig } from "../shared/types";
import { Logger } from "logtra";

const TOP_LEVEL_KEYS = new Set(["version", "settings", "repos", "views", "scripts", "users"]);
const SETTINGS_KEYS = new Set(["shell", "concurrency", "continueOnError"]);
const SHELL_KEYS = new Set(["windows", "macos", "linux"]);
const REPO_KEYS = new Set(["name", "path", "source", "branch", "tags"]);
const VIEW_KEYS = new Set(["repos", "tags"]);
const SCRIPT_KEYS = new Set(["command", "repos", "views", "tags"]);
const USER_KEYS = new Set(["repos"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reportUnsupportedKeys(
  value: unknown,
  path: string,
  supportedKeys: Set<string>,
  logger: IssueContext | undefined,
): void {
  if (!isRecord(value)) return;

  for (const key of Object.keys(value)) {
    if (!supportedKeys.has(key)) {
      logger?.issue({
        type: "warning",
        message: `Unsupported config key '${path}.${key}' will be ignored`,
      });
    }
  }
}

function checkUnsupportedConfigKeys(value: unknown, logger: IssueContext | undefined): void {
  reportUnsupportedKeys(value, "config", TOP_LEVEL_KEYS, logger);
  if (!isRecord(value)) return;

  const settings = value.settings;
  reportUnsupportedKeys(settings, "config.settings", SETTINGS_KEYS, logger);
  if (isRecord(settings) && isRecord(settings.shell)) {
    reportUnsupportedKeys(settings.shell, "config.settings.shell", SHELL_KEYS, logger);
  }

  if (Array.isArray(value.repos)) {
    value.repos.forEach((repo, index) => {
      reportUnsupportedKeys(repo, `config.repos[${index}]`, REPO_KEYS, logger);
    });
  }

  if (isRecord(value.views)) {
    for (const [name, view] of Object.entries(value.views)) {
      reportUnsupportedKeys(view, `config.views.${name}`, VIEW_KEYS, logger);
    }
  }

  if (isRecord(value.scripts)) {
    for (const [name, script] of Object.entries(value.scripts)) {
      reportUnsupportedKeys(script, `config.scripts.${name}`, SCRIPT_KEYS, logger);
    }
  }

  if (isRecord(value.users)) {
    for (const [userName, user] of Object.entries(value.users)) {
      reportUnsupportedKeys(user, `config.users.${userName}`, USER_KEYS, logger);
      if (!isRecord(user) || !isRecord(user.repos)) continue;
      for (const [repoName, repoOverrides] of Object.entries(user.repos)) {
        reportUnsupportedKeys(repoOverrides, `config.users.${userName}.repos.${repoName}`, REPO_KEYS, logger);
      }
    }
  }
}

type DoctorOptions = {
  root: string;
  logger?: Logger;
}

export async function doctor({ root, logger }: DoctorOptions): Promise<void> {
  function summarizeStep(loggerStep: NonNullable<ReturnType<Logger["step"]>>): string {
    const errorCount = loggerStep.issuer.issues.filter((issue) => issue.type === "error").length;
    const warningCount = loggerStep.issuer.issues.filter((issue) => issue.type === "warning").length;
    const infoCount = loggerStep.issuer.issues.filter((issue) => issue.type === "info").length;

    if (errorCount > 0) {
      return `<red>ERROR</red> <dim>(${errorCount})</dim>`;
    }
    if (warningCount > 0) {
      return `<yellow>WARN</yellow> <dim>(${warningCount})</dim>`;
    }
    if (infoCount > 0) {
      return `<green>OK</green> <dim>(${infoCount} info)</dim>`;
    }
    return "<green>OK</green>";
  }

  async function runStep(name: string, fn: (out: IssueContext | undefined) => Promise<boolean | void>): Promise<boolean> {
    const step = logger?.step(name);
    const out = step ?? logger;
    const result = await fn(out);
    if (step) {
      step.done(summarizeStep(step));
    }
    return result !== false;
  }

  // 1. Check repostack.yaml exists
  const configOk = await runStep("Config file", async (stepLogger) => {
    stepLogger?.debug("checking repostack.yaml");
    try {
      await access(join(root, "repostack.yaml"));
    } catch {
      stepLogger?.issue({
        type: "error",
        message: "repostack.yaml not found. Run: repostack init",
      });
      return false;
    }
  });
  if (!configOk) {
    return;
  }

  // 2. Load and validate config
  let config!: RepostackConfig;
  const loadOk = await runStep("Config", async (stepLogger) => {
    stepLogger?.debug("loading repostack.yaml");
    try {
      const source = await readFile(join(root, "repostack.yaml"), "utf8");
      checkUnsupportedConfigKeys(YAML.parse(source) as unknown, stepLogger);
      config = await loadConfig(root);
    } catch (error) {
      stepLogger?.issue({
        type: "error",
        message: `Failed to load repostack.yaml: ${error instanceof Error ? error.message : String(error)}`,
      });
      return false;
    }
  });
  if (!loadOk) return;

  // 3. Check users
  await runStep("Users", async (stepLogger) => {
    stepLogger?.debug("checking users");
    const hasUsers = config.users && Object.keys(config.users).length > 0;
    const userName = await loadRepostackrc(root);
    const hasRepostackrc = await repostackrcExists(root);

    if (hasUsers) {
      if (!hasRepostackrc) {
        const available = Object.keys(config.users!).join(", ");
        stepLogger?.issue({
          type: "error",
          message: `Users defined but .repostackrc not found. Available users: ${available}. Run: repostack user switch <name>`,
        });
      } else if (!userName) {
        stepLogger?.issue({
          type: "error",
          message: `.repostackrc exists but no user selected. Run: repostack user switch <name>`,
        });
      } else if (!config.users![userName]) {
        stepLogger?.issue({
          type: "error",
          message: `Selected user '${userName}' not found in config`,
        });
      } else {
        stepLogger?.issue({
          type: "info",
          message: `Using user: ${userName}`,
        });
      }
    } else if (hasRepostackrc) {
      stepLogger?.issue({
        type: "warning",
        message: `.repostackrc exists but no users defined in config. Run: repostack user unset to remove it`,
      });
    }
  });

  // 4. Check .gitignore
  let gitignoreContent = "";
  await runStep("Gitignore", async (stepLogger) => {
    stepLogger?.debug("checking .gitignore");
    try {
      gitignoreContent = await readFile(join(root, ".gitignore"), "utf8");
      const hasUsers = config.users && Object.keys(config.users).length > 0;
      const hasRepostackrc = await repostackrcExists(root);
      if ((hasUsers || hasRepostackrc) && !gitignoreContent.includes(".repostackrc")) {
        stepLogger?.issue({
          type: "warning",
          message: ".gitignore should contain '.repostackrc' to prevent committing user config",
        });
      }
    } catch {
      stepLogger?.issue({
        type: "warning",
        message: ".gitignore not found. Recommended to create one with .repostackrc",
      });
    }
  });

  // 5. Check repos
  await runStep("Repos", async (stepLogger) => {
    stepLogger?.debug("checking repos");
    if (config.repos.length === 0) {
      stepLogger?.issue({
        type: "warning",
        message: "No repos defined. Use: repostack use <path>",
      });
      return;
    }
    for (const repo of config.repos) {
      const repoPath = join(root, repo.path);
      if (!(await pathExists(repoPath))) {
        stepLogger?.issue({
          type: "error",
          message: `Repo '${repo.name}': path not found at ${repo.path}`,
        });
        continue;
      }
      if (!(await isGitRepo(repoPath))) {
        stepLogger?.issue({
          type: "error",
          message: `Repo '${repo.name}': not a git repository`,
        });
        continue;
      }
      stepLogger?.issue({
        type: "info",
        message: `Repo '${repo.name}': OK`,
      });
    }
  });

  // 6. Check lock file
  await runStep("Lock file", async (stepLogger) => {
    stepLogger?.debug("checking lock file");
    try {
      await access(join(root, "repostack.lock.yaml"));
      stepLogger?.issue({
        type: "info",
        message: "Lock file exists",
      });
    } catch {
      stepLogger?.issue({
        type: "warning",
        message: "Lock file not found. Run: repostack snapshot",
      });
    }
  });

  // 7. Check stack root is git repo
  await runStep("Stack root", async (stepLogger) => {
    stepLogger?.debug("checking stack root git");
    if (!(await isGitRepo(root))) {
      stepLogger?.issue({
        type: "warning",
        message: "Stack root is not a git repository. Recommended for time-travel workflow",
      });
    } else {
      stepLogger?.issue({
        type: "info",
        message: "Stack root is a git repository",
      });
    }
  });

  // 8. Check repo parent directories in .gitignore
  await runStep("Repo directories", async (stepLogger) => {
    stepLogger?.debug("checking repo parents in .gitignore");
    const repoParentPaths = new Set<string>();
    for (const repo of config.repos) {
      const parentDir = dirname(repo.path);
      if (parentDir !== "." && parentDir !== "/") {
        repoParentPaths.add(parentDir);
      }
    }
    for (const parentPath of repoParentPaths) {
      const patterns = [parentPath, `${parentPath}/`, `${parentPath}/*`, `${parentPath}/**/`];
      if (!patterns.some((p) => gitignoreContent.includes(p))) {
        stepLogger?.issue({
          type: "warning",
          message: `.gitignore should contain '${parentPath}/' to prevent committing sub-repos`,
        });
      }
    }
  });

  // 9. Scan for untracked git repositories
  await runStep("Untracked repos", async (stepLogger) => {
    stepLogger?.debug("scanning for untracked git repos");
    const repoPaths = new Set(config.repos.map((r) => join(root, r.path)));
    const scannedDirs = new Set<string>();

    async function scanForGitRepos(dir: string, depth = 0): Promise<void> {
      if (depth > 2 || scannedDirs.has(dir)) return;
      scannedDirs.add(dir);
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name === ".git") continue;
          const fullPath = join(dir, entry.name);
          if (repoPaths.has(fullPath)) continue;
          if (await isGitRepo(fullPath)) {
            stepLogger?.issue({
              type: "warning",
              message: `Found untracked git repository: ${fullPath.slice(root.length + 1)} (not in repostack.yaml)`,
            });
          } else {
            await scanForGitRepos(fullPath, depth + 1);
          }
        }
      } catch {
        // Ignore permission errors
      }
    }

    await scanForGitRepos(root);
  });
}
