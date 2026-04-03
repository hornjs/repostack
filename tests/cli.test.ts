import { describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { main } from "../src/cli";
import { createInitialConfig, writeConfig } from "../src/config";
import { createRepoFixture, createTempDir } from "./helpers";
import pkg from "../package.json";


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
    expect(stdout.chunks.join("")).toContain("--repos");
    expect(stdout.chunks.join("")).toContain("Options:");
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

  it("prints debug details for run when --debug is enabled", async () => {
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
    await writeConfig(join(root, "repostack.yaml"), config);

    const previousCwd = process.cwd();
    process.chdir(root);

    try {
      const stdout = createWriter();
      const stderr = createWriter();

      const code = await main({
        args: ["--debug", "run", "--repos", "evt", "--", "echo", "ok"],
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
});
