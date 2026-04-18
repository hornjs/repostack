import type { CAC } from "cac";
import { isCancel, select } from "@clack/prompts";
import { loadConfig, loadRepostackrc, repostackrcExists } from "../shared/config";
import { listUsers, setUser, unsetUser } from "../commands/users";
import type { CliContext } from "./types";
import type { Logger } from "logtra";

function printUsersGuide(logger: Logger): void {
  logger.log("To add a user, edit repostack.yaml and add:");
  logger.log("  users:");
  logger.log("    alice:");
  logger.log("      repos: {}");
}

function printUsersSummary(logger: Logger, userNames: string[], currentUser: string | null): void {
  if (currentUser) {
    logger.info(`Current user: ${currentUser}`);
  } else {
    logger.warn("No user selected.");
  }
  logger.log(`<dim>Available users:</dim> ${userNames.join(", ")}`);
  logger.log("Commands:");
  logger.log("  repostack users ls             List users");
  logger.log("  repostack users su <name>      Switch to user");
  logger.log("  repostack users add <name>     Add user (edit config)");
  logger.log("  repostack users rm             Unset user");
}

async function runInteractiveUsers(root: string, logger: Logger): Promise<void> {
  const baseConfig = await loadConfig(root);
  const hasUsers = baseConfig.users && Object.keys(baseConfig.users).length > 0;
  const rcExists = await repostackrcExists(root);
  const currentUser = rcExists ? await loadRepostackrc(root) : null;

  logger.debug(`interactive users: hasUsers=${hasUsers}, currentUser=${currentUser}`);

  if (!hasUsers) {
    logger.warn("No users defined in this stack.");
    printUsersGuide(logger);
    return;
  }

  const userNames = Object.keys(baseConfig.users!);

  if (!logger.stdout.isTTY) {
    printUsersSummary(logger, userNames, currentUser);
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
        logger.warn("No users defined in this stack.");
      } else {
        logger.log(`Available users: ${userNames.join(", ")}`);
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
      logger.info(`Switched to user: ${picked}`);
      break;
    }
    case "rm": {
      await unsetUser(root);
      logger.info("Unset user. Using default configuration.");
      break;
    }
  }
}

export function registerUsers(cli: CAC, { logger, onExitCode }: CliContext): void {
  cli
    .command("users [command] [name]", "Manage user configuration for this stack")
    .example("repostack users             # Interactive mode")
    .example("repostack users ls          # List users")
    .example("repostack users su alice    # Switch to user")
    .example("repostack users add bob     # Add user")
    .example("repostack users rm          # Unset user")
    .action(async (command?: string, name?: string) => {
      logger.debug(`command=users subcommand=${command ?? "(interactive)"}`);
      const cwd = process.cwd();

      if (!command) {
        await runInteractiveUsers(cwd, logger);
        return;
      }

      switch (command) {
        case "ls": {
          const { users } = await listUsers(cwd);
          if (users.length === 0) {
            logger.warn("No users defined in this stack.");
            printUsersGuide(logger);
          } else {
            logger.log(`Available users: ${users.join(", ")}`);
          }
          break;
        }

        case "su": {
          if (!name) {
            if (logger.stdout.isTTY) {
              const { users } = await listUsers(cwd);
              if (users.length === 0) {
                logger.error("No users defined.");
                onExitCode(1);
                return;
              }
              const picked = await select({
                message: "Select user to switch to",
                options: users.map((u) => ({ value: u, label: u })),
              });
              if (isCancel(picked) || typeof picked !== "string") {
                logger.error("Aborted.");
                onExitCode(1);
                return;
              }
              name = picked;
            } else {
              logger.error("Missing user name. Usage: repostack users su <name>");
              onExitCode(1);
              return;
            }
          }
          await setUser(cwd, name);
          logger.info(`Switched to user: ${name}`);
          break;
        }

        case "add": {
          if (!name) {
            logger.error("Missing user name. Usage: repostack users add <name>");
            onExitCode(1);
            return;
          }
          logger.warn("Not implemented yet. Please edit repostack.yaml manually.");
          onExitCode(1);
          break;
        }

        case "rm": {
          await unsetUser(cwd);
          logger.info("Unset user. Using default configuration.");
          break;
        }

        default: {
          logger.error(`Unknown users command: ${command}`);
          logger.log("Available: ls, su, add, rm");
          onExitCode(1);
        }
      }
    });
}
