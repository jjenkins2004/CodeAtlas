import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { errorHandler } from "./middleware/errorHandler.js";
import apiRouter from "./routes/index.js";

export function createApp(): express.Application {
  const app = express();
  const primaryStaticPath = path.join(process.cwd(), "dist", "server", "public");
  const fallbackStaticPath = path.join(process.cwd(), "src", "server", "public");
  const staticPath = existsSync(primaryStaticPath)
    ? primaryStaticPath
    : fallbackStaticPath;

  app.use(express.json());
  app.use(express.static(staticPath));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/v1", apiRouter);

  app.use(errorHandler);

  return app;
}
