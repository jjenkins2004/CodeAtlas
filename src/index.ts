import { createApp } from "./server/app.js";
import { client } from "./db/index.js";
import { execFile } from "node:child_process";
import { createLogger, getLoggerModeSummary } from "./services/util/Logger.js";

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
const logger = createLogger({ component: "server" });

const app = createApp();

const server = app.listen(PORT, () => {
  logger.info(
    {
      port: PORT,
      ...getLoggerModeSummary(),
    },
    "REST API listening",
  );

  if (process.env["OPEN_UI"] === "true") {
    const url = `http://localhost:${PORT}`;
    const command =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "cmd"
          : "xdg-open";
    const args =
      process.platform === "win32" ? ["/c", "start", "", url] : [url];

    execFile(command, args, (error: Error | null) => {
      if (error) {
        logger.warn({ err: error, url }, "Unable to auto-open browser");
      }
    });
  }
});

async function shutdown(): Promise<void> {
  logger.info("Shutting down");
  server.close();
  await client.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
