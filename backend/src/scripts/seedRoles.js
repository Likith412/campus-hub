// Idempotent seed (npm run db:seed:roles) — Phase 6 per-club roles.
// For every active club: ensures the two system roles (coordinator/member), creates a
// few custom roles, and assigns a handful of approved student members to them so the
// Roles page, coloured badges, and the role switcher all have real data.
// Run AFTER db:seed:users. Re-running is safe (upserts by club+slug).
const dotenv = require("dotenv");
dotenv.config();

const { connectDatabase, disconnectDatabase } = require("../config/database");
const { Club, ClubRole, ClubMembership } = require("../models");
const { systemRoleDocs } = require("../models/ClubRole");

// Custom roles seeded into every club (weights 1..99, varied permission subsets).
const CUSTOM_ROLES = [
   {
      name: "President",
      slug: "president",
      roleWeight: 80,
      color: "#a855f7",
      permissions: [
         "club:edit",
         "members:moderate",
         "members:assign-role",
         "announcements:create",
         "announcements:pin",
         "events:create",
         "events:edit",
      ],
   },
   {
      name: "Tech Lead",
      slug: "tech-lead",
      roleWeight: 60,
      color: "#3b82f6",
      permissions: [
         "events:create",
         "events:edit",
         "announcements:create",
      ],
   },
   {
      name: "Volunteer",
      slug: "volunteer",
      roleWeight: 30,
      color: "#34d399",
      permissions: ["events:edit"],
   },
];

// How many members to drop into each custom role per club.
const ASSIGN_PLAN = [
   { slug: "president", count: 1 },
   { slug: "tech-lead", count: 1 },
   { slug: "volunteer", count: 1 },
];

async function seed() {
   if (!process.env.DATABASE_URI) {
      throw new Error("DATABASE_URI is not set");
   }

   console.log("→ Connecting to database");
   await connectDatabase();

   const clubs = await Club.find({ status: "active" }).sort({ slug: 1 }).lean();
   if (!clubs.length) {
      throw new Error("No active clubs — run db:seed:clubs + db:seed:users first");
   }

   console.log(`→ Seeding roles for ${clubs.length} clubs`);
   for (const club of clubs) {
      // System roles (coordinator / member) — only insert if missing.
      for (const doc of systemRoleDocs(club._id)) {
         await ClubRole.findOneAndUpdate(
            { clubId: club._id, slug: doc.slug },
            { $setOnInsert: doc },
            { upsert: true, setDefaultsOnInsert: true },
         );
      }

      // Custom roles.
      for (const r of CUSTOM_ROLES) {
         await ClubRole.findOneAndUpdate(
            { clubId: club._id, slug: r.slug },
            { ...r, clubId: club._id, isSystem: false },
            { upsert: true, setDefaultsOnInsert: true },
         );
      }

      // Map each role slug → its ClubRole _id for this club (membership.roleId targets).
      const roleDocs = await ClubRole.find({ clubId: club._id })
         .select("_id slug")
         .lean();
      const idBySlug = Object.fromEntries(roleDocs.map((r) => [r.slug, r._id]));

      // Assign approved student members (still in the "member" role) into the custom roles.
      const members = await ClubMembership.find({
         clubId: club._id,
         status: "approved",
         roleId: idBySlug.member,
      })
         .limit(8)
         .lean();

      let idx = 0;
      let assigned = 0;
      for (const plan of ASSIGN_PLAN) {
         for (let k = 0; k < plan.count && idx < members.length; k++, idx++) {
            await ClubMembership.updateOne(
               { _id: members[idx]._id },
               { $set: { roleId: idBySlug[plan.slug] } },
            );
            assigned++;
         }
      }

      console.log(
         `  ✓ ${club.slug}: 2 system + ${CUSTOM_ROLES.length} custom roles, ${assigned} members reassigned`,
      );
   }

   console.log("→ Disconnecting");
   await disconnectDatabase();
   console.log("✅ roles seed complete");
}

seed().catch(async (err) => {
   console.error("❌ roles seed failed:", err);
   try {
      await disconnectDatabase();
   } catch {
      // ignore disconnect errors during failure cleanup
   }
   process.exit(1);
});
