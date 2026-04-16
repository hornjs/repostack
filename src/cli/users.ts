import type { CAC } from "cac";
import { isCancel, select } from "@clack/prompts";
import { loadConfig, loadRepostackrc, repostackrcExists } from "../config";
import { listUsers, setUser, unsetUser } from "../commands/users";
import type { CliContext } from "./context";

async function runInteractiveUsers(
  root: string,
  ctx: CliContext,
): Promise<void> {
  const { stdout, colors, debug } = ctx;

  const baseConfig = await loadConfig(root);
  const hasUsers = baseConfig.users && Object.keys(baseConfig.users).length > 0;
  const rcExists = await repostackrcExists(root);
  const currentUser = rcExists ? await loadRepostackrc(root) : null;

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

  if (!stdout.isTTY) {
    if (currentUser) {
      stdout.write(`${colors.green(`Current user:`)} ${currentUser}\n`);
    } else {
      stdout.write(`${colors.dim("No user selected.")}\n`);
    }
    stdout.write(`\n${colors.dim("Available users:")} ${userNames.join(", ")}\n`);
    stdout.write(`\nCommands:\n`);
    stdout.write(`  repostack users ls             List users\n`);
    stdout.write(`  repostack users su <name>      Switch to user\n`);
    stdout.write(`  repostack users add <name>     Add user (edit config)\n`);
    stdout.write(`  repostack users rm             Unset user\n`);
    return;
  }

  const action = await select({
    message: currentUser ? `Current user: ${currentUser}` : "No user selected",
    options: [
      { value: "ls", label: "List users" },
      { value: "su", label: "Switch user" },
      { value: "rm", label: "Unset user" },
    ],
  });

  if (isCancel(action)) return;

  switch (action) {
    case "ls": {
      if (userNames.length === 0) {
        stdout.write(`${colors.dim("No users defined in this stack.")}\n`);
      } else {
        stdout.write(`Available users: ${userNames.join(", ")}\n`);
      }
      break;
    }
    case "su": {
      const picked = await select({
        message: "Select user to switch to",
        options: userNames.map((u) => ({ value: u, label: u })),
      });
      if (isCancel(picked) || typeof picked !== "string") return;
      await setUser(root, picked);
      stdout.write(`${colors.green(`Switched to user: ${picked}`)}\n`);
      break;
    }
    case "rm": {
      await unsetUser(root);
      stdout.write(`${colors.green("Unset user. Using default configuration.")}\n`);
      break;
    }
  }
}

export function registerUsers(cli: CAC, ctx: CliContext): void {
  const { stdout, stderr, colors, onExitCode, debug } = ctx;

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
        await runInteractiveUsers(cwd, ctx);
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
            if (stdout.isTTY) {
              const { users } = await listUsers(cwd);
              if (users.length === 0) {
                stderr.write(`${colors.red("No users defined.")}\n`);
                onExitCode(1);
                return;
              }
              const picked = await select({
                message: "Select user to switch to",
                options: users.map((u) => ({ value: u, label: u })),
              });
              if (isCancel(picked) || typeof picked !== "string") {
                stderr.write(`${colors.red("Aborted.")}\n`);
                onExitCode(1);
                return;
              }
              name = picked;
            } else {
              stderr.write(`${colors.red("Missing user name. Usage: repostack users su <name>")}\n`);
              onExitCode(1);
              return;
            }
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

        case "rm": {
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
}
