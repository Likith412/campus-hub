// One-shot script (npm run db:init) to: ensure all indexes exist + seed system roles.
// Safe to run repeatedly — uses upsert.
const dotenv = require("dotenv");
dotenv.config();

const { connectDatabase, disconnectDatabase } = require("../config/database");
const models = require("../models");
const { DEFAULT_ROLES } = require("../constants/roles");

// Walk every model and build any missing indexes declared in its schema.
async function syncIndexes() {
   for (const [name, Model] of Object.entries(models)) {
      await Model.init();
      const indexes = await Model.listIndexes();
      console.log(`  ✓ ${name}: ${indexes.length} index(es)`);
   }
}

// Idempotent upsert of the built-in roles (student, clubAdmin, superAdmin).
async function seedRoles() {
   const { Role } = models;
   for (const role of DEFAULT_ROLES) {
      await Role.findOneAndUpdate({ name: role.name }, role, {
         upsert: true,
         setDefaultsOnInsert: true,
         returnDocument: "after",
      });
      console.log(
         `  ✓ ${role.name} (${role.permissions.length} permission(s))`,
      );
   }
}

async function init() {
   if (!process.env.DATABASE_URI) {
      throw new Error("DATABASE_URI is not set");
   }

   console.log("→ Connecting to database");
   await connectDatabase();

   console.log("→ Syncing collection indexes");
   await syncIndexes();

   console.log("→ Seeding system roles");
   await seedRoles();

   console.log("→ Disconnecting");
   await disconnectDatabase();

   console.log("✅ db:init complete");
}

init().catch(async (err) => {
   console.error("❌ db:init failed:", err);
   try {
      await disconnectDatabase();
   } catch {
      // ignore disconnect errors during failure cleanup
   }
   process.exit(1);
});
