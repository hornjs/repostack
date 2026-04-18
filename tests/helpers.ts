import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export function createWriter(options?: { isTTY?: boolean }) {
  const chunks: string[] = [];
  return {
    chunks,
    stream: {
      isTTY: options?.isTTY,
      write(chunk: string | Uint8Array) {
        chunks.push(String(chunk));
        return true;
      },
    },
  };
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2));
}

export async function createRepoFixture(root: string, dir: string, pkgName: string): Promise<string> {
  const full = join(root, dir);
  await mkdir(full, { recursive: true });
  await writeJson(join(full, "package.json"), { name: pkgName, version: "0.0.0" });
  await execFileAsync("git", ["init"], { cwd: full });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: full });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: full });
  await writeFile(join(full, "README.md"), `# ${pkgName}\n`);
  await execFileAsync("git", ["add", "."], { cwd: full });
  await execFileAsync("git", ["commit", "-m", "init"], { cwd: full });
  return full;
}
