import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInitialConfig } from "../src/shared/config";
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
  it("retries failed clones up to 3 times", async () => {
    const root = await createTempDir("repostack-pull-retry-");
    const config = createInitialConfig();
    config.repos.push({
      name: "evt",
      path: "evt",
      source: "git@example.com/evt.git",
      branch: "main",
    });

    let attempts = 0;

    await pull({
      root,
      config,
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
    });

    expect(attempts).toBe(3);
    expect(await exists(join(root, "evt", "attempt-3.txt"))).toBe(true);
  });

  it("updates spinner messages while retrying clones", async () => {
    const root = await createTempDir("repostack-pull-spinner-");
    const config = createInitialConfig();
    config.repos.push({
      name: "evt",
      path: "evt",
      source: "git@example.com/evt.git",
      branch: "main",
    });

    const spinnerEvents: string[] = [];
    let attempts = 0;
    const logger = {
      debug() {},
      warn() {},
      spin(message: string) {
        spinnerEvents.push(`start:${message}`);
        return {
          update(nextMessage: string) {
            spinnerEvents.push(`update:${nextMessage}`);
          },
          done(message?: string) {
            spinnerEvents.push(`done:${message ?? ""}`);
          },
          fail(message: string) {
            spinnerEvents.push(`fail:${message}`);
          },
        };
      },
    };

    await pull({
      root,
      config,
      logger: logger as never,
      clone: async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error(`clone failed on attempt ${attempts}`);
        }
      },
    });

    expect(spinnerEvents).toEqual([
      "start:Cloning evt...",
      "update:Retrying evt... (2/3)",
      "update:Cloning evt... (2/3)",
      "update:Retrying evt... (3/3)",
      "update:Cloning evt... (3/3)",
      "done:Cloned evt (3 attempts)",
    ]);
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

    await pull({
      root,
      config,
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
