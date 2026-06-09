import type { CAC } from "cac";
import { restore } from "../commands/restore";
import { loadConfigWithUser } from "../shared/config";
import type { CliContext } from "./types";

export function registerRestore(cli: CAC, { logger }: CliContext): void {
  cli
    .command("restore", "Restore repos to revisions from the current lock file")
    .option("-y, --yes", "Skip confirmation prompts for uncommitted changes")
    .action(async (opts?: { yes?: boolean }) => {
      logger.debug("command=restore");
      const root = process.cwd();
      const { config } = await loadConfigWithUser(root, logger);
      await restore({
        root,
        config,
        logger,
        yes: opts?.yes
      });
      logger.info("Restored stack");
    });
}
