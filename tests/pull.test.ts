import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInitialConfig } from "../src/config";
import { pull } from "../src/commands/pull";
import { createTempDir } from "./helpers";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("pull", () => {
  it("retries failed clones up to 3 times and emits retry events", async () => {
    const root = await createTempDir("repostack-pull-retry-");
    const config = createInitialConfig();
    config.repos.push({
      name: "evt",
      path: "evt",
      source: "git@example.com/evt.git",
      branch: "main",
    });

    const retries: number[] = [];
    let attempts = 0;

    await pull(root, config, {
      clone: async (_source, destination) => {
        attempts += 1;

        if (attempts > 1) {
          expect(await exists(destination)).toBe(false);
        }

        await mkdir(destination, { recursive: true });
        await writeFile(join(destination, `attempt-${attempts}.txt`), String(attempts), "utf8");

        if (attempts < 3) {
          throw new Error(`clone failed on attempt ${attempts}`);
        }
      },
      onRepoRetry: (_repo, attempt) => {
        retries.push(attempt);
      },
    });

    expect(attempts).toBe(3);
    expect(retries).toEqual([2, 3]);
    expect(await exists(join(root, "evt", "attempt-3.txt"))).toBe(true);
  });

  it("clones missing repos with configured concurrency", async () => {
    const root = await createTempDir("repostack-pull-concurrency-");
    const config = createInitialConfig();
    config.settings.concurrency = 2;
    config.repos.push(
      { name: "evt", path: "evt", source: "git@example.com/evt.git", branch: "main" },
      { name: "fest", path: "fest", source: "git@example.com/fest.git", branch: "main" },
    );

    const events: string[] = [];

    await pull(root, config, {
      clone: async (_source, destination) => {
        const repo = destination.split("/").pop()!;
        events.push(`start:${repo}`);
        await wait(100);
        await mkdir(destination, { recursive: true });
        events.push(`end:${repo}`);
      },
    });

    expect([...events.slice(0, 2)].sort()).toEqual(["start:evt", "start:fest"]);
    expect([...events.slice(2)].sort()).toEqual(["end:evt", "end:fest"]);
  });
});
