import type { CAC } from "cac";
import { use } from "../commands/use";
import type { CliContext } from "./context";

export function registerUse(cli: CAC, ctx: CliContext): void {
  const { stdout, stderr, colors, onExitCode, debug } = ctx;

  cli
    .command("use [path]", "Register a repo in the current stack")
    .option("-y, --yes", "Skip confirmation prompts and auto-initialize")
    .action(async (repoPath?: string, opts?: { yes?: boolean }) => {
      if (!repoPath) {
        stderr.write(`${colors.red("Missing repo path for `repostack use`.")}\n`);
        onExitCode(1);
        return;
      }
      debug(`command=use repoPath=${repoPath} yes=${opts?.yes ?? false}`);
      await use(process.cwd(), repoPath, { yes: opts?.yes, onDebug: debug });
      stdout.write(`${colors.green("Added repo:")} ${repoPath}\n`);
    });
}
