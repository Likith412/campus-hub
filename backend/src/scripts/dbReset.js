// Danger: drops the ENTIRE database (npm run db:reset runs this, then re-seeds).
// Dev-only convenience for starting fresh.
const dotenv = require("dotenv");
dotenv.config();

const mongoose = require("mongoose");
const { connectDatabase, disconnectDatabase } = require("../config/database");

async function reset() {
   if (!process.env.DATABASE_URI) {
      throw new Error("DATABASE_URI is not set");
   }
   if (process.env.NODE_ENV === "production") {
      throw new Error("Refusing to drop the database in production");
   }

   console.log("→ Connecting to database");
   await connectDatabase();

   const name = mongoose.connection.name;
   console.log(`→ Dropping database "${name}"`);
   await mongoose.connection.dropDatabase();
   console.log("  ✓ dropped");

   await disconnectDatabase();
   console.log("✅ db:reset complete — run db:init + db:seed to repopulate");
}

reset().catch(async (err) => {
   console.error("❌ db:reset failed:", err);
   try {
      await disconnectDatabase();
   } catch {
      // ignore disconnect errors during failure cleanup
   }
   process.exit(1);
});
