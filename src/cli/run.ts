import { resolve } from "node:path";
import type { CAC } from "cac";
import { spinner } from "@clack/prompts";
import { run } from "../commands/run";
import { loadConfigWithUser, resolveShell } from "../shared/config";
import { execShellCommand } from "../shared/run";
import type { CliContext } from "./context";

export function registerRun(cli: CAC, ctx: CliContext): void {
  const { stdout, stderr, colors, onExitCode, debug } = ctx;

  cli
    .command("run [script]", "Run a user-defined script")
    .option("--dir <path>", "Working directory for scripts with no scope (default: stack root)")
    .example("repostack run build")
    .example("repostack run deploy --dir ./packages/foo")
    .action(async (script: string | undefined, ...args: unknown[]) => {
      const opts = args[args.length - 1] as { dir?: string; "--"?: string[] };
      const extraArgs = opts["--"]?.join(" ");
      debug(`command=run script=${script ?? "(none)"} dir=${opts.dir ?? "(root)"} extra=${extraArgs ?? "(none)"}`);

      const { config } = await loadConfigWithUser(process.cwd(), { onDebug: debug });

      if (!script) {
        const scripts = Object.keys(config.scripts);
        if (scripts.length === 0) {
          stderr.write(`${colors.red("No scripts defined. Add scripts to repostack.yaml.")}\n`);
        } else {
          stderr.write(`${colors.yellow("Missing script name. Available scripts:")}\n`);
          for (const name of scripts) {
            stderr.write(`  ${colors.cyan(name)}  ${config.scripts[name].command}\n`);
          }
        }
        onExitCode(1);
        return;
      }

      const entry = config.scripts[script];
      if (!entry) {
        const available = Object.keys(config.scripts).join(", ") || "(none)";
        stderr.write(`${colors.red(`Unknown script: "${script}". Available: ${available}`)}\n`);
        onExitCode(1);
        return;
      }

      const shell = resolveShell(config.settings.shell);
      const hasScope = entry.repos?.length || entry.views?.length || entry.tags?.length;
      const command = extraArgs ? `${entry.command} ${extraArgs}` : entry.command;

      if (opts.dir && hasScope) {
        stderr.write(`${colors.red("--dir cannot be used with scripts that have repos/views/tags scope.")}\n`);
        onExitCode(1);
        return;
      }

      if (hasScope) {
        const spin = stdout.isTTY ? spinner() : null;
        spin?.start("Preparing...");

        const result = await run(process.cwd(), config, {
          command,
          repos: entry.repos,
          views: entry.views,
          tags: entry.tags,
          concurrency: config.settings.concurrency,
          continueOnError: config.settings.continueOnError,
          onDebug: debug,
          onRepoStart: (repoName) => {
            spin?.message(`Running in ${repoName}...`);
          },
          onRepoDone: (repoName, exitCode) => {
            const status = exitCode === 0 ? colors.green("done") : colors.red("failed");
            spin?.message(`${repoName}: ${status}`);
          },
        });

        spin?.stop(`Finished running in ${result.results.length} repo(s)`);

        for (const item of result.results) {
          stdout.write(`${colors.cyan(`== ${item.repo} ==`)}\n`);
          stdout.write(item.stdout);
          if (item.stderr) {
            stderr.write(item.stderr);
          }
          if (item.exitCode !== 0) {
            onExitCode(item.exitCode);
            return;
          }
        }
      } else {
        const cwd = opts.dir ? resolve(process.cwd(), opts.dir) : process.cwd();
        debug(`run: executing in ${cwd}: ${command}`);
        const execution = await execShellCommand(cwd, command, shell);
        stdout.write(execution.stdout);
        if (execution.stderr) {
          stderr.write(execution.stderr);
        }
        if (execution.exitCode !== 0) {
          onExitCode(execution.exitCode);
        }
      }
    });
}
