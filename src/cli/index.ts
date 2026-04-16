import { format } from "node:util";
import { cac, type CAC } from "cac";
import pico from "picocolors";
import packageJson from "../../package.json";
import { type MainOptions, type CliContext } from "./context";
import { registerInit } from "./init";
import { registerUse } from "./use";
import { registerRemove } from "./remove";
import { registerDoctor } from "./doctor";
import { registerWhoami } from "./whoami";
import { registerUsers } from "./users";
import { registerPull } from "./pull";
import { registerSync } from "./sync";
import { registerList } from "./list";
import { registerRun } from "./run";
import { registerSnapshot } from "./snapshot";

export type { MainOptions, CliContext };

function createColors(
  stdout: MainOptions["stdout"],
  stderr: MainOptions["stderr"],
): ReturnType<typeof pico.createColors> {
  const enabled = Boolean(stdout.isTTY || stderr.isTTY);
  return pico.createColors(enabled);
}

async function withPatchedConsole<T>(
  stdout: MainOptions["stdout"],
  stderr: MainOptions["stderr"],
  fn: () => Promise<T>,
): Promise<T> {
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalError = console.error;

  console.log = (...args: unknown[]) => { stdout.write(`${format(...args)}\n`); };
  console.info = (...args: unknown[]) => { stdout.write(`${format(...args)}\n`); };
  console.error = (...args: unknown[]) => { stderr.write(`${format(...args)}\n`); };

  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.info = originalInfo;
    console.error = originalError;
  }
}

function createCLI(ctx: CliContext): CAC {
  const cli = cac("repostack");
  cli.option("-d, --debug", "Display orchestration debug output");
  cli.version(packageJson.version);
  cli.help();

  registerInit(cli, ctx);
  registerUse(cli, ctx);
  registerRemove(cli, ctx);
  registerDoctor(cli, ctx);
  registerWhoami(cli, ctx);
  registerUsers(cli, ctx);
  registerPull(cli, ctx);
  registerSync(cli, ctx);
  registerList(cli, ctx);
  registerRun(cli, ctx);
  registerSnapshot(cli, ctx);

  return cli;
}

export async function main({ args, stdout, stderr }: MainOptions): Promise<number> {
  const colors = createColors(stdout, stderr);
  let exitCode = 0;

  const cli = createCLI({
    stdout,
    stderr,
    colors,
    onExitCode: (code) => { exitCode = code; },
    debug: (msg: string) => {
      if (cli.options.debug) {
        stderr.write(`${colors.dim(`[debug] ${msg}`)}\n`);
      }
    },
  });

  try {
    await withPatchedConsole(stdout, stderr, async () => {
      cli.parse(["node", "repostack", ...args], { run: false });

      const debug = (msg: string) => {
        if (cli.options.debug) {
          stderr.write(`${colors.dim(`[debug] ${msg}`)}\n`);
        }
      };
      debug(`argv=${JSON.stringify(args)} command=${cli.matchedCommandName ?? "(none)"}`);

      const firstArg = args[0];
      if (firstArg && !firstArg.startsWith("-")) {
        const knownCommands = cli.commands.map(c => c.name.split(" ")[0]);
        const inputCmd = firstArg.split(" ")[0];
        if (!knownCommands.includes(inputCmd)) {
          stderr.write(`${colors.red(`Unknown command: ${firstArg}`)}\n`);
          stderr.write(`${colors.dim("Run `repostack --help` for usage.")}\n`);
          exitCode = 1;
          return;
        }
      }

      if (cli.options.help || !firstArg) {
        if (cli.matchedCommand) {
          cli.matchedCommand.outputHelp();
        } else {
          cli.outputHelp();
        }
        return;
      }

      await cli.runMatchedCommand();
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`${colors.red(message)}\n`);
    exitCode = 1;
  }

  return exitCode;
}
