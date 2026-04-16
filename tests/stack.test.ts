import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import YAML from "yaml";
import { createInitialConfig, writeConfig } from "../src/shared/config";
import { buildSnapshot, listRepos } from "../src/commands/snapshot";
import { pull } from "../src/commands/pull";
import { sync } from "../src/commands/sync";
import { snapshot } from "../src/commands/snapshot";
import { loadConfig } from "../src/shared/config";
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

  it("prefers the repo remote URL as the lock source when available", async () => {
    const root = await createTempDir("repostack-lock-remote-");
    const repo = await createRepoFixture(root, "evt", "@hornjs/evt");
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:hornjs/evt.git"], {
      cwd: repo,
    });
    const config = createInitialConfig();
    config.repos.push({
      name: "evt",
      path: "evt",
      source: "evt",
      branch: "main",
    });

    const lock = await buildSnapshot(root, config);

    expect(lock.repos.evt.source).toBe("git@github.com:hornjs/evt.git");
  });

  it("updates repostack.yaml sources to the resolved remote URL during snapshot", async () => {
    const root = await createTempDir("repostack-snapshot-config-");
    const repo = await createRepoFixture(root, "evt", "@hornjs/evt");
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:hornjs/evt.git"], {
      cwd: repo,
    });
    const config = createInitialConfig();
    config.repos.push({
      name: "evt",
      path: "evt",
      source: "evt",
      branch: "main",
    });
    await writeConfig(join(root, "repostack.yaml"), config);

    await snapshot(root, config);
    const updatedConfig = await loadConfig(root);

    expect(updatedConfig.repos[0].source).toBe("git@github.com:hornjs/evt.git");
  });

  it("does not overwrite an explicit config source during snapshot", async () => {
    const root = await createTempDir("repostack-snapshot-explicit-");
    const repo = await createRepoFixture(root, "evt", "@hornjs/evt");
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:hornjs/evt.git"], {
      cwd: repo,
    });
    const config = createInitialConfig();
    config.repos.push({
      name: "evt",
      path: "evt",
      source: "git@github.com:custom/evt.git",
      branch: "main",
    });
    await writeConfig(join(root, "repostack.yaml"), config);

    await snapshot(root, config);
    const updatedConfig = await loadConfig(root);

    expect(updatedConfig.repos[0].source).toBe("git@github.com:custom/evt.git");
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

    await pull(root, config);
    const rows = await listRepos(root, config);

    expect(rows[0].name).toBe("evt");
  });

  it("clones a missing repo from the lock source when config source is stale", async () => {
    const root = await createTempDir("repostack-download-lock-");
    const sourceRoot = await createTempDir("repostack-remote-lock-");
    const repo = await createRepoFixture(sourceRoot, "evt-src", "@hornjs/evt");
    const bare = join(sourceRoot, "evt.git");

    await execFileAsync("git", ["clone", "--bare", repo, bare]);

    const config = createInitialConfig();
    config.repos.push({
      name: "evt",
      path: "evt",
      source: "evt",
      branch: "master",
    });
    await writeConfig(join(root, "repostack.yaml"), config);
    await writeFile(
      join(root, "repostack.lock.yaml"),
      YAML.stringify({
        version: 1,
        repos: {
          evt: {
            path: "evt",
            source: bare,
            branch: "master",
            revision: await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo }).then(({ stdout }) => stdout.trim()),
          },
        },
      }),
      "utf8",
    );

    await pull(root, config);
    const rows = await listRepos(root, {
      ...config,
      repos: [{ ...config.repos[0], source: bare }],
    });

    expect(rows[0].name).toBe("evt");
  });

  it("prefers an explicit config source over the lock source during pull", async () => {
    const root = await createTempDir("repostack-download-explicit-");
    const sourceRoot = await createTempDir("repostack-remote-explicit-");
    const primaryRepo = await createRepoFixture(sourceRoot, "evt-primary", "@hornjs/evt-primary");
    const fallbackRepo = await createRepoFixture(sourceRoot, "evt-fallback", "@hornjs/evt-fallback");
    const primaryBare = join(sourceRoot, "evt-primary.git");
    const fallbackBare = join(sourceRoot, "evt-fallback.git");

    await execFileAsync("git", ["clone", "--bare", primaryRepo, primaryBare]);
    await execFileAsync("git", ["clone", "--bare", fallbackRepo, fallbackBare]);

    const config = createInitialConfig();
    config.repos.push({
      name: "evt",
      path: "evt",
      source: primaryBare,
      branch: "master",
    });
    await writeConfig(join(root, "repostack.yaml"), config);
    await writeFile(
      join(root, "repostack.lock.yaml"),
      YAML.stringify({
        version: 1,
        repos: {
          evt: {
            path: "evt",
            source: fallbackBare,
            branch: "master",
            revision: await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: fallbackRepo }).then(({ stdout }) => stdout.trim()),
          },
        },
      }),
      "utf8",
    );

    await pull(root, config);
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], {
      cwd: join(root, "evt"),
    });

    expect(stdout.trim()).toBe(primaryBare);
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

    const lock = await sync(root, config, { yes: true });

    expect(lock.repos.evt.revision).toMatch(/[0-9a-f]{7,40}/);
  });
});
