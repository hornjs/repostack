import { describe, expect, it } from "vitest";
import { Logger, S_INFO, S_WARN } from "logtra";
import { createPico } from "logtra/picocolors";

function createWriter() {
  const chunks: string[] = [];
  return {
    chunks,
    stream: {
      write(chunk: string | Uint8Array) {
        chunks.push(String(chunk));
        return true;
      },
    },
  };
}

describe("reporter", () => {
  it("indents hard-wrapped log lines inside a step", () => {
    const stdout = createWriter();
    const reporter = new Logger({ stdout: stdout.stream, stripColorTags: true });
    const step = reporter.step("Setup");

    step.log("first\nsecond");

    expect(stdout.chunks.join("")).toBe("Setup\n  first\n  second\n");
  });

  it("aligns hard-wrapped issue output after the status symbol", () => {
    const stdout = createWriter();
    const reporter = new Logger({ stdout: stdout.stream, stripColorTags: true });
    const step = reporter.step("Setup");

    step.issue({ type: "warning", message: "first\nsecond" });

    expect(stdout.chunks.join("")).toBe(`Setup\n  ${S_WARN} first\n    second\n`);
  });

  it("writes logger warnings as plain hard-wrapped output", () => {
    const stdout = createWriter();
    const reporter = new Logger({ stdout: stdout.stream, stripColorTags: true });
    const step = reporter.step("Setup");

    step.warn("first\nsecond");

    expect(stdout.chunks.join("")).toBe("Setup\n  first\n  second\n");
  });

  it("does not split multi-line issues into multiple tracked issues", () => {
    const stdout = createWriter();
    const reporter = new Logger({ stdout: stdout.stream, stripColorTags: true });

    reporter.issue({ type: "info", message: "first\nsecond" });

    expect(reporter.issuer.issues).toEqual([{ type: "info", message: "first\nsecond" }]);
    expect(stdout.chunks.join("")).toBe(`${S_INFO} first\n  second\n`);
  });

  it("does not track normal info, warning, or error output as issues", () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const reporter = new Logger({
      stdout: stdout.stream,
      stderr: stderr.stream,
      stripColorTags: true,
    });

    reporter.info("info");
    reporter.warn("warn");
    reporter.error("error");

    expect(reporter.issuer.issues).toEqual([]);
    expect(stdout.chunks.join("")).toBe("info\nwarn\n");
    expect(stderr.chunks.join("")).toBe("error\n");
  });

  it("prints OK when a step finishes without issues", () => {
    const stdout = createWriter();
    const reporter = new Logger({ stdout: stdout.stream, stripColorTags: true });
    const step = reporter.step("Config");

    step.done();

    expect(stdout.chunks.join("")).toBe("Config OK\n");
    expect(reporter.issuer.issues).toEqual([]);
  });

  it("keeps raw issue messages and renders nested colors on output", () => {
    const stdout = createWriter();
    const colorizer = createPico(true);
    const reporter = new Logger({ stdout: stdout.stream, colorizer, stripColorTags: true });

    reporter.issue({ type: "info", message: "Run <red>failed <bold>hard</bold></red>" });

    expect(reporter.issuer.issues).toEqual([{ type: "info", message: "Run <red>failed <bold>hard</bold></red>" }]);
    expect(stdout.chunks.join("")).toBe(`${colorizer.wrap("green", S_INFO)} Run ${colorizer.wrap("red", `failed ${colorizer.wrap("bold", "hard")}`)}\n`);
  });

  it("renders the generic color tag as cyan", () => {
    const stdout = createWriter();
    const colorizer = createPico(true);
    const reporter = new Logger({ stdout: stdout.stream, colorizer, stripColorTags: true });

    reporter.log('Use <span color="cyan">repostack</span>');

    expect(stdout.chunks.join("")).toBe(`Use ${colorizer.wrap("cyan", "repostack")}\n`);
  });

  it("keeps unknown and unmatched tags as text", () => {
    const stdout = createWriter();
    const reporter = new Logger({ stdout: stdout.stream, stripColorTags: true });

    reporter.log("<unknown>x</unknown> <red>open");

    expect(stdout.chunks.join("")).toBe("<unknown>x</unknown> <red>open\n");
  });

  it("separates logging from issue tracking", () => {
    const stdout = createWriter();
    const logger = new Logger({ stdout: stdout.stream, stripColorTags: true });
    logger.info("log only");
    logger.issue({ type: "info", message: "tracked" });

    expect(stdout.chunks.join("")).toBe(`log only\n${S_INFO} tracked\n`);
    expect(logger.issuer.issues).toEqual([{ type: "info", message: "tracked" }]);
  });

  it("wraps info, warning, and error output with default colors", () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const colorizer = createPico(true);
    const logger = new Logger({ stdout: stdout.stream, stderr: stderr.stream, colorizer, stripColorTags: true });

    logger.info("info");
    logger.warn("warn");
    logger.error("error");

    expect(stdout.chunks.join("")).toBe(`${colorizer.wrap("green", "info")}\n${colorizer.wrap("yellow", "warn")}\n`);
    expect(stderr.chunks.join("")).toBe(`${colorizer.wrap("red", "error")}\n`);
  });

  it("skips default log coloring when colorable is false", () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const colorizer = createPico(true);
    const logger = new Logger({ stdout: stdout.stream, stderr: stderr.stream, colorizer, stripColorTags: true });

    logger.info("<red>info</red>", { colorable: false });
    logger.warn("<green>warn</green>", { colorable: false });
    logger.error("<cyan>error</cyan>", { colorable: false });

    expect(stdout.chunks.join("")).toBe(`${colorizer.wrap("red", "info")}\n${colorizer.wrap("green", "warn")}\n`);
    expect(stderr.chunks.join("")).toBe(`${colorizer.wrap("cyan", "error")}\n`);
  });

  it("appends a trailing newline for log-like methods", () => {
    const stdout = createWriter();
    const stderr = createWriter();
    const logger = new Logger({ stdout: stdout.stream, stderr: stderr.stream, debug: true, stripColorTags: true });

    logger.log("log");
    logger.info("info", { colorable: false });
    logger.warn("warn", { colorable: false });
    logger.error("error", { colorable: false });
    logger.debug("debug");

    expect(stdout.chunks.join("")).toBe("log\ninfo\nwarn\n");
    expect(stderr.chunks.join("")).toBe("error\n[debug] debug\n");
  });
});
