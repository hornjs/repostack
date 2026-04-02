import { describe, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInitialConfig } from "../src/config";
import { runInRepos } from "../src/commands/run";
import { createRepoFixture, createTempDir } from "./helpers";

describe("run", () => {
  it("runs a command in each selected repo", async () => {
    const root = await createTempDir("repostack-run-");
    await createRepoFixture(root, "evt", "@hornjs/evt");
    await createRepoFixture(root, "fest", "@hornjs/fest");

    const config = createInitialConfig();
    config.repos.push(
      { name: "evt", path: "evt", source: "git@example.com/evt.git", branch: "main", tags: ["runtime"] },
      { name: "fest", path: "fest", source: "git@example.com/fest.git", branch: "main", tags: ["runtime", "server"] },
    );

    await writeFile(join(root, "evt", "FLAG"), "evt\n");
    await writeFile(join(root, "fest", "FLAG"), "fest\n");

    const result = await runInRepos(root, config, {
      command: "node -e \"process.stdout.write(require('node:fs').readFileSync('FLAG', 'utf8'))\"",
      tags: ["runtime"],
      continueOnError: false,
      concurrency: 1,
    });

    expect(result.results).toHaveLength(2);
    expect(result.results.map((item) => item.stdout.trim())).toEqual(["evt", "fest"]);
  });

  it("runs commands with the configured concurrency", async () => {
    const root = await createTempDir("repostack-run-concurrency-");
    await createRepoFixture(root, "evt", "@hornjs/evt");
    await createRepoFixture(root, "fest", "@hornjs/fest");

    const config = createInitialConfig();
    config.repos.push(
      { name: "evt", path: "evt", source: "git@example.com/evt.git", branch: "main", tags: ["runtime"] },
      { name: "fest", path: "fest", source: "git@example.com/fest.git", branch: "main", tags: ["runtime"] },
    );

    const logFile = join(root, "events.log");
    const command = `node -e 'const fs = require("node:fs"); const path = require("node:path"); const logFile = ${JSON.stringify(logFile)}; const name = path.basename(process.cwd()); fs.appendFileSync(logFile, "start:" + name + "\\n"); setTimeout(() => { fs.appendFileSync(logFile, "end:" + name + "\\n"); }, 200);'`;

    await runInRepos(root, config, {
      command,
      tags: ["runtime"],
      continueOnError: false,
      concurrency: 2,
    });

    const events = (await readFile(logFile, "utf8")).trim().split("\n");
    expect(events).toHaveLength(4);
    expect([...events.slice(0, 2)].sort()).toEqual(["start:evt", "start:fest"]);
    expect([...events.slice(2)].sort()).toEqual(["end:evt", "end:fest"]);
  });
});
