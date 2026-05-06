const mongoose = require("mongoose");

async function connectDatabase() {
   await mongoose.connect(process.env.DATABASE_URI);
}

async function disconnectDatabase() {
   await mongoose.disconnect();
}

module.exports = {
   connectDatabase,
   disconnectDatabase,
};
