import { access, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd });
    // Ensure the git repo toplevel matches the cwd (not a parent directory)
    const toplevel = stdout.trim();
    return toplevel === cwd;
  } catch {
    return false;
  }
}

export async function initGitRepo(cwd: string): Promise<void> {
  await mkdir(cwd, { recursive: true });
  await execFileAsync("git", ["init"], { cwd });
}

export async function cloneRepo(source: string, destination: string): Promise<void> {
  await execFileAsync("git", ["clone", source, destination]);
}

export async function checkoutRevision(cwd: string, revision: string): Promise<void> {
  await execFileAsync("git", ["checkout", revision], { cwd });
}

export async function fetchRepo(cwd: string): Promise<void> {
  await execFileAsync("git", ["fetch", "--all", "--tags"], { cwd });
}

export async function hasCommits(cwd: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["rev-parse", "HEAD"], { cwd });
    return true;
  } catch {
    return false;
  }
}

export async function getHeadRevision(cwd: string): Promise<string> {
  try {
    return await git(cwd, ["rev-parse", "HEAD"]);
  } catch {
    return "(no commits)";
  }
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  try {
    return await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  } catch {
    return "(no commits)";
  }
}

async function getGitConfig(cwd: string, key: string): Promise<string | null> {
  try {
    return await git(cwd, ["config", "--get", key]);
  } catch {
    return null;
  }
}

export async function getRemoteUrl(
  cwd: string,
  preferredBranch?: string,
): Promise<string | null> {
  const remoteNames: string[] = [];

  if (preferredBranch && preferredBranch !== "(no commits)") {
    const branchRemote = await getGitConfig(cwd, `branch.${preferredBranch}.remote`);
    if (branchRemote) {
      remoteNames.push(branchRemote);
    }
  }

  const currentBranch = await getCurrentBranch(cwd);
  if (currentBranch !== "(no commits)") {
    const currentRemote = await getGitConfig(cwd, `branch.${currentBranch}.remote`);
    if (currentRemote) {
      remoteNames.push(currentRemote);
    }
  }

  remoteNames.push("origin");

  for (const remoteName of new Set(remoteNames)) {
    try {
      return await git(cwd, ["remote", "get-url", remoteName]);
    } catch {
      // Try the next candidate
    }
  }

  try {
    const remotes = await git(cwd, ["remote"]);
    const fallbackRemote = remotes
      .split("\n")
      .map((remote) => remote.trim())
      .find(Boolean);

    if (fallbackRemote) {
      return await git(cwd, ["remote", "get-url", fallbackRemote]);
    }
  } catch {
    // No remotes configured
  }

  return null;
}

export async function isDirty(cwd: string): Promise<boolean> {
  const status = await git(cwd, ["status", "--short"]);
  return status.length > 0;
}
