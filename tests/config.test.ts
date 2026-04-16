import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { createTempDir, createRepoFixture, writeJson } from "./helpers";
import {
  createInitialConfig,
  loadConfig,
  removeRepo,
  resolveRepoSelection,
  useRepo,
  writeConfig,
} from "../src/shared/config";
import { init } from "../src/commands/init";
import { use } from "../src/commands/use";
import { remove } from "../src/commands/remove";

const execFileAsync = promisify(execFile);

describe("config", () => {
  it("creates a default config file", async () => {
    const root = await createTempDir("repostack-config-");
    const config = createInitialConfig();

    await writeConfig(join(root, "repostack.yaml"), config);
    const loaded = await loadConfig(root);

    expect(loaded.version).toBe(1);
    expect(loaded.repos).toEqual([]);
  });

  it("adds a repo entry from a local path", async () => {
    const root = await createTempDir("repostack-use-");
    await createRepoFixture(root, "evt", "@hornjs/evt");
    const config = createInitialConfig();

    const next = await useRepo(config, {
      cwd: root,
      path: "evt",
    });

    expect(next.repos).toHaveLength(1);
    expect(next.repos[0]).toMatchObject({
      name: "evt",
      path: "evt",
    });
  });

  it("resolves repo selection from a named view", async () => {
    const config = {
      version: 1 as const,
      settings: {
        shell: "zsh",
        concurrency: 4,
        continueOnError: false,
      },
      repos: [
        { name: "evt", path: "evt", source: "git@example.com/evt.git", branch: "main", tags: ["runtime"] },
        { name: "fest", path: "fest", source: "git@example.com/fest.git", branch: "main", tags: ["runtime", "server"] },
      ],
      views: {
        runtime: {
          tags: ["runtime"],
        },
      },
      scripts: {},
    };

    const selected = resolveRepoSelection(config, { views: ["runtime"] });

    expect(selected.map((repo) => repo.name)).toEqual(["evt", "fest"]);
  });

  it("initializes repostack.yaml when missing", async () => {
    const root = await createTempDir("repostack-init-");

    await init(root);
    const loaded = await loadConfig(root);

    expect(loaded.version).toBe(1);
    expect(loaded.repos).toEqual([]);
  });

  it("writes a repo entry through use command", async () => {
    const root = await createTempDir("repostack-use-command-");
    await createRepoFixture(root, "evt", "@hornjs/evt");
    await writeConfig(join(root, "repostack.yaml"), createInitialConfig());

    await use(root, "evt", { yes: true });
    const loaded = await loadConfig(root);

    expect(loaded.repos).toHaveLength(1);
    expect(loaded.repos[0]).toMatchObject({
      name: "evt",
      path: "evt",
    });
  });

  it("uses the git remote URL as the source when registering a local repo", async () => {
    const root = await createTempDir("repostack-use-remote-source-");
    const repo = await createRepoFixture(root, "evt", "@hornjs/evt");
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:hornjs/evt.git"], {
      cwd: repo,
    });
    await writeConfig(join(root, "repostack.yaml"), createInitialConfig());

    await use(root, "evt", { yes: true });
    const loaded = await loadConfig(root);

    expect(loaded.repos[0].source).toBe("git@github.com:hornjs/evt.git");
  });

  it("auto-initializes git repo with --yes flag", async () => {
    const root = await createTempDir("repostack-use-init-");
    await writeConfig(join(root, "repostack.yaml"), createInitialConfig());

    // Create a directory without git
    const repoDir = join(root, "newrepo");
    await mkdir(repoDir, { recursive: true });
    await writeJson(join(repoDir, "package.json"), { name: "newrepo", version: "0.0.0" });

    // Use --yes to auto-initialize
    await use(root, "newrepo", { yes: true });

    // Verify git was initialized
    const gitDir = join(repoDir, ".git");
    const gitExists = await access(gitDir).then(() => true).catch(() => false);
    expect(gitExists).toBe(true);

    const loaded = await loadConfig(root);
    expect(loaded.repos).toHaveLength(1);
    expect(loaded.repos[0].name).toBe("newrepo");
  });

  it("removes a repo from config", () => {
    const config = createInitialConfig();
    config.repos.push(
      { name: "evt", path: "evt", source: "git@example.com/evt.git", branch: "main" },
      { name: "fest", path: "fest", source: "git@example.com/fest.git", branch: "main" },
    );

    const next = removeRepo(config, "evt");

    expect(next.repos).toHaveLength(1);
    expect(next.repos[0].name).toBe("fest");
  });

  it("throws when removing non-existent repo", () => {
    const config = createInitialConfig();
    config.repos.push({ name: "evt", path: "evt", source: "git@example.com/evt.git", branch: "main" });

    expect(() => removeRepo(config, "nonexistent")).toThrow("Repo not found: nonexistent");
  });

  it("removes a repo through remove command", async () => {
    const root = await createTempDir("repostack-remove-command-");
    const config = createInitialConfig();
    config.repos.push({ name: "evt", path: "evt", source: "git@example.com/evt.git", branch: "main" });
    await writeConfig(join(root, "repostack.yaml"), config);

    await remove(root, "evt", { yes: true });
    const loaded = await loadConfig(root);

    expect(loaded.repos).toHaveLength(0);
  });
});
