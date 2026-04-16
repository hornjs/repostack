import type { CAC } from "cac";
import { init } from "../commands/init";
import type { CliContext } from "./context";

export function registerInit(cli: CAC, ctx: CliContext): void {
  const { stdout, colors, debug } = ctx;

  cli
    .command("init", "Initialize repostack.yaml in the current directory")
    .option("-y, --yes", "Auto-initialize git repo if not exists")
    .action(async (opts?: { yes?: boolean }) => {
      debug(`command=init yes=${opts?.yes ?? false}`);
      const result = await init(process.cwd(), { onDebug: debug, yes: opts?.yes });
      if (result.configCreated) {
        stdout.write(`${colors.green("Initialized repostack.yaml")}\n`);
      } else {
        stdout.write(`${colors.yellow("repostack.yaml already exists")}\n`);
      }
      if (result.gitInitialized) {
        stdout.write(`${colors.green("Initialized git repository")}\n`);
      }
      if (result.gitignoreUpdated) {
        stdout.write(`${colors.green("Updated .gitignore with .repostackrc")}\n`);
      }
    });
}
