const http = require("http");
const dotenv = require("dotenv");

dotenv.config();

const app = require("./app");
const { connectDatabase, disconnectDatabase } = require("./config/database");
const { connectRedis, disconnectRedis } = require("./config/redis");

const PORT = process.env.PORT || 8000;
const SHUTDOWN_TIMEOUT_MS = 30000;

const server = http.createServer(app);

async function startServer() {
   try {
      await connectDatabase();
      console.log("Database connected");

      await connectRedis();
      console.log("Redis connected");

      server.listen(PORT, () => {
         console.log(`Server running on http://localhost:${PORT}`);
      });
   } catch (error) {
      console.error("Failed to start server:", error);
      process.exit(1);
   }
}

async function shutdown(signal) {
   console.log(`\n${signal} received, shutting down`);

   const forceExit = setTimeout(() => {
      console.error("Forced shutdown after timeout");
      process.exit(1);
   }, SHUTDOWN_TIMEOUT_MS);
   forceExit.unref();

   try {
      await new Promise((resolve, reject) => {
         server.close((err) => (err ? reject(err) : resolve()));
      });
      await disconnectDatabase();
      await disconnectRedis();
      process.exit(0);
   } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
   }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer();
