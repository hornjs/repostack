import type { CAC } from "cac";
import { doctor } from "../commands/doctor";
import type { CliContext } from "./types";

export function registerDoctor(cli: CAC, { logger, onExitCode }: CliContext): void {
  cli
    .command("doctor", "Diagnose stack configuration and health")
    .action(async () => {
      logger.debug("command=doctor");

      await doctor({
        root: process.cwd(),
        logger,
      });

      logger.stdout.write("\n");
      if (logger.issuer.hasErrors) {
        onExitCode(1);
        logger.error("Found errors. Please fix them above.");
      } else if (logger.issuer.hasWarnings) {
        logger.warn("Found warnings. Review them above.");
      } else {
        logger.info("All checks passed!");
      }
    });
}
