import { format } from "node:util";
import { isCancel, multiselect, select, spinner } from "@clack/prompts";
import { cac, type CAC } from "cac";
import pico from "picocolors";
import packageJson from "../package.json";
import { pull } from "./commands/pull";
import { init } from "./commands/init";
import { list } from "./commands/list";
import { run } from "./commands/run";
import { snapshot } from "./commands/snapshot";
import { sync } from "./commands/sync";
import { use } from "./commands/use";
import { remove } from "./commands/remove";
import { doctor } from "./commands/doctor";
import { listUsers, setUser, unsetUser } from "./commands/users";
import { loadConfigWithUser, loadConfig, repostackrcExists } from "./config";

export type MainOptions = {
  args: string[];
  stdout: Pick<NodeJS.WriteStream, "write"> & Partial<Pick<NodeJS.WriteStream, "isTTY">>;
  stderr: Pick<NodeJS.WriteStream, "write"> & Partial<Pick<NodeJS.WriteStream, "isTTY">>;
};

function splitCommaList(value?: string): string[] | undefined {
  if (!value) return undefined;
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  return [...new Set(items)];
}

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

  console.log = (...args: unknown[]) => {
    stdout.write(`${format(...args)}\n`);
  };
  console.info = (...args: unknown[]) => {
    stdout.write(`${format(...args)}\n`);
  };
  console.error = (...args: unknown[]) => {
    stderr.write(`${format(...args)}\n`);
  };

  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.info = originalInfo;
    console.error = originalError;
  }
}

// Interactive users mode (simplified text-based)
async function runInteractiveUsers(
  root: string,
  options: {
    stdout: MainOptions["stdout"];
    stderr: MainOptions["stderr"];
    colors: ReturnType<typeof pico.createColors>;
    debug: (msg: string) => void;
  }
): Promise<void> {
  const { stdout, colors, debug } = options;

  const baseConfig = await loadConfig(root);
  const hasUsers = baseConfig.users && Object.keys(baseConfig.users).length > 0;
  const rcExists = await repostackrcExists(root);
  const currentUser = rcExists ? await (await import("./config")).loadRepostackrc(root) : null;

  debug(`interactive users: hasUsers=${hasUsers}, currentUser=${currentUser}`);

  if (!hasUsers) {
    stdout.write(`${colors.yellow("No users defined in this stack.")}\n`);
    stdout.write(`\nTo add a user, edit repostack.yaml and add:\n`);
    stdout.write(`  users:\n`);
    stdout.write(`    alice:\n`);
    stdout.write(`      repos: {}\n`);
    return;
  }

  const userNames = Object.keys(baseConfig.users!);

  if (currentUser) {
    stdout.write(`${colors.green(`Current user:`)} ${currentUser}\n`);
  } else {
    stdout.write(`${colors.dim("No user selected.")}\n`);
  }

  stdout.write(`\n${colors.dim("Available users:")} ${userNames.join(", ")}\n`);
  stdout.write(`\nCommands:\n`);
  stdout.write(`  repostack whoami               Show current user\n`);
  stdout.write(`  repostack users ls             List users\n`);
  stdout.write(`  repostack users su <name>      Switch to user\n`);
  stdout.write(`  repostack users add <name>     Add user (edit config)\n`);
  stdout.write(`  repostack users rm             Unset user\n`);
}

