import { defineConfig } from "tsdown";
import fs from "node:fs";
import path from "node:path";

export default defineConfig({
  entry: ["./src/index.ts"],
  dts: false,
  onSuccess() {
    const file = path.resolve("dist/index.mjs");
    const original = fs.readFileSync(file, "utf-8");
    const shebang = "#!/usr/bin/env node\n\n";
    if (!original.startsWith(shebang)) {
      fs.writeFileSync(file, `${shebang}${original}`);
    }
    fs.chmodSync(file, 0o755);
  },
});
