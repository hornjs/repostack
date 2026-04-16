import type { CAC } from "cac";
import { sync } from "../commands/sync";
import { loadConfigWithUser } from "../shared/config";
import type { CliContext } from "./context";

export function registerSync(cli: CAC, ctx: CliContext): void {
  const { stdout, colors, debug } = ctx;

  cli
    .command("sync", "Fetch and checkout revisions from the current lock file")
    .option("-y, --yes", "Skip confirmation prompts for uncommitted changes")
    .action(async (opts?: { yes?: boolean }) => {
      debug("command=sync");
      const { config } = await loadConfigWithUser(process.cwd(), { onDebug: debug });
      await sync(process.cwd(), config, { onDebug: debug, yes: opts?.yes });
      stdout.write(`${colors.green("Synchronized stack")}\n`);
    });
}
