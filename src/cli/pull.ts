import type { CAC } from "cac";
import { pull } from "../commands/pull";
import { loadConfigWithUser } from "../shared/config";
import type { CliContext } from "./types";

export function registerPull(cli: CAC, { logger }: CliContext): void {
  cli
    .command("pull", "Clone repos that are declared but missing locally")
    .option("--concurrency <count>", "Override configured clone concurrency")
    .option("--max-attempts <count>", "Override clone retry attempts")
    .action(async (opts?: { concurrency?: string | number; maxAttempts?: string | number }) => {
      logger.debug("command=pull");
      const root = process.cwd();
      const { config } = await loadConfigWithUser(root, logger);
      const concurrency = opts?.concurrency === undefined ? undefined : Number(opts.concurrency);
      const maxAttempts = opts?.maxAttempts === undefined ? undefined : Number(opts.maxAttempts);
      await pull({
        root,
        config,
        logger,
        concurrency: Number.isFinite(concurrency) ? concurrency : undefined,
        maxAttempts: Number.isFinite(maxAttempts) ? maxAttempts : undefined,
      });
      logger.info("Pulled missing repos");
    });
}
