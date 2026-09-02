// Idempotent seed (npm run db:seed:users) — creates demo students + one coordinator
// per club, wires up real ClubMemberships, and recomputes each club's memberCount.
// Run AFTER db:init and db:seed:clubs. Re-running is safe (upserts by email / user+club).
const dotenv = require("dotenv");
dotenv.config();

const { connectDatabase, disconnectDatabase } = require("../config/database");
const { Student, Faculty, Club, ClubMembership, ClubRole } = require("../models");
const { systemRoleDocs } = require("../models/ClubRole");
const { ROLES } = require("../constants/roles");
const { hashPassword } = require("../utils/password");

// Shared password for every seeded user — dev login convenience.
const PASSWORD = process.env.SEED_USER_PASSWORD || "Password@12345";

const DEPARTMENTS = ["CSE", "ECE", "ME", "CE", "EEE", "IT", "MME", "CHE"];
const YEARS = ["1", "2", "3", "4", "postgrad"];

const STUDENT_NAMES = [
   "Aarav Sharma", "Diya Patel", "Vivaan Reddy", "Ananya Iyer",
   "Aditya Nair", "Ishita Rao", "Arjun Menon", "Saanvi Gupta",
   "Reyansh Kumar", "Myra Joshi", "Kabir Singh", "Aadhya Pillai",
   "Krishna Verma", "Anika Desai", "Rohan Bhat", "Navya Shetty",
   "Dhruv Agarwal", "Kiara Fernandes", "Ayaan Khan", "Tara Mishra",
   "Vihaan Chauhan", "Riya Das", "Shaurya Kulkarni", "Meera Banerjee",
];

// Upsert a user by email via the role discriminator (sets the right subtype + fields).
async function upsertUser({ email, name, role, dept, year, passwordHash }) {
   const Model = role === ROLES.FACULTY ? Faculty : Student;
   const profile =
      role === ROLES.FACULTY
         ? { department: dept }
         : { department: dept, year };
   const doc = await Model.findOneAndUpdate(
      { email },
      { email, name, passwordHash, emailVerified: true, isActive: true, profile },
      { upsert: true, setDefaultsOnInsert: true, returnDocument: "after" },
   );
   return doc;
}

// Ensure a club's system roles exist and return their ids keyed by slug.
async function systemRoleIds(clubId) {
   for (const doc of systemRoleDocs(clubId)) {
      await ClubRole.findOneAndUpdate(
         { clubId, slug: doc.slug },
         { $setOnInsert: doc },
         { upsert: true, setDefaultsOnInsert: true },
      );
   }
   const roles = await ClubRole.find({
      clubId,
      slug: { $in: ["coordinator", "member"] },
   })
      .select("_id slug")
      .lean();
   return Object.fromEntries(roles.map((r) => [r.slug, r._id]));
}

// Upsert a membership by (user, club). Approved rows get joinedAt + cleared terminal fields.
async function upsertMembership(userId, clubId, roleId, status) {
   await ClubMembership.findOneAndUpdate(
      { userId, clubId },
      {
         userId,
         clubId,
         roleId,
         status,
         ...(status === "approved"
            ? { joinedAt: new Date(), leftAt: null, removedBy: null }
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

   const clubs = await Club.find({ status: "active" }).sort({ slug: 1 }).lean();
   if (!clubs.length) {
      throw new Error("No active clubs found — run npm run db:seed:clubs first");
   }

   const passwordHash = await hashPassword(PASSWORD);

   console.log(`→ Seeding ${STUDENT_NAMES.length} students`);
   const students = [];
   for (let i = 0; i < STUDENT_NAMES.length; i++) {
      const student = await upsertUser({
         email: `student${i + 1}@college.edu`,
         name: STUDENT_NAMES[i],
         role: ROLES.STUDENT,
         dept: DEPARTMENTS[i % DEPARTMENTS.length],
         year: YEARS[i % YEARS.length],
         passwordHash,
      });
      students.push(student);
   }

   console.log(`→ Seeding coordinators + memberships for ${clubs.length} clubs`);
   for (let ci = 0; ci < clubs.length; ci++) {
      const club = clubs[ci];
      const sys = await systemRoleIds(club._id);

      // One dedicated faculty user per club (faculty system role + approved coordinator membership).
      const coordinator = await upsertUser({
         email: `coordinator.${club.slug}@college.edu`,
         name: `${club.name} Coordinator`,
         role: ROLES.FACULTY,
         dept: DEPARTMENTS[ci % DEPARTMENTS.length],
         year: "4",
         passwordHash,
      });
      await upsertMembership(coordinator._id, club._id, sys.coordinator, "approved");

      // A small, deterministic slice of students joins each club (every 6th).
      for (let si = 0; si < students.length; si++) {
         if ((si + ci) % 6 === 0) {
            await upsertMembership(students[si]._id, club._id, sys.member, "approved");
         }
      }

      // A couple of pending requests on approval-required clubs so the admin queue isn't empty.
      if (club.settings?.joinPolicy === "request") {
         for (let si = 0; si < students.length; si++) {
            if ((si + ci) % 6 !== 0 && (si + ci) % 7 === 1) {
               await upsertMembership(students[si]._id, club._id, sys.member, "pending");
            }
         }
      }

      // Recompute the denormalized counter from the real approved memberships.
      const memberCount = await ClubMembership.countDocuments({
         clubId: club._id,
         status: "approved",
      });
      await Club.updateOne(
         { _id: club._id },
         { $set: { "stats.memberCount": memberCount } },
      );
      console.log(`  ✓ ${club.slug}: ${memberCount} members (incl. 1 coordinator)`);
   }

   // A demo faculty who coordinates several clubs — exercises the sidebar club switcher.
   const MULTI = clubs.slice(0, Math.min(4, clubs.length));
   if (MULTI.length) {
      const priya = await upsertUser({
         email: "priya.nair@college.edu",
         name: "Dr. Priya Nair",
         role: ROLES.FACULTY,
         dept: "CSE",
         passwordHash,
      });
      for (const club of MULTI) {
         const sys = await systemRoleIds(club._id);
         await upsertMembership(priya._id, club._id, sys.coordinator, "approved");
         const memberCount = await ClubMembership.countDocuments({
            clubId: club._id,
            status: "approved",
         });
         await Club.updateOne(
            { _id: club._id },
            { $set: { "stats.memberCount": memberCount } },
         );
      }
      console.log(
         `  ✓ Dr. Priya Nair coordinates ${MULTI.length} clubs: ${MULTI.map((c) => c.slug).join(", ")}`,
      );
   }

   console.log("→ Disconnecting");
   await disconnectDatabase();
   console.log(`✅ users seed complete — login with any seeded email / "${PASSWORD}"`);
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
