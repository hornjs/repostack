import type { Logger } from "logtra";

export type OutputContext = Pick<
  Logger,
  "log" | "info" | "warn" | "error" | "debug" | "issue" | "spin" | "overwrite"
>;

export type StepContext = OutputContext & Pick<Logger, "step">;

export type DebugContext = Pick<Logger, "debug">;

export type IssueContext = Pick<Logger, "debug" | "issue">;
