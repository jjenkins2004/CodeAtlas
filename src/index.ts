import { createApp } from "./server/app.js";
import { client } from "./db/index.js";
import { execFile } from "node:child_process";

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`CodeAtlas REST API listening on port ${PORT}`);

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
        console.warn(`Unable to auto-open browser: ${error.message}`);
      }
    });
  }
});

async function shutdown(): Promise<void> {
  console.log("Shutting down…");
  server.close();
  await client.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
