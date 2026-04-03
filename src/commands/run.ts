import { join } from "node:path";
import { resolveRepoSelection, resolveShell } from "../config";
import { execShellCommand } from "../run";
import type { RepostackConfig } from "../types";

export type RunOptions = {
  command: string;
  repos?: string[];
  view?: string;
  tags?: string[];
  concurrency: number;
  continueOnError: boolean;
  debug?: boolean;
  onDebug?: (message: string) => void;
  onRepoStart?: (repo: string) => void;
  onRepoDone?: (repo: string, exitCode: number) => void;
};

export async function run(root: string, config: RepostackConfig, options: RunOptions) {
  const repos = resolveRepoSelection(config, {
    repos: options.repos,
    view: options.view,
    tags: options.tags,
  });

  const results: Array<{
    repo: string;
    stdout: string;
    stderr: string;
    exitCode: number;
  } | undefined> = Array.from({ length: repos.length });
  const workerCount = Math.max(1, Math.min(options.concurrency, repos.length || 1));
  let nextIndex = 0;
  let stopped = false;

  const shell = resolveShell(config.settings.shell);
  options.onDebug?.(
    `selected repos: ${repos.map((repo) => repo.name).join(", ") || "(none)"}; command: ${options.command}; concurrency: ${workerCount}; shell: ${shell}`,
  );

  async function runWorker() {
    while (!stopped) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= repos.length) {
        return;
      }

      const repo = repos[currentIndex];
      options.onDebug?.(
        `run ${repo.name}: cwd=${join(root, repo.path)} command=${options.command}`,
      );
      options.onRepoStart?.(repo.name);
      const execution = await execShellCommand(
        join(root, repo.path),
        options.command,
        shell,
      );
      options.onRepoDone?.(repo.name, execution.exitCode);

      results[currentIndex] = {
        repo: repo.name,
        stdout: execution.stdout,
        stderr: execution.stderr,
        exitCode: execution.exitCode,
      };
      options.onDebug?.(`run ${repo.name}: exit=${execution.exitCode}`);

      if (!options.continueOnError && execution.exitCode !== 0) {
        stopped = true;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  return {
    results: results.filter((item): item is NonNullable<typeof item> => item !== undefined),
  };
}
