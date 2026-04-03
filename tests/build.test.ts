import { describe, expect, it } from "vitest";
import config from "../tsdown.config";

describe("build", () => {
  it("uses the CLI entry as the build input", () => {
    expect(config).toMatchObject({
      entry: ["./src/index.ts"],
    });
  });

  it("does not emit declaration files", () => {
    expect(config).toMatchObject({
      dts: false,
    });
  });
});
