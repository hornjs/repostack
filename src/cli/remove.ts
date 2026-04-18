import type { CAC } from "cac";
import { remove } from "../commands/remove";
import type { CliContext } from "./types";

export function registerRemove(cli: CAC, { logger }: CliContext): void {
  cli
    .command("remove <name>", "Remove a repo from the current stack")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (repoName?: string, opts?: { yes?: boolean }) => {
      if (!repoName) {
        logger.error("Please provide a repo name to remove");
        return;
      }
      logger.debug(`command=remove repoName=${repoName} yes=${opts?.yes ?? false}`);
      await remove({
        root: process.cwd(),
        repoName,
        logger,
        yes: opts?.yes,
      });
      logger.info(`Removed repo: ${repoName}`);
    });
}
