// Idempotent seed (npm run db:seed:clubs) — upserts the demo clubs from seedData/clubs.
// Re-running refreshes each club by slug rather than duplicating it.
const dotenv = require("dotenv");
dotenv.config();

const { connectDatabase, disconnectDatabase } = require("../config/database");
const { Club, User } = require("../models");
const { ROLES } = require("../constants/roles");
const { CLUBS } = require("./seedData/clubs");

async function seed() {
   if (!process.env.DATABASE_URI) {
      throw new Error("DATABASE_URI is not set");
   }
   const email = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
   if (!email) {
      throw new Error("SUPERADMIN_EMAIL must be set — run db:init first");
   }

   console.log("→ Connecting to database");
   await connectDatabase();

   const owner = await User.findOne({ email, role: ROLES.SUPER_ADMIN }).lean();
   if (!owner) {
      throw new Error(`No super admin found for ${email} — run npm run db:init first`);
   }

   console.log(`→ Seeding ${CLUBS.length} clubs (owner: ${email})`);
   for (const c of CLUBS) {
      // events/announcements live in the same record for authoring convenience, but they
      // belong to the other two seeds — keep them out of the club document.
      const { events, announcements, ...fields } = c;
      await Club.findOneAndUpdate(
         { slug: c.slug },
         { ...fields, status: "active", createdBy: owner._id },
         { upsert: true, setDefaultsOnInsert: true, returnDocument: "after" },
      );
      console.log(
         `  ✓ ${c.slug.padEnd(18)} ${c.verified ? "verified" : "unverified"} · ${c.settings.joinPolicy}`,
      );
   }

   console.log("→ Disconnecting");
   await disconnectDatabase();
   console.log("✅ clubs seed complete");
}

seed().catch(async (err) => {
   console.error("❌ seed failed:", err);
   try {
      await disconnectDatabase();
   } catch {
      // ignore disconnect errors during failure cleanup
   }
   process.exit(1);
});
