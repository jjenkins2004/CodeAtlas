import { Router, Request, Response, NextFunction } from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createLogger } from "../../services/util/Logger.js";

const router = Router();
const execFileAsync = promisify(execFile);
const logger = createLogger({ component: "system-route" });

/**
 * GET /system/select-folder
 * Opens the native macOS folder picker and returns a POSIX path.
 */
router.get(
  "/select-folder",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (process.platform !== "darwin") {
        logger.warn(
          { platform: process.platform },
          "Folder picker is unsupported on this platform",
        );
        res.status(400).json({
          error: "Native folder picker is currently only supported on macOS",
        });
        return;
      }

      const script =
        'POSIX path of (choose folder with prompt "Select a repository folder")';
      const { stdout } = await execFileAsync("osascript", ["-e", script]);
      const path = stdout.trim();

      if (!path) {
        logger.info("Folder picker returned no selection");
        res.status(400).json({ error: "No folder selected" });
        return;
      }

      logger.info({ path }, "Folder selected");
      res.json({ path });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
