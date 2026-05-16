import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { errorHandler } from "./middleware/errorHandler.js";
import apiRouter from "./routes/index.js";
import { createLogger } from "../services/util/Logger.js";

const logger = createLogger({ component: "http" });

export function createApp(): express.Application {
  const app = express();
  const primaryStaticPath = path.join(
    process.cwd(),
    "dist",
    "server",
    "public",
  );
  const fallbackStaticPath = path.join(
    process.cwd(),
    "src",
    "server",
    "public",
  );
  const staticPath = existsSync(primaryStaticPath)
    ? primaryStaticPath
    : fallbackStaticPath;

  app.use((req, res, next) => {
    const startTime = Date.now();

    res.on("finish", () => {
      if (!req.path.startsWith("/api/v1")) {
        return;
      }

      const durationMs = Date.now() - startTime;
      const event = {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
      };

      if (res.statusCode >= 500) {
        logger.error(event, "Request failed");
        return;
      }

      if (res.statusCode >= 400) {
        logger.warn(event, "Request completed with client error");
        return;
      }

      if (req.method === "GET") {
        logger.debug(event, "Request completed");
        return;
      }

      logger.info(event, "Request completed");
    });

    next();
  });

  app.use(express.json());
  app.use(express.static(staticPath));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/v1", apiRouter);

  app.use(errorHandler);

  return app;
}
