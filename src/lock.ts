import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import YAML from "yaml";
import { pathExists } from "./git";
import type { RepostackLock } from "./shared/types";

function calculateChecksum(lock: Omit<RepostackLock, "checksum">): string {
  const content = JSON.stringify(lock, Object.keys(lock).sort());
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export async function loadLock(
  root: string,
  options: { onDebug?: (message: string) => void } = {},
): Promise<RepostackLock | null> {
  const debug = options.onDebug ?? (() => {});
  const path = join(root, "repostack.lock.yaml");
  if (!(await pathExists(path))) {
    debug("loadLock: lock file not found");
    return null;
  }
  const source = await readFile(path, "utf8");
  const lock = YAML.parse(source) as RepostackLock;

  if (lock.checksum) {
    const { checksum, ...lockWithoutChecksum } = lock;
    const expected = calculateChecksum(lockWithoutChecksum);
    if (checksum !== expected) {
      throw new Error(
        `Lock file checksum mismatch: expected ${expected}, got ${checksum}. The lock file may have been corrupted or manually edited.`,
      );
    }
    debug("loadLock: checksum verified");
  } else {
    debug("loadLock: no checksum found (legacy lock file)");
  }

  return lock;
}
