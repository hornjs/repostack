import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { createInitialConfig, writeConfig } from "../src/config";
import { buildSnapshot, listRepos } from "../src/commands/snapshot";
import { cloneMissingRepos } from "../src/commands/download";
import { syncStack } from "../src/commands/sync";
import { createRepoFixture, createTempDir } from "./helpers";

const execFileAsync = promisify(execFile);

describe("stack state", () => {
  it("lists current git status for all repos", async () => {
    const root = await createTempDir("repostack-stack-");
    await createRepoFixture(root, "evt", "@hornjs/evt");
    const config = createInitialConfig();
    config.repos.push({
      name: "evt",
      path: "evt",
      source: "git@example.com/evt.git",
      branch: "main",
    });
    await writeConfig(join(root, "repostack.yaml"), config);

    const rows = await listRepos(root, config);

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("evt");
    expect(rows[0].revision).toMatch(/[0-9a-f]{7,40}/);
  });

  it("writes a lock snapshot with the current revision", async () => {
    const root = await createTempDir("repostack-lock-");
    await createRepoFixture(root, "evt", "@hornjs/evt");
    const config = createInitialConfig();
    config.repos.push({
      name: "evt",
      path: "evt",
      source: "git@example.com/evt.git",
      branch: "main",
    });

    const lock = await buildSnapshot(root, config);

    expect(lock.version).toBe(1);
    expect(lock.repos.evt.revision).toMatch(/[0-9a-f]{7,40}/);
  });

  it("clones a missing repo from its configured source", async () => {
    const root = await createTempDir("repostack-download-");
    const sourceRoot = await createTempDir("repostack-remote-");
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

    await cloneMissingRepos(root, config);
    const rows = await listRepos(root, config);

    expect(rows[0].name).toBe("evt");
  });

  it("syncs the lock file to current revisions", async () => {
    const root = await createTempDir("repostack-sync-");
    await createRepoFixture(root, "evt", "@hornjs/evt");
    const config = createInitialConfig();
    config.repos.push({
      name: "evt",
      path: "evt",
      source: "git@example.com/evt.git",
      branch: "main",
    });

    const lock = await syncStack(root, config);

    expect(lock.repos.evt.revision).toMatch(/[0-9a-f]{7,40}/);
  });
});
