import { readFile, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { platform } from "node:process";
import YAML from "yaml";
import type { RepoEntry, RepostackConfig, ShellConfig, UserConfig } from "./types";

const REPOSTACK_RC = ".repostackrc";

export async function loadRepostackrc(root: string): Promise<string | null> {
  try {
    const path = join(root, REPOSTACK_RC);
    const content = await readFile(path, "utf8");
    const match = content.match(/^user=(.+)$/m);
    return match?.[1].trim() ?? null;
  } catch {
    return null;
  }
}

export async function repostackrcExists(root: string): Promise<boolean> {
  try {
    const { access } = await import("node:fs/promises");
    await access(join(root, REPOSTACK_RC));
    return true;
  } catch {
    return false;
  }
}

export async function saveRepostackrc(root: string, user: string): Promise<void> {
  const path = join(root, REPOSTACK_RC);
  await writeFile(path, `user=${user}\n`, "utf8");
}

export async function removeRepostackrc(root: string): Promise<void> {
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(join(root, REPOSTACK_RC));
  } catch {
    // Ignore if file doesn't exist
  }
}

export function mergeUserConfig(
  baseConfig: RepostackConfig,
  userConfig: UserConfig,
): RepostackConfig {
  const next = structuredClone(baseConfig);
  
  for (const [repoName, overrides] of Object.entries(userConfig.repos)) {
    const repo = next.repos.find((r) => r.name === repoName);
    if (repo) {
      Object.assign(repo, overrides);
    }
  }
  
  return next;
}

export async function loadConfigWithUser(
  root: string,
  options: { onDebug?: (message: string) => void } = {},
): Promise<{ config: RepostackConfig; user: string | null }> {
  const debug = options.onDebug ?? (() => {});
  
  const baseConfig = await loadConfig(root);
  const userName = await loadRepostackrc(root);
  
  debug(`config: loaded base config, users=${Object.keys(baseConfig.users ?? {}).join(",") || "(none)"}`);
  debug(`config: current user=${userName ?? "(none)"}`);
  
  // If users are defined, a user must be selected
  if (baseConfig.users && Object.keys(baseConfig.users).length > 0) {
    if (!userName) {
      const available = Object.keys(baseConfig.users).join(", ");
      throw new Error(
        `This stack requires a user configuration. Available users: ${available}\n` +
        `Run: repostack user <name>`
      );
    }
    
    const userConfig = baseConfig.users[userName];
    if (!userConfig) {
      throw new Error(`Unknown user: ${userName}`);
    }
    
    const merged = mergeUserConfig(baseConfig, userConfig);
    debug(`config: applied user overrides for ${userName}`);
    return { config: merged, user: userName };
  }
  
  // No users defined, use base config
  return { config: baseConfig, user: userName };
}

function getDefaultShell(): string {
  // Use user's default shell from environment if available
  if (process.env.SHELL) {
    return process.env.SHELL;
  }
  // Fallback based on platform
  if (platform === "win32") {
    return "cmd.exe";
  }
  // Unix-like systems
  return "bash";
}

export function resolveShell(shell: ShellConfig | undefined): string {
  // If not configured, use default
  if (shell === undefined) {
    return getDefaultShell();
  }
  
  // If it's a string, use directly
  if (typeof shell === "string") {
    return shell;
  }
  
  // Map Node.js platform to config keys
  const platformMap: Record<string, keyof typeof shell> = {
    win32: "windows",
    darwin: "macos",
    linux: "linux",
  };
  
  const configKey = platformMap[platform];
  const platformShell = configKey ? shell[configKey] : undefined;
  
  if (platformShell) {
    return platformShell;
  }
  
  // Fallback: try macos <-> linux
  if (platform === "darwin" && shell.linux) {
    return shell.linux;
  }
  if (platform === "linux" && shell.macos) {
    return shell.macos;
  }
  
  // Use any available shell from the object
  const availableShells = Object.values(shell).filter(Boolean);
  if (availableShells.length > 0) {
    return availableShells[0];
  }
  
  return getDefaultShell();
}

export function createInitialConfig(): RepostackConfig {
  return {
    version: 1,
    settings: {
      concurrency: 4,
      continueOnError: false,
    },
    repos: [],
    views: {},
    commands: {},
  };
}

export async function loadConfig(root: string): Promise<RepostackConfig> {
  const path = join(root, "repostack.yaml");
  const source = await readFile(path, "utf8");
  return YAML.parse(source) as RepostackConfig;
}

export async function writeConfig(path: string, config: RepostackConfig): Promise<void> {
  await writeFile(path, YAML.stringify(config), "utf8");
}

export function resolveRepoSelection(
  config: RepostackConfig,
  selection: { repos?: string[]; view?: string; tags?: string[] },
): RepoEntry[] {
  let repos = [...config.repos];

  if (selection.view) {
    const view = config.views[selection.view];
    if (!view) {
      throw new Error(`Unknown view: ${selection.view}`);
    }
    repos = resolveRepoSelection(config, { repos: view.repos, tags: view.tags });
  }

  if (selection.repos?.length) {
    repos = repos.filter((repo) => selection.repos?.includes(repo.name));
  }

  if (selection.tags?.length) {
    repos = repos.filter((repo) => selection.tags?.every((tag) => repo.tags?.includes(tag)));
  }

  return repos;
}

export async function useRepo(
  config: RepostackConfig,
  input: { cwd: string; path: string; source?: string; branch?: string },
): Promise<RepostackConfig> {
  const repoPath = input.path;
  const name = basename(repoPath);
  const next = structuredClone(config);

  if (next.repos.some((repo) => repo.name === name || repo.path === repoPath)) {
    throw new Error(`Repo already registered: ${repoPath}`);
  }

  next.repos.push({
    name,
    path: relative(input.cwd, join(input.cwd, repoPath)) || ".",
    source: input.source ?? repoPath,
    branch: input.branch ?? "main",
  });

  return next;
}

export function removeRepo(
  config: RepostackConfig,
  repoName: string,
): RepostackConfig {
  const next = structuredClone(config);
  const index = next.repos.findIndex((repo) => repo.name === repoName);

  if (index === -1) {
    throw new Error(`Repo not found: ${repoName}`);
  }

  next.repos.splice(index, 1);
  return next;
}
