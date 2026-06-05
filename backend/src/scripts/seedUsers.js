// Idempotent seed (npm run db:seed:users) — creates demo students + one coordinator
// per club, wires up real ClubMemberships, and recomputes each club's memberCount.
// Run AFTER db:init and db:seed:clubs. Re-running is safe (upserts by email / user+club).
const dotenv = require("dotenv");
dotenv.config();

const { connectDatabase, disconnectDatabase } = require("../config/database");
const { Student, Faculty, Club, ClubMembership } = require("../models");
const { ROLES } = require("../constants/roles");
const { ROLE_WEIGHT } = require("../models/ClubMembership");
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

// Upsert a membership by (user, club). Approved rows get joinedAt + cleared terminal fields.
async function upsertMembership(userId, clubId, role, status) {
   await ClubMembership.findOneAndUpdate(
      { userId, clubId },
      {
         userId,
         clubId,
         role,
         roleWeight: ROLE_WEIGHT[role] ?? 0,
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

      // One dedicated faculty user per club (faculty system role + approved coordinator membership).
      const coordinator = await upsertUser({
         email: `coordinator.${club.slug}@college.edu`,
         name: `${club.name} Coordinator`,
         role: ROLES.FACULTY,
         dept: DEPARTMENTS[ci % DEPARTMENTS.length],
         year: "4",
         passwordHash,
      });
      await upsertMembership(coordinator._id, club._id, "coordinator", "approved");

      // Roughly a third of students join each club as approved members (deterministic).
      for (let si = 0; si < students.length; si++) {
         if ((si + ci) % 3 === 0) {
            await upsertMembership(students[si]._id, club._id, "member", "approved");
         }
      }

      // A couple of pending requests on approval-required clubs so the admin queue isn't empty.
      if (club.settings?.joinPolicy === "request") {
         for (let si = 0; si < students.length; si++) {
            if ((si + ci) % 3 !== 0 && (si + ci) % 7 === 1) {
               await upsertMembership(students[si]._id, club._id, "member", "pending");
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
