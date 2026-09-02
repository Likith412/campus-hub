// Idempotent seed (npm run db:seed:users) — the ten faculty and thirty students from
// seedData/people, their club memberships and follows, and the recomputed club counters.
// Run AFTER db:init and db:seed:clubs. Re-running upserts by email and by (user, club).
const dotenv = require("dotenv");
dotenv.config();

const { connectDatabase, disconnectDatabase } = require("../config/database");
const {
   Student,
   Faculty,
   Club,
   ClubMembership,
   ClubRole,
   ClubFollow,
} = require("../models");
const { systemRoleDocs } = require("../models/ClubRole");
const { hashPassword } = require("../utils/password");
const { FACULTY, STUDENTS, PAST_MEMBERSHIPS } = require("./seedData/people");

// Shared password for every seeded account — dev login convenience.
const PASSWORD = process.env.SEED_USER_PASSWORD || "Password@12345";
const DAY = 24 * 60 * 60 * 1000;

// Ensure a club's two system roles exist and return their ids keyed by slug.
async function systemRoleIds(clubId) {
   for (const doc of systemRoleDocs(clubId)) {
      await ClubRole.findOneAndUpdate(
         { clubId, slug: doc.slug },
         { $setOnInsert: doc },
         { upsert: true, setDefaultsOnInsert: true },
      );
   }
   const roles = await ClubRole.find({ clubId, slug: { $in: ["coordinator", "member"] } })
      .select("_id slug")
      .lean();
   return Object.fromEntries(roles.map((r) => [r.slug, r._id]));
}

async function upsertMembership(userId, clubId, roleId, status, joinedDaysAgo) {
   await ClubMembership.findOneAndUpdate(
      { userId, clubId },
      {
         userId,
         clubId,
         roleId,
         status,
         ...(status === "approved"
            ? {
                 joinedAt: new Date(Date.now() - joinedDaysAgo * DAY),
                 leftAt: null,
                 removedBy: null,
              }
            : {}),
      },
      { upsert: true, setDefaultsOnInsert: true },
   );
}

async function seed() {
   if (!process.env.DATABASE_URI) {
      throw new Error("DATABASE_URI is not set");
   }

   console.log("→ Connecting to database");
   await connectDatabase();

   const clubs = await Club.find({ status: "active" }).lean();
   if (!clubs.length) {
      throw new Error("No active clubs found — run npm run db:seed:clubs first");
   }
   const clubBySlug = new Map(clubs.map((c) => [c.slug, c]));
   const rolesByClub = new Map();
   for (const club of clubs) rolesByClub.set(club.slug, await systemRoleIds(club._id));

   const passwordHash = await hashPassword(PASSWORD);

   console.log(`→ Seeding ${FACULTY.length} faculty`);
   for (const f of FACULTY) {
      const { clubs: coordinates, lastLoginDaysAgo, ...fields } = f;
      const doc = await Faculty.findOneAndUpdate(
         { email: f.email },
         {
            ...fields,
            passwordHash,
            emailVerified: true,
            isActive: true,
            lastLoginAt: new Date(Date.now() - lastLoginDaysAgo * DAY),
         },
         { upsert: true, setDefaultsOnInsert: true, returnDocument: "after" },
      );
      for (const slug of coordinates) {
         const club = clubBySlug.get(slug);
         if (!club) continue;
         await upsertMembership(doc._id, club._id, rolesByClub.get(slug).coordinator, "approved", 400);
      }
      console.log(`  ✓ ${f.name.padEnd(26)} coordinates ${coordinates.join(", ")}`);
   }

   console.log(`→ Seeding ${STUDENTS.length} students`);
   for (const [i, s] of STUDENTS.entries()) {
      const { joins, follows, lastLoginDaysAgo, ...fields } = s;
      const doc = await Student.findOneAndUpdate(
         { email: s.email },
         {
            ...fields,
            passwordHash,
            emailVerified: true,
            isActive: true,
            lastLoginAt: new Date(Date.now() - lastLoginDaysAgo * DAY),
         },
         { upsert: true, setDefaultsOnInsert: true, returnDocument: "after" },
      );

      for (const [j, join] of joins.entries()) {
         const club = clubBySlug.get(join.slug);
         if (!club) continue;
         // Stagger join dates so "recently joined" sorts and the rosters look lived-in.
         await upsertMembership(
            doc._id,
            club._id,
            rolesByClub.get(join.slug).member,
            join.status,
            20 + i * 7 + j * 3,
         );
      }
      for (const slug of follows) {
         const club = clubBySlug.get(slug);
         if (!club) continue;
         await ClubFollow.findOneAndUpdate(
            { userId: doc._id, clubId: club._id },
            { $setOnInsert: { userId: doc._id, clubId: club._id } },
            { upsert: true, setDefaultsOnInsert: true },
         );
      }
   }
   console.log(`  ✓ ${STUDENTS.length} students with memberships and follows`);

   console.log(`→ Seeding ${PAST_MEMBERSHIPS.length} ended memberships`);
   for (const p of PAST_MEMBERSHIPS) {
      const club = clubBySlug.get(p.club);
      const student = await Student.findOne({ email: p.student }).select("_id").lean();
      if (!club || !student) continue;
      const removedBy = p.by
         ? await Faculty.findOne({ email: p.by }).select("_id").lean()
         : null;
      const at = new Date(Date.now() - p.daysAgo * DAY);
      await ClubMembership.findOneAndUpdate(
         { userId: student._id, clubId: club._id },
         {
            userId: student._id,
            clubId: club._id,
            roleId: rolesByClub.get(p.club).member,
            status: p.status,
            // A rejected request never became a membership, so it has no joinedAt.
            joinedAt: p.status === "rejected" ? null : new Date(at.getTime() - 90 * DAY),
            leftAt: p.status === "rejected" ? null : at,
            removedBy: removedBy?._id ?? null,
         },
         { upsert: true, setDefaultsOnInsert: true },
      );
   }

   console.log("→ Recomputing club counters");
   for (const club of clubs) {
      const [memberCount, followerCount] = await Promise.all([
         ClubMembership.countDocuments({ clubId: club._id, status: "approved" }),
         ClubFollow.countDocuments({ clubId: club._id }),
      ]);
      await Club.updateOne(
         { _id: club._id },
         { $set: { "stats.memberCount": memberCount, "stats.followerCount": followerCount } },
      );
      const pending = await ClubMembership.countDocuments({ clubId: club._id, status: "pending" });
      console.log(
         `  ✓ ${club.slug.padEnd(18)} ${String(memberCount).padStart(2)} members · ${String(followerCount).padStart(2)} followers${pending ? ` · ${pending} pending` : ""}`,
      );
   }

   console.log("→ Disconnecting");
   await disconnectDatabase();
   console.log(`✅ users seed complete — log in with any seeded email / "${PASSWORD}"`);
}

seed().catch(async (err) => {
   console.error("❌ users seed failed:", err);
   try {
      await disconnectDatabase();
   } catch {
      // ignore disconnect errors during failure cleanup
   }
   process.exit(1);
});
