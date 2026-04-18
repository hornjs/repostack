import { format } from "node:util";
import { cac, type CAC } from "cac";
import packageJson from "../../package.json";
import type { CliContext } from "./types";
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
import { Logger, type Options as LoggerOptions } from "logtra";

export type { CliContext };

async function withPatchedConsole<T>(
  logger: Logger,
  fn: () => Promise<T>,
): Promise<T> {
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalError = console.error;

  console.log = (...args: unknown[]) => { logger.log(format(...args)); };
  console.info = (...args: unknown[]) => { logger.info(format(...args)); };
  console.error = (...args: unknown[]) => { logger.error(format(...args)); };

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

export type MainOptions = LoggerOptions & {
  args?: string[];
};

export async function main({ args = [], ...options }: MainOptions): Promise<number> {
  const { stdout = process.stdout, stderr = process.stderr } = options;
  let exitCode = 0;
  const debug = options.debug ?? (args.includes("--debug") || args.includes("-d"));

  const logger = new Logger({
    ...options,
    debug,
    stripColorTags: options.stripColorTags ?? true,
    stdout,
    stderr,
  })

  const ctx: CliContext = {
    onExitCode: (code) => { exitCode = code; },
    logger,
  };

  const cli = createCLI(ctx);

  try {
    await withPatchedConsole(logger, async () => {
      cli.parse(["node", "repostack", ...args], { run: false });

      logger.debug(`argv=${JSON.stringify(args)} command=${cli.matchedCommandName ?? "(none)"}`);

      const firstArg = args[0];
      if (firstArg && !firstArg.startsWith("-")) {
        const knownCommands = cli.commands.map(c => c.name.split(" ")[0]);
        const inputCmd = firstArg.split(" ")[0];
        if (!knownCommands.includes(inputCmd)) {
          logger.error(`Unknown command: ${firstArg}`);
          logger.error("<dim>Run `repostack --help` for usage.</dim>", { colorable: false });
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
    logger.error(message);
    exitCode = 1;
  }

  return exitCode;
}
