import { startMcpServer } from "./server.js";
import { createLogger, getLoggerModeSummary } from "../services/util/Logger.js";

const logger = createLogger({ component: "mcp-server" });

logger.info(getLoggerModeSummary(), "Starting MCP server");

startMcpServer().catch((err) => {
  logger.error({ err }, "MCP server error");
  process.exit(1);
});
