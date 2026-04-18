import type { CAC } from "cac";
import { use } from "../commands/use";
import type { CliContext } from "./types";

export function registerUse(cli: CAC, { logger, onExitCode }: CliContext): void {
  cli
    .command("use [path]", "Register a repo in the current stack")
    .option("-y, --yes", "Skip confirmation prompts and auto-initialize")
    .action(async (repoPath?: string, opts?: { yes?: boolean }) => {
      if (!repoPath) {
        logger.error("Missing repo path for `repostack use`.");
        onExitCode(1);
        return;
      }
      logger.debug(`command=use repoPath=${repoPath} yes=${opts?.yes ?? false}`);
      await use({
        root: process.cwd(),
        repoPath,
        logger,
        yes: opts?.yes,
      });
      logger.info(`Added repo: ${repoPath}`);
    });
}
