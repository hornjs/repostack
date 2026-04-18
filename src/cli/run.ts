import { resolve } from "node:path";
import type { CAC } from "cac";
import { run } from "../commands/run";
import { loadConfigWithUser, resolveShell } from "../shared/config";
import { execShellCommand } from "../shared/run";
import type { CliContext } from "./types";

export function registerRun(cli: CAC, { logger, onExitCode }: CliContext): void {
  cli
    .command("run [script]", "Run a user-defined script")
    .option("--dir <path>", "Working directory for scripts with no scope (default: stack root)")
    .example("repostack run build")
    .example("repostack run deploy --dir ./packages/foo")
    .action(async (script: string | undefined, ...args: unknown[]) => {
      const opts = args[args.length - 1] as { dir?: string; "--"?: string[] };
      const extraArgs = opts["--"]?.join(" ");

      logger.debug(`command=run script=${script ?? "(none)"} dir=${opts.dir ?? "(root)"} extra=${extraArgs ?? "(none)"}`);

      const { config } = await loadConfigWithUser(process.cwd(), logger);

      if (!script) {
        const scripts = Object.keys(config.scripts);
        if (scripts.length === 0) {
          logger.error("No scripts defined. Add scripts to repostack.yaml.");
        } else {
          logger.warn("Missing script name. Available scripts:");
          for (const name of scripts) {
            logger.log(`  <cyan>${name}</cyan>  ${config.scripts[name].command}`);
          }
        }
        onExitCode(1);
        return;
      }

      const entry = config.scripts[script];
      if (!entry) {
        const available = Object.keys(config.scripts).join(", ") || "(none)";
        logger.error(`Unknown script: "${script}". Available: ${available}`);
        onExitCode(1);
        return;
      }

      const shell = resolveShell(config.settings.shell);
      const hasScope = entry.repos?.length || entry.views?.length || entry.tags?.length;
      const command = extraArgs ? `${entry.command} ${extraArgs}` : entry.command;

      if (opts.dir && hasScope) {
        logger.error("--dir cannot be used with scripts that have repos/views/tags scope.");
        onExitCode(1);
        return;
      }

      if (hasScope) {
        const result = await run({
          command,
          root: process.cwd(),
          config,
          logger,
          repos: entry.repos,
          views: entry.views,
          tags: entry.tags,
          concurrency: config.settings.concurrency,
          continueOnError: config.settings.continueOnError,
        });

        for (const item of result.results) {
          logger.log(`<cyan>== ${item.repo} ==</cyan>`);
          logger.log(item.stdout);
          if (item.stderr) {
            logger.log(item.stderr);
          }
          if (item.exitCode !== 0) {
            onExitCode(item.exitCode);
            return;
          }
        }
      } else {
        const cwd = opts.dir ? resolve(process.cwd(), opts.dir) : process.cwd();
        logger.debug(`run: executing in ${cwd}: ${command}`);
        const execution = await execShellCommand(cwd, command, shell);
        logger.log(execution.stdout);
        if (execution.stderr) {
          logger.log(execution.stderr);
        }
        if (execution.exitCode !== 0) {
          onExitCode(execution.exitCode);
        }
      }
    });
}
