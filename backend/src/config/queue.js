const Queue = require("bull");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const QUEUE_CONCURRENCY = Number(process.env.QUEUE_CONCURRENCY) || 5;

const defaultJobOptions = {
   attempts: 5,
   backoff: { type: "exponential", delay: 5000 }, // 5s initial delay, then 10s, 20s, etc.
   timeout: 30000, // 30s max per job attempt to prevent hanging.
   removeOnComplete: { age: 3600, count: 1000 }, // 1 hour, max 1000 completed jobs.
   removeOnFail: { age: 24 * 3600, count: 5000 }, // 24 hours, max 5000 failed jobs for debugging.
};

const redisQueue = new Queue("redisQueue", REDIS_URL, { defaultJobOptions });

const handlers = {
   async sendEmail(payload) {
      const { sendEmail } = require("../services/emailService");
      const { to, subject, html, text } = payload;
      await sendEmail(to, subject, html, text);
   },
};

function startQueueProcessor() {
   redisQueue.process(QUEUE_CONCURRENCY, async (job) => {
      const { action, payload } = job.data;
      const handler = handlers[action];
      if (!handler) throw new Error(`Unknown action: ${action}`);
      await handler(payload);
   });

   redisQueue.on("error", (err) => {
      console.error("[queue] error:", err);
   });

   redisQueue.on("failed", (job, err) => {
      console.error(
         `[queue] job ${job.id} (${job.data?.action}) failed on attempt ${job.attemptsMade}/${job.opts.attempts}:`,
         err.message,
      );
   });

   redisQueue.on("stalled", (job) => {
      console.warn(`[queue] job ${job.id} (${job.data?.action}) stalled`);
   });

   redisQueue.on("completed", (job) => {
      console.log(`[queue] job ${job.id} (${job.data?.action}) completed`);
   });
}

// Gracefully stop processing new jobs and wait for active ones to finish.
async function stopQueueProcessor() {
   await redisQueue.close();
}

// Add a new job to the queue with the given action and payload.
async function addToQueue(action, payload) {
   await redisQueue.add({ action, payload });
}

// Same, for a fan-out: one round trip instead of one per payload. Returns how many
// jobs were accepted.
async function addBulkToQueue(action, payloads) {
   if (payloads.length === 0) return 0;
   const jobs = await redisQueue.addBulk(
      payloads.map((payload) => ({ data: { action, payload } })),
   );
   return jobs.length;
}

module.exports = {
   redisQueue,
   addToQueue,
   addBulkToQueue,
   startQueueProcessor,
   stopQueueProcessor,
};
