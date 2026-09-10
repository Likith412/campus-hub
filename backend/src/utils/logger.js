const isProduction = process.env.NODE_ENV === "production";

function serialize(value) {
   if (value instanceof Error) {
      return {
         name: value.name,
         message: value.message,
         stack: value.stack,
      };
   }

   return value;
}

function log(level, message, context) {
   const timestamp = new Date().toISOString();
   const output = console[level] || console.log;

   if (isProduction) {
      const entry = {
         timestamp,
         level,
         message,
         ...(context === undefined ? {} : { context: serialize(context) }),
      };

      output(JSON.stringify(entry));
      return;
   }

   const prefix = `[${timestamp}] ${level.toUpperCase()}:`;
   if (context === undefined) {
      output(prefix, message);
   } else {
      output(prefix, message, serialize(context));
   }
}

const logger = {
   debug(message, context) {
      if (!isProduction) log("debug", message, context);
   },
   info(message, context) {
      log("info", message, context);
   },
   warn(message, context) {
      log("warn", message, context);
   },
   error(message, context) {
      log("error", message, context);
   },
   stream: {
      write(message) {
         logger.info(message.trim());
      },
   },
};

module.exports = logger;
