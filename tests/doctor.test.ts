import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { doctor } from "../src/commands/doctor";
import { Logger } from "logtra";
import { createTempDir, createWriter } from "./helpers";

describe("doctor", () => {
  it("warns about unsupported config keys", async () => {
    const root = await createTempDir("repostack-doctor-unsupported-");
    await writeFile(
      join(root, "repostack.yaml"),
      [
        "version: 1",
        "future: true",
        "settings:",
        "  concurrency: 4",
        "  continueOnError: false",
        "  retry: 2",
        "  shell:",
        "    macos: /bin/zsh",
        "    freebsd: /bin/sh",
        "repos: []",
        "views:",
        "  runtime:",
        "    tags: []",
        "    layout: grid",
        "scripts:",
        "  build:",
        "    command: echo ok",
        "    cwd: .",
        "users:",
        "  bob:",
        "    theme: dark",
        "    repos:",
        "      evt:",
        "        path: evt",
        "        local: true",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(join(root, ".repostackrc"), "user=bob\n", "utf8");

    const stdout = createWriter();
    const stderr = createWriter();
    const reporter = new Logger({ stdout: stdout.stream, stderr: stderr.stream });

    await doctor({ root, logger: reporter });

    const output = stdout.chunks.join("");
    expect(output).toContain("Unsupported config key 'config.future' will be ignored");
    expect(output).toContain("Unsupported config key 'config.settings.retry' will be ignored");
    expect(output).toContain("Unsupported config key 'config.settings.shell.freebsd' will be ignored");
    expect(output).toContain("Unsupported config key 'config.views.runtime.layout' will be ignored");
    expect(output).toContain("Unsupported config key 'config.scripts.build.cwd' will be ignored");
    expect(output).toContain("Unsupported config key 'config.users.bob.theme' will be ignored");
    expect(output).toContain("Unsupported config key 'config.users.bob.repos.evt.local' will be ignored");
    expect(stderr.chunks.join("")).toBe("");
  });

  it("tracks doctor issues under their owning step", async () => {
    const root = await createTempDir("repostack-doctor-step-scope-");
    await writeFile(
      join(root, "repostack.yaml"),
      [
        "version: 1",
        "future: true",
        "repos: []",
        "",
      ].join("\n"),
      "utf8",
    );

    const stdout = createWriter();
    const stderr = createWriter();
    const reporter = new Logger({
      stdout: stdout.stream,
      stderr: stderr.stream,
      stripColorTags: true,
    });

    await doctor({ root, logger: reporter });

    expect(reporter.issuer.issues).toContainEqual({
      step: "Config",
      issues: [
        {
          type: "warning",
          message: "Unsupported config key 'config.future' will be ignored",
        },
      ],
    });
    expect(stdout.chunks.join("")).toContain("Config");
    expect(stderr.chunks.join("")).toBe("");
  });
});
