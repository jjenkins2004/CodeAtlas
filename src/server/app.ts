import express from "express";
import { errorHandler } from "./middleware/errorHandler.js";
import apiRouter from "./routes/index.js";

export function createApp(): express.Application {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/v1", apiRouter);

  app.use(errorHandler);

  return app;
}
