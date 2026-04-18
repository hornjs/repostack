import type { Logger } from "logtra";

export type CliContext = {
  onExitCode: (code: number) => void;
  logger: Logger;
}
