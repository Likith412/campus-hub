// Entry point: boots the HTTP server, connects external services, and handles graceful shutdown.
const http = require("http");
const dotenv = require("dotenv");

// Load env vars from .env before anything else reads process.env.
dotenv.config();

const { connectDatabase, disconnectDatabase } = require("./config/database");
const { connectRedis, disconnectRedis } = require("./config/redis");

const PORT = process.env.PORT || 8000;
const SHUTDOWN_TIMEOUT_MS = 30000; // Hard kill the process if cleanup hangs past 30s.

let server;

// Connect to dependencies first, then start accepting HTTP traffic.
async function startServer() {
   try {
      await connectDatabase();
      console.log("Database connected");

      await connectRedis();
      console.log("Redis connected");

      // Require app AFTER env + DB are ready (modules may read env at import).
      const app = require("./app");
      server = http.createServer(app);

      server.listen(PORT, () => {
         console.log(`Server running on http://localhost:${PORT}`);
      });
   } catch (error) {
      console.error("Failed to start server:", error);
      process.exit(1);
   }
}

// Graceful shutdown: stop new requests, close DB/Redis, then exit.
async function shutdown(signal) {
   console.log(`\n${signal} received, shutting down`);

   // Safety net so we never hang forever during shutdown.
   const forceExit = setTimeout(() => {
      console.error("Forced shutdown after timeout");
      process.exit(1);
   }, SHUTDOWN_TIMEOUT_MS);
   forceExit.unref();

   try {
      if (server) {
         // Wait for in-flight requests to finish before closing the listener.
         await new Promise((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
         });
      }
      await disconnectDatabase();
      await disconnectRedis();
      process.exit(0);
   } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
   }
}

// Listen for Ctrl+C (SIGINT) and container/orchestrator stop (SIGTERM).
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer();
