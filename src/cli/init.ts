import type { CAC } from "cac";
import { init } from "../commands/init";
import type { CliContext } from "./types";

export function registerInit(cli: CAC, { logger }: CliContext): void {
  cli
    .command("init", "Initialize repostack.yaml in the current directory")
    .option("-y, --yes", "Auto-initialize git repo if not exists")
    .action(async (opts?: { yes?: boolean }) => {
      logger.debug(`command=init yes=${opts?.yes ?? false}`);
      const result = await init({
        root: process.cwd(),
        logger,
        yes: opts?.yes,
      });
      if (result.configCreated) {
        logger.info("Initialized repostack.yaml");
      } else {
        logger.warn("repostack.yaml already exists");
      }
      if (result.gitInitialized) {
        logger.info("Initialized git repository");
      }
      if (result.gitignoreUpdated) {
        logger.info("Updated .gitignore with .repostackrc");
      }
    });
}