// Create CLI instance with all commands registered
function createCLI(options: {
  stdout: MainOptions["stdout"];
  stderr: MainOptions["stderr"];
  colors: ReturnType<typeof pico.createColors>;
  onExitCode: (code: number) => void;
  onDebug: (msg: string) => void;
}): CAC {
  const { stdout, stderr, colors, onExitCode, onDebug } = options;
  const cli = cac("repostack");

  cli.option("-d, --debug", "Display orchestration debug output");
  cli.version(packageJson.version);
  cli.help();

  const debug = onDebug;

  // Init command
  cli
    .command("init", "Initialize repostack.yaml in the current directory")
    .option("-y, --yes", "Auto-initialize git repo if not exists")
    .action(async (opts?: { yes?: boolean }) => {
      debug(`command=init yes=${opts?.yes ?? false}`);
      const result = await init(process.cwd(), { onDebug: debug, yes: opts?.yes });
      if (result.configCreated) {
        stdout.write(`${colors.green("Initialized repostack.yaml")}\n`);
      } else {
        stdout.write(`${colors.yellow("repostack.yaml already exists")}\n`);
      }
      if (result.gitInitialized) {
        stdout.write(`${colors.green("Initialized git repository")}\n`);
      }
      if (result.gitignoreUpdated) {
        stdout.write(`${colors.green("Updated .gitignore with .repostackrc")}\n`);
      }
    });

  // Use command
  cli
    .command("use [path]", "Register a repo in the current stack")
    .option("-y, --yes", "Skip confirmation prompts and auto-initialize")
    .action(async (repoPath?: string, opts?: { yes?: boolean }) => {
      if (!repoPath) {
        stderr.write(`${colors.red("Missing repo path for `repostack use`.")}\n`);
        onExitCode(1);
        return;
      }
      debug(`command=use repoPath=${repoPath} yes=${opts?.yes ?? false}`);
      await use(process.cwd(), repoPath, { yes: opts?.yes, onDebug: debug });
      stdout.write(`${colors.green("Added repo:")} ${repoPath}\n`);
    });

  // Remove command
  cli
    .command("remove <name>", "Remove a repo from the current stack")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (repoName?: string, opts?: { yes?: boolean }) => {
      debug(`command=remove repoName=${repoName} yes=${opts?.yes ?? false}`);
      await remove(process.cwd(), repoName!, { yes: opts?.yes, onDebug: debug });
      stdout.write(`${colors.green("Removed repo:")} ${repoName}\n`);
    });

  // Doctor command
  cli
    .command("doctor", "Diagnose stack configuration and health")
    .action(async () => {
      debug("command=doctor");
      const result = await doctor(process.cwd(), { onDebug: debug });

      for (const issue of result.issues) {
        switch (issue.type) {
          case "error":
            stderr.write(`${colors.red("✗")} ${issue.message}\n`);
            break;
          case "warning":
            stdout.write(`${colors.yellow("⚠")} ${issue.message}\n`);
            break;
          case "info":
            stdout.write(`${colors.green("✓")} ${issue.message}\n`);
            break;
        }
      }

      if (result.hasErrors) {
        onExitCode(1);
        stderr.write(`\n${colors.red("Found errors. Please fix them above.")}\n`);
      } else if (result.hasWarnings) {
        stdout.write(`\n${colors.yellow("Found warnings. Review them above.")}\n`);
      } else {
        stdout.write(`\n${colors.green("All checks passed!")}\n`);
      }
    });

  // Whoami command
  cli
    .command("whoami", "Show the current user")
    .action(async () => {
      debug("command=whoami");
      const { current } = await listUsers(process.cwd());
      if (current) {
        stdout.write(`${current}\n`);
      } else {
        stdout.write(`${colors.dim("(no user selected)")}\n`);
      }
    });

  // Users command
  cli
    .command("users [command] [name]", "Manage user configuration for this stack")
    .example("repostack users             # Interactive mode")
    .example("repostack users ls          # List users")
    .example("repostack users su alice    # Switch to user")
    .example("repostack users add bob     # Add user")
    .example("repostack users rm          # Unset user")
    .action(async (command?: string, name?: string) => {
      debug(`command=users subcommand=${command ?? "(interactive)"}`);
      const cwd = process.cwd();

      if (!command) {
        await runInteractiveUsers(cwd, { stdout, stderr, colors, debug });
        return;
      }

      switch (command) {
        case "ls": {
          const { users } = await listUsers(cwd);
          if (users.length === 0) {
            stdout.write(`${colors.dim("No users defined in this stack.")}\n`);
          } else {
            stdout.write(`Available users: ${users.join(", ")}\n`);
          }
          break;
        }

        case "su": {
          if (!name) {
            stderr.write(`${colors.red("Missing user name. Usage: repostack users su <name>")}\n`);
            onExitCode(1);
            return;
          }
          await setUser(cwd, name);
          stdout.write(`${colors.green(`Switched to user: ${name}`)}\n`);
          break;
        }

        case "add": {
          if (!name) {
            stderr.write(`${colors.red("Missing user name. Usage: repostack users add <name>")}\n`);
            onExitCode(1);
            return;
          }
          stderr.write(`${colors.yellow("Not implemented yet. Please edit repostack.yaml manually.")}\n`);
          onExitCode(1);
          break;
        }

        case "rm":
        case "unset": {
          await unsetUser(cwd);
          stdout.write(`${colors.green("Unset user. Using default configuration.")}\n`);
          break;
        }

        default: {
          stderr.write(`${colors.red(`Unknown users command: ${command}`)}\n`);
          stderr.write(`${colors.dim("Available: ls, su, add, rm")}\n`);
          onExitCode(1);
        }
      }
    });

  // Pull command
  cli
    .command("pull", "Clone repos that are declared but missing locally")
    .action(async () => {
      debug("command=pull");
      const { config } = await loadConfigWithUser(process.cwd(), { onDebug: debug });
      await pull(process.cwd(), config, { onDebug: debug });
      stdout.write(`${colors.green("Pulled missing repos")}\n`);
    });

  // Sync command
  cli
    .command("sync", "Fetch and checkout revisions from the current lock file")
    .option("-y, --yes", "Skip confirmation prompts for uncommitted changes")
    .action(async (opts?: { yes?: boolean }) => {
      debug("command=sync");
      const { config } = await loadConfigWithUser(process.cwd(), { onDebug: debug });
      await sync(process.cwd(), config, { onDebug: debug, yes: opts?.yes });
      stdout.write(`${colors.green("Synchronized stack")}\n`);
    });

  // List command
  cli
    .command("list", "Show the current branch, revision, and dirty state for each repo")
    .action(async () => {
      debug("command=list");
      const { config, user } = await loadConfigWithUser(process.cwd(), { onDebug: debug });
      if (user) {
        stdout.write(`${colors.dim(`[user: ${user}]`)}\n`);
      }
      const rows = await list(process.cwd(), config, undefined, { onDebug: debug });

      for (const row of rows) {
        const status = row.dirty ? colors.yellow("dirty") : colors.green("clean");
        stdout.write(`${row.name}\t${row.branch}\t${row.revision}\t${status}\n`);
      }
    });

  // Run command
  cli
    .command("run", "Run a shell command across selected repos")
    .option("--repos <repos>", "Comma-separated repo names to target")
    .option("--view <view>", "Named view to resolve repos from")
    .option("--tags <tags>", "Comma-separated repo tags that all must match")
    .example("repostack run --view runtime -- pnpm test")
    .example("repostack run --repos evt,fest -- pnpm build")
    .action(async (...args: unknown[]) => {
      const opts = args[args.length - 1] as { repos?: string; view?: string; tags?: string; "--"?: string[] };
      const command = opts["--"] ?? [];

      debug(`command=run args=${JSON.stringify(command)} options=${JSON.stringify(opts)}`);
      if (command.length === 0) {
        stderr.write(`${colors.red("Missing shell command for `repostack run`. Usage: repostack run [options] -- <command>")}\n`);
        onExitCode(1);
        return;
      }

      const { config } = await loadConfigWithUser(process.cwd(), { onDebug: debug });
      const result = await run(process.cwd(), config, {
        command: command.join(" "),
        repos: splitCommaList(opts.repos),
        view: opts.view,
        tags: splitCommaList(opts.tags),
        concurrency: config.settings.concurrency,
        continueOnError: config.settings.continueOnError,
        debug: Boolean(cli.options.debug),
        onDebug: debug,
      });

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
    });

  // Snapshot command
  cli
    .command("snapshot", "Write repostack.lock.yaml from current repo revisions")
    .action(async () => {
      debug("command=snapshot");
      const { config } = await loadConfigWithUser(process.cwd(), { onDebug: debug });
      await snapshot(process.cwd(), config, { onDebug: debug });
      stdout.write(`${colors.green("Wrote repostack.lock.yaml")}\n`);
    });

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
    onDebug: (msg: string) => {
      if (cli.options.debug) {
        stderr.write(`${colors.dim(`[debug] ${msg}`)}\n`);
      }
    },
  });

  try {
    await withPatchedConsole(stdout, stderr, async () => {
      // Parse with run: false so we can control execution and output
      cli.parse(["node", "repostack", ...args], { run: false });

      const debug = (msg: string) => {
        if (cli.options.debug) {
          stderr.write(`${colors.dim(`[debug] ${msg}`)}\n`);
        }
      };
      debug(`argv=${JSON.stringify(args)} command=${cli.matchedCommandName ?? "(none)"}`);

      // Handle unknown command first (before showing help)
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

      // Handle help: --help flag or no command provided
      if (cli.options.help || !firstArg) {
        if (cli.matchedCommand) {
          // Command-specific help: e.g., "run --help"
          cli.matchedCommand.outputHelp();
        } else {
          // Global help
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
