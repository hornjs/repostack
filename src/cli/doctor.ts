import type { CAC } from "cac";
import { doctor } from "../commands/doctor";
import { S_ERROR, S_WARN, S_INFO } from "./context";
import type { CliContext } from "./context";

export function registerDoctor(cli: CAC, ctx: CliContext): void {
  const { stdout, stderr, colors, onExitCode, debug } = ctx;

  cli
    .command("doctor", "Diagnose stack configuration and health")
    .action(async () => {
      debug("command=doctor");
      const result = await doctor(process.cwd(), { onDebug: debug });

      for (const issue of result.issues) {
        switch (issue.type) {
          case "error":
            stderr.write(`${colors.red(S_ERROR)} ${issue.message}\n`);
            break;
          case "warning":
            stdout.write(`${colors.yellow(S_WARN)} ${issue.message}\n`);
            break;
          case "info":
            stdout.write(`${colors.green(S_INFO)} ${issue.message}\n`);
            break;
        }
      }

      if (result.hasErrors) {
        onExitCode(1);
        stderr.write(`\n${colors.red("Found errors. Please fix them above.")}\n`);
      } else if (result.hasWarnings) {
        stdout.write(`\n${colors.yellow("Found warnings. Review them above.")}\n`);
      } else {
        stdout.write(`\n${colors.green("All checks passed!")}\n`);
      }
    });
}
