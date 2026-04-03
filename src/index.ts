import { main } from "./cli";

const code = await main({
  args: process.argv.slice(2),
  stdout: process.stdout,
  stderr: process.stderr,
});

process.exitCode = code;
