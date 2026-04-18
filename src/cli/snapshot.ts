import type { CAC } from "cac";
import { snapshot } from "../commands/snapshot";
import { loadConfigWithUser } from "../shared/config";
import type { CliContext } from "./types";

export function registerSnapshot(cli: CAC, { logger }: CliContext): void {
  cli
    .command("snapshot", "Write repostack.lock.yaml from current repo revisions")
    .action(async () => {
      logger.debug("command=snapshot");
      const root = process.cwd();
      const { config } = await loadConfigWithUser(root, logger);
      await snapshot({
        root,
        config,
        logger,
      });
      logger.info("Wrote repostack.lock.yaml");
    });
}
