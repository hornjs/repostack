import { spawn } from "node:child_process";

export type CommandExecution = {
  cwd: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
};

export async function execShellCommand(
  cwd: string,
  command: string,
  shell: string,
): Promise<CommandExecution> {
  return new Promise((resolve, reject) => {
    const child = spawn(shell, ["-lc", command], { cwd });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        cwd,
        command,
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });
}
