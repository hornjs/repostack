import { join } from "node:path";
import { resolveRepoSelection, resolveShell } from "../shared/config";
import { execShellCommand } from "../shared/run";
import type { RepostackConfig } from "../shared/types";
import type { Logger } from "logtra";

export type RunOptions = {
  command: string;
  root: string;
  config: RepostackConfig;
  logger?: Logger;
  repos?: string[];
  views?: string[];
  tags?: string[];
  concurrency: number;
  continueOnError: boolean;
};

export type RunResult = {
  results: Array<{
    repo: string;
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
};

export async function run({
  root,
  config,
  logger,
  ...options
}: RunOptions): Promise<RunResult> {
  const repos = resolveRepoSelection(config, {
    repos: options.repos,
    views: options.views,
    tags: options.tags,
  });

  const shell = resolveShell(config.settings.shell);
  logger?.debug(
    `selected repos: ${repos.map((r) => r.name).join(", ") || "(none)"}; command: ${options.command}; concurrency: ${options.concurrency}; shell: ${shell}`,
  );

  const results: Array<RunResult["results"][number] | undefined> = Array.from({ length: repos.length });
  const workerCount = Math.max(1, Math.min(options.concurrency, repos.length || 1));
  let nextIndex = 0;
  let stopped = false;

  async function runWorker() {
    while (!stopped) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= repos.length) return;

      const repo = repos[currentIndex];
      logger?.debug(`run ${repo.name}: cwd=${join(root, repo.path)} command=${options.command}`);

      const spin = logger?.spin(`Running ${repo.name}...`);
      spin?.update(`Running ${repo.name}: ${options.command}`);
      const execution = await execShellCommand(join(root, repo.path), options.command, shell);
      const exitCode = execution.exitCode;

      if (exitCode === 0) {
        spin?.done(`${repo.name}: done`);
      } else {
        spin?.update(`${repo.name}: command failed (exit ${exitCode})`);
        spin?.fail(`${repo.name}: failed (exit ${exitCode})`);
      }

      logger?.debug(`run ${repo.name}: exit=${exitCode}`);
      results[currentIndex] = {
        repo: repo.name,
        stdout: execution.stdout,
        stderr: execution.stderr,
        exitCode,
      };

      if (!options.continueOnError && exitCode !== 0) {
        stopped = true;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  return {
    results: results.filter((item): item is NonNullable<typeof item> => item !== undefined),
  };
}
