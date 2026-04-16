import type { CAC } from "cac";
import { listUsers } from "../commands/users";
import type { CliContext } from "./context";

export function registerWhoami(cli: CAC, ctx: CliContext): void {
  const { stdout, colors, debug } = ctx;

  cli
    .command("whoami", "Show the current user")
    .action(async () => {
      debug("command=whoami");
      const { current } = await listUsers(process.cwd());
      if (current) {
        stdout.write(`${current}\n`);
      } else {
        stdout.write(`${colors.dim("(no user selected)")}\n`);
      }
    });
}
