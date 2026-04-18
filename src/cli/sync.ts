import type { CAC } from "cac";
import { sync } from "../commands/sync";
import { loadConfigWithUser } from "../shared/config";
import type { CliContext } from "./types";

export function registerSync(cli: CAC, { logger }: CliContext): void {
  cli
    .command("sync", "Fetch and checkout revisions from the current lock file")
    .option("-y, --yes", "Skip confirmation prompts for uncommitted changes")
    .action(async (opts?: { yes?: boolean }) => {
      logger.debug("command=sync");
      const root = process.cwd();
      const { config } = await loadConfigWithUser(root, logger);
      await sync({
        root,
        config,
        logger,
        yes: opts?.yes
      });
      logger.info("Synchronized stack");
    });
}
