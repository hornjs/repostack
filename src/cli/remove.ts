import type { CAC } from "cac";
import { remove } from "../commands/remove";
import type { CliContext } from "./context";

export function registerRemove(cli: CAC, ctx: CliContext): void {
  const { stdout, colors, debug } = ctx;

  cli
    .command("remove <name>", "Remove a repo from the current stack")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (repoName?: string, opts?: { yes?: boolean }) => {
      debug(`command=remove repoName=${repoName} yes=${opts?.yes ?? false}`);
      await remove(process.cwd(), repoName!, { yes: opts?.yes, onDebug: debug });
      stdout.write(`${colors.green("Removed repo:")} ${repoName}\n`);
    });
}
