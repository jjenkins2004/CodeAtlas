import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

interface DatabaseErrorShape {
  code?: string;
  cause?: unknown;
}

function hasDatabaseErrorShape(value: unknown): value is DatabaseErrorShape {
  return typeof value === "object" && value !== null;
}

export function isUniqueConstraintError(error: unknown): boolean {
  if (!hasDatabaseErrorShape(error)) {
    return false;
  }

  if (error.code === "23505") {
    return true;
  }

  return isUniqueConstraintError(error.cause);
}

export function resolvePersistentDataDir(appName: string): string {
  const home = os.homedir();

  const baseDir =
    process.platform === "darwin"
      ? path.join(home, "Library", "Application Support")
      : process.platform === "win32"
        ? (process.env["APPDATA"] ?? path.join(home, "AppData", "Roaming"))
        : (process.env["XDG_DATA_HOME"] ?? path.join(home, ".local", "share"));

  const dataDir = path.join(baseDir, appName, "pglite");
  mkdirSync(dataDir, { recursive: true });

  return dataDir;
}
