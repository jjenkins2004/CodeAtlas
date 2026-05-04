import { createApp } from "./server/app.js";
import { closePool } from "./db/index.js";

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`CodeAtlas REST API listening on port ${PORT}`);
});

async function shutdown(): Promise<void> {
  console.log("Shutting down…");
  server.close();
  await closePool();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
