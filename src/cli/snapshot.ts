import type { CAC } from "cac";
import { snapshot } from "../commands/snapshot";
import { loadConfigWithUser } from "../shared/config";
import type { CliContext } from "./context";

export function registerSnapshot(cli: CAC, ctx: CliContext): void {
  const { stdout, colors, debug } = ctx;

  cli
    .command("snapshot", "Write repostack.lock.yaml from current repo revisions")
    .action(async () => {
      debug("command=snapshot");
      const { config } = await loadConfigWithUser(process.cwd(), { onDebug: debug });
      await snapshot(process.cwd(), config, { onDebug: debug });
      stdout.write(`${colors.green("Wrote repostack.lock.yaml")}\n`);
    });
}
