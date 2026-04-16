import type { CAC } from "cac";
import { pull } from "../commands/pull";
import { loadConfigWithUser } from "../shared/config";
import type { CliContext } from "./context";

export function registerPull(cli: CAC, ctx: CliContext): void {
  const { stdout, stderr, colors, debug } = ctx;

  cli
    .command("pull", "Clone repos that are declared but missing locally")
    .action(async () => {
      debug("command=pull");
      const { config } = await loadConfigWithUser(process.cwd(), { onDebug: debug });
      await pull(process.cwd(), config, {
        onDebug: debug,
        concurrency: config.settings.concurrency,
        onRepoStart: (repoName) => {
          stdout.write(`${colors.cyan(`Starting clone: ${repoName}`)}\n`);
        },
        onRepoDone: (repoName, attempts) => {
          const attemptSuffix = attempts > 1 ? ` (${attempts} attempts)` : "";
          stdout.write(`${colors.green(`Finished clone: ${repoName}${attemptSuffix}`)}\n`);
        },
        onRepoRetry: (repoName, attempt) => {
          stdout.write(`${colors.yellow(`Retrying clone (${attempt}/3): ${repoName}`)}\n`);
        },
        onRepoFailed: (repoName, attempts, error) => {
          stderr.write(`${colors.red(`Clone failed after ${attempts} attempts: ${repoName}`)}\n`);
          stderr.write(`${colors.dim(error.message)}\n`);
        },
      });
      stdout.write(`${colors.green("Pulled missing repos")}\n`);
    });
}
