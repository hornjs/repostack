import type { CAC } from "cac";
import { list } from "../commands/list";
import { loadConfigWithUser } from "../shared/config";
import type { CliContext } from "./types";

export function registerList(cli: CAC, { logger }: CliContext): void {
  cli
    .command("list", "Show the current branch, revision, and dirty state for each repo")
    .action(async () => {
      logger.debug("command=list");

      const root = process.cwd();

      const { config, user } = await loadConfigWithUser(root, logger);
      if (user) {
        logger.log(`<dim>[user: ${user}]</dim>`);
      }
      const rows = await list({
        root,
        config,
        logger,
      });

      for (const row of rows) {
        const status = row.dirty ? "<yellow>dirty</yellow>" : "<green>clean</green>";
        logger.log(`${row.name}\t${row.branch}\t${row.revision}\t${status}`);
      }
    });
}
