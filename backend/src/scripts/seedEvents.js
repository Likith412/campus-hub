// Idempotent seed (npm run db:seed:events) — every club's events from seedData/clubs,
// plus registrations drawn from its own members so capacity, waitlists and "my events"
// all have real rows behind them.
// Run AFTER db:seed:users. Re-running upserts by (club, title) and rebuilds registrations.
const dotenv = require("dotenv");
dotenv.config();

const { connectDatabase, disconnectDatabase } = require("../config/database");
const {
   Club,
   ClubRole,
   ClubMembership,
   Event,
   EventRegistration,
   User,
} = require("../models");
const { CLUBS } = require("./seedData/clubs");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// The event is filed under the club's coordinator when it has one, else its creator.
async function eventAuthor(club) {
   const role = await ClubRole.findOne({ clubId: club._id, slug: "coordinator" })
      .select("_id")
      .lean();
   if (role) {
      const coordinator = await ClubMembership.findOne({
         clubId: club._id,
         roleId: role._id,
         status: "approved",
      })
         .select("userId")
         .lean();
      if (coordinator) return coordinator.userId;
   }
   return club.createdBy;
}

// The club's approved students, oldest membership first — faculty run events rather than
// attend them, so a seeded faculty seat could never be cancelled from the UI.
async function studentMembers(clubId) {
   const approved = await ClubMembership.find({ clubId, status: "approved" })
      .sort({ joinedAt: 1 })
      .select("userId")
      .lean();
   const students = await User.find({
      _id: { $in: approved.map((m) => m.userId) },
      role: "student",
   })
      .select("_id")
      .lean();
   const ids = new Set(students.map((u) => String(u._id)));
   return approved.filter((m) => ids.has(String(m.userId))).map((m) => m.userId);
}

async function seed() {
   if (!process.env.DATABASE_URI) {
      throw new Error("DATABASE_URI is not set");
   }

   console.log("→ Connecting to database");
   await connectDatabase();

   const now = Date.now();
   let totalEvents = 0;
   let totalRegistrations = 0;

   for (const spec of CLUBS) {
      const club = await Club.findOne({ slug: spec.slug }).lean();
      if (!club) {
         console.log(`  – ${spec.slug}: club not found, skipped`);
         continue;
      }
      const createdBy = await eventAuthor(club);
      const members = await studentMembers(club._id);

      let seeded = 0;
      let regs = 0;
      for (const bp of spec.events) {
         const startAt = new Date(now + bp.startInDays * DAY);
         const endAt = new Date(startAt.getTime() + bp.hours * HOUR);
         // Sign-ups close a day before the doors open, but never before the event was
         // created — a past event keeps a deadline that sits just before its start.
         const deadline = new Date(startAt.getTime() - DAY);

         const event = await Event.findOneAndUpdate(
            { clubId: club._id, title: bp.title },
            {
               clubId: club._id,
               createdBy,
               title: bp.title,
               description: bp.description,
               eventType: bp.eventType,
               startAt,
               endAt,
               registrationDeadline: deadline,
               venue: bp.venue,
               capacity: bp.capacity ?? 0,
               waitlistEnabled: !!bp.waitlistEnabled,
               status: bp.status,
               tags: bp.tags || [],
               // An unverified club can't host a public event — the same rule the app
               // enforces in assertCanBePublic.
               visibility:
                  bp.visibility === "public" && club.verified ? "public" : "private",
            },
            { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
         );
         seeded++;

         // Rebuild from scratch so re-running can't double up.
         await EventRegistration.deleteMany({ eventId: event._id });

         const signUps = members.slice(0, bp.fill || 0);
         const seats = bp.capacity || signUps.length;
         const rows = signUps.map((userId, i) => ({
            eventId: event._id,
            userId,
            // Anyone past the seat count spills onto the waitlist, in sign-up order.
            status: i < seats ? "registered" : "waitlisted",
            // Stagger sign-ups so the waitlist has a genuine queue order.
            registeredAt: new Date(
               Math.min(startAt.getTime(), now) - (signUps.length - i) * 6 * HOUR,
            ),
         }));
         if (rows.length) {
            await EventRegistration.insertMany(rows);
            regs += rows.length;
         }
         await Event.updateOne(
            { _id: event._id },
            { $set: { "stats.registered": rows.filter((r) => r.status === "registered").length } },
         );
      }

      // seedClubs can't know how many events a club ends up with — set the real count.
      const liveEvents = await Event.countDocuments({
         clubId: club._id,
         status: { $ne: "draft" },
      });
      await Club.updateOne({ _id: club._id }, { $set: { "stats.eventCount": liveEvents } });

      totalEvents += seeded;
      totalRegistrations += regs;
      console.log(
         `  ✓ ${spec.slug.padEnd(18)} ${String(seeded).padStart(2)} events (${liveEvents} live) · ${String(regs).padStart(2)} registrations`,
      );
   }

   console.log(`→ ${totalEvents} events, ${totalRegistrations} registrations`);
   console.log("→ Disconnecting");
   await disconnectDatabase();
   console.log("✅ events seed complete");
}

seed().catch(async (err) => {
   console.error("❌ events seed failed:", err);
   try {
      await disconnectDatabase();
   } catch {
      // ignore disconnect errors during failure cleanup
   }
   process.exit(1);
});
