// One-shot script (npm run db:init) to: ensure all indexes exist + seed system roles.
// Safe to run repeatedly — uses upsert.
const dotenv = require("dotenv");
dotenv.config();

const { connectDatabase, disconnectDatabase } = require("../config/database");
const models = require("../models");
const { DEFAULT_ROLES, ROLES } = require("../constants/roles");
const { hashPassword } = require("../utils/password");

// Walk every model and build any missing indexes declared in its schema.
async function syncIndexes() {
   for (const [name, Model] of Object.entries(models)) {
      await Model.init();
      const indexes = await Model.listIndexes();
      console.log(`  ✓ ${name}: ${indexes.length} index(es)`);
   }
}

// Idempotent upsert of the built-in roles (student, coordinator, superAdmin).
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

// Seed the bootstrap super admin user.
// Idempotent — if a user with SUPERADMIN_EMAIL already exists, we only ensure role/active/verified flags
// are correct and leave the existing passwordHash alone.
async function seedSuperAdmin() {
   const { User } = models;
   const email = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
   const password = process.env.SUPERADMIN_PASSWORD;
   const name = process.env.SUPERADMIN_NAME || "Super Admin";

   if (!email || !password) {
      throw new Error(
         "SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD must be set in env to seed the super admin",
      );
   }

   const existing = await User.findOne({ email });
   if (existing) {
      existing.role = ROLES.SUPER_ADMIN;
      existing.isActive = true;
      existing.emailVerified = true;
      await existing.save();
      console.log(`  ✓ super admin already exists (${email}) — flags ensured`);
      return;
   }

   const passwordHash = await hashPassword(password);
   await User.create({
      email,
      passwordHash,
      name,
      role: ROLES.SUPER_ADMIN,
      emailVerified: true,
      isActive: true,
   });
   console.log(`  ✓ super admin created (${email})`);
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

   console.log("→ Seeding super admin user");
   await seedSuperAdmin();

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
