import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { main } from "../src/cli";
import { createInitialConfig, writeConfig } from "../src/shared/config";
import { createRepoFixture, createTempDir } from "./helpers";
import pkg from "../package.json";

const execFileAsync = promisify(execFile);

function createWriter(options?: { isTTY?: boolean }) {
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

describe("cli", () => {
  it("prints help output for --help", async () => {
    const stdout = createWriter();
    const stderr = createWriter();

    const code = await main({
      args: ["--help"],
      stdout: stdout.stream as any,
      stderr: stderr.stream as any,
    });

    expect(code).toBe(0);
    expect(stdout.chunks.join("")).toContain("Commands:");
    expect(stdout.chunks.join("")).toContain("init");
    expect(stdout.chunks.join("")).toContain("run");
    expect(stdout.chunks.join("")).toContain("Usage:");
    expect(stdout.chunks.join("")).toContain("repostack/");
    expect(stderr.chunks.join("")).toBe("");
  });

  it("returns exit code 1 for unknown command", async () => {
    const stdout = createWriter();
    const stderr = createWriter();

    const code = await main({
      args: ["wat"],
      stdout: stdout.stream as any,
      stderr: stderr.stream as any,
    });

    expect(code).toBe(1);
    expect(stderr.chunks.join("")).toContain("Unknown command");
  });

  it("prints command help for run --help", async () => {
    const stdout = createWriter();
    const stderr = createWriter();

    const code = await main({
      args: ["run", "--help"],
      stdout: stdout.stream as any,
      stderr: stderr.stream as any,
    });

    expect(code).toBe(0);
    expect(stdout.chunks.join("")).toContain("repostack run [script]");
    expect(stdout.chunks.join("")).toContain("Examples:");
    expect(stderr.chunks.join("")).toBe("");
  });

  it("prints plain help output when stdout is a tty", async () => {
    const stdout = createWriter({ isTTY: true });
    const stderr = createWriter();

    const code = await main({
      args: ["--help"],
      stdout: stdout.stream as any,
      stderr: stderr.stream as any,
    });

    expect(code).toBe(0);
    expect(stdout.chunks.join("")).not.toMatch(/\u001B\[/);
  });

  it("prints version output for -v", async () => {
    const stdout = createWriter();
    const stderr = createWriter();

    const code = await main({
      args: ["-v"],
      stdout: stdout.stream as any,
      stderr: stderr.stream as any,
    });

    expect(code).toBe(0);
    expect(stdout.chunks.join("")).toContain(pkg.version);
    expect(stderr.chunks.join("")).toBe("");
  });

  it("prints debug details for run when --debug is enabled", { timeout: 10_000 }, async () => {
    const root = await createTempDir("repostack-cli-debug-");
    await createRepoFixture(root, "evt", "@hornjs/evt");
    await writeFile(join(root, "evt", "FLAG"), "evt\n");

    const config = createInitialConfig();
    config.repos.push({
      name: "evt",
      path: "evt",
      source: "git@example.com/evt.git",
      branch: "main",
      tags: ["runtime"],
    });
    config.scripts["greet"] = { command: "echo ok", repos: ["evt"] };
    await writeConfig(join(root, "repostack.yaml"), config);

    const previousCwd = process.cwd();
    process.chdir(root);

    try {
      const stdout = createWriter();
      const stderr = createWriter();

      const code = await main({
        args: ["--debug", "run", "greet"],
        stdout: stdout.stream as any,
        stderr: stderr.stream as any,
      });

      expect(code).toBe(0);
      expect(stdout.chunks.join("")).toContain("ok");
      expect(stderr.chunks.join("")).toContain("[debug]");
      expect(stderr.chunks.join("")).toContain("selected repos: evt");
      expect(stderr.chunks.join("")).toContain("echo ok");
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("prints pull progress for missing repos", { timeout: 10_000 }, async () => {
    const root = await createTempDir("repostack-cli-pull-");
    const sourceRoot = await createTempDir("repostack-cli-pull-remote-");
    const repo = await createRepoFixture(sourceRoot, "evt-src", "@hornjs/evt");
    const bare = join(sourceRoot, "evt.git");
    await execFileAsync("git", ["clone", "--bare", repo, bare]);

    const config = createInitialConfig();
    config.repos.push({
      name: "evt",
      path: "evt",
      source: bare,
      branch: "master",
    });
    await writeConfig(join(root, "repostack.yaml"), config);

    const previousCwd = process.cwd();
    process.chdir(root);

    try {
      const stdout = createWriter();
      const stderr = createWriter();

      const code = await main({
        args: ["pull"],
        stdout: stdout.stream as any,
        stderr: stderr.stream as any,
      });

      expect(code).toBe(0);
      expect(stdout.chunks.join("")).toContain("Starting clone: evt");
      expect(stdout.chunks.join("")).toContain("Finished clone: evt");
      expect(stdout.chunks.join("")).toContain("Pulled missing repos");
      expect(stderr.chunks.join("")).toBe("");
    } finally {
      process.chdir(previousCwd);
    }
  });
});
