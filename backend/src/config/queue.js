const Queue = require("bull");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Initialize a Bull queue named "redisQueue" that connects to the local Redis instance.
const redisQueue = new Queue("redisQueue", REDIS_URL);

// Job processor for the Redis queue. Handles different actions based on the job data.
function startQueueProcessor() {
   redisQueue.process(async (job) => {
      const { action, payload } = job.data;

      switch (action) {
         case "sendEmail":
            // Payload is expected to be an array: [to, subject, html, text].
            const { sendEmail } = require("../services/emailService");
            await sendEmail(...payload);
            break;

         default:
            throw new Error("Unknown action");
      }
   });

   // Event listeners for job completion and failure. Logs outcomes for monitoring.
   redisQueue.on("completed", (job) => {
      console.log(`Job with ID ${job.id} completed successfully.`);
   });

   redisQueue.on("failed", (job, err) => {
      console.error(`Job with ID ${job.id} failed:`, err);
   });
}

async function stopQueueProcessor() {
   await redisQueue.close();
}

async function addToQueue(action, payload) {
   await redisQueue.add({ action, payload });
}

module.exports = {
   redisQueue,
   addToQueue,
   startQueueProcessor,
   stopQueueProcessor,
};
