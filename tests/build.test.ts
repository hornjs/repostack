import { describe, expect, it } from "vitest";
import config from "../tsdown.config";

describe("build", () => {
  it("uses the CLI entry as the build input", () => {
    expect(config).toMatchObject({
      entry: ["./src/cli.ts"],
    });
  });

  it("uses the default dts generator without tsgo", () => {
    expect(config).toMatchObject({
      dts: true,
    });
  });
});
