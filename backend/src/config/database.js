// Thin wrappers around mongoose connect/disconnect so callers don't import mongoose directly.
const mongoose = require("mongoose");

// Open the MongoDB connection using the URI from env.
async function connectDatabase() {
   await mongoose.connect(process.env.DATABASE_URI);
}

// Close the MongoDB connection (used during graceful shutdown).
async function disconnectDatabase() {
   await mongoose.disconnect();
}

module.exports = {
   connectDatabase,
   disconnectDatabase,
};
