import type { CAC } from "cac";
import { list } from "../commands/list";
import { loadConfigWithUser } from "../config";
import type { CliContext } from "./context";

export function registerList(cli: CAC, ctx: CliContext): void {
  const { stdout, colors, debug } = ctx;

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
}
