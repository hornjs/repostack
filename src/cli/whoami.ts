import type { CAC } from "cac";
import { listUsers } from "../commands/users";
import type { CliContext } from "./types";

export function registerWhoami(cli: CAC, { logger }: CliContext): void {
  cli
    .command("whoami", "Show the current user")
    .action(async () => {
      logger.debug("command=whoami");
      const { current } = await listUsers(process.cwd());
      if (current) {
        logger.log(current);
      } else {
        logger.warn("No user selected");
      }
    });
}
