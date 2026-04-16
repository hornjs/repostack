import isUnicodeSupported from "is-unicode-supported";
import type pico from "picocolors";

const unicodeOr = (c: string, fallback: string) => (isUnicodeSupported() ? c : fallback);
export const S_ERROR = unicodeOr("■", "x");
export const S_WARN = unicodeOr("▲", "!");
export const S_INFO = unicodeOr("●", "•");

export type MainOptions = {
  args: string[];
  stdout: Pick<NodeJS.WriteStream, "write"> & Partial<Pick<NodeJS.WriteStream, "isTTY">>;
  stderr: Pick<NodeJS.WriteStream, "write"> & Partial<Pick<NodeJS.WriteStream, "isTTY">>;
};

export type CliContext = {
  stdout: MainOptions["stdout"];
  stderr: MainOptions["stderr"];
  colors: ReturnType<typeof pico.createColors>;
  onExitCode: (code: number) => void;
  debug: (msg: string) => void;
};
