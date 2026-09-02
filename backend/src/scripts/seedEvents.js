// Idempotent seed (npm run db:seed:events) — events + registrations.
// Gives every active club two events and signs approved members up for them, so the events
// tab, the capacity/waitlist states and "my events" all have real data. See blueprintsFor()
// for how the four demo states are spread across the clubs.
// Run AFTER db:seed:users. Re-running is safe (upserts by club+title, registrations rebuilt).
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

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

// Blueprints are relative to "now" so the seed always produces a live-looking calendar.
// `fill` is how many approved members to sign up; anyone past capacity lands on the waitlist.
// Two events per club. Which second one a club gets alternates, so between them the
// clubs cover every state the UI has to render — capped/full/waitlisted, uncapped and
// open, a past event, and a draft only managers can see.
const CAPPED_EVENT = {
   title: "Flagship 24h Hackathon",
   eventType: "hackathon",
   description:
      "Overnight build sprint. Teams of up to four; seats are limited, waitlist opens when full.",
   dayOffset: 12,
   hours: 24,
   venue: {
      type: "hybrid",
      location: "Innovation Lab",
      meetingUrl: "https://meet.example.edu/hackathon",
   },
   capacity: 3,
   waitlistEnabled: true,
   status: "published",
   fill: 5, // deliberately over capacity — exercises the waitlist
};

const OPEN_EVENT = {
   title: "Intro Workshop: Getting Started",
   eventType: "workshop",
   description:
      "A hands-on session for new members — bring a laptop, no prior experience needed.",
   dayOffset: 5,
   hours: 2,
   venue: { type: "offline", location: "Seminar Hall B" },
   capacity: 0, // unlimited
   status: "published",
   fill: 3,
};

const PAST_EVENT = {
   title: "Season Recap & Social",
   eventType: "fun",
   description: "Wrap-up for the term — highlights, awards and pizza.",
   dayOffset: -14,
   hours: 3,
   venue: { type: "offline", location: "Open Air Theatre" },
   capacity: 0,
   status: "completed",
   fill: 4,
};

const DRAFT_EVENT = {
   title: "Committee Planning Sync",
   eventType: "seminar",
   description: "Internal planning for next term. Not published yet.",
   dayOffset: 30,
   hours: 1,
   venue: { type: "online", meetingUrl: "https://meet.example.edu/planning" },
   capacity: 0,
   status: "draft",
   fill: 0,
};

// Even-indexed clubs show the capped/past pair, odd ones the open/draft pair.
function blueprintsFor(clubIndex) {
   return clubIndex % 2 === 0
      ? [CAPPED_EVENT, PAST_EVENT]
      : [OPEN_EVENT, DRAFT_EVENT];
}

// Who the event is filed under: the club's coordinator when there is one, else its creator.
async function eventAuthor(club) {
   const coordinatorRole = await ClubRole.findOne({
      clubId: club._id,
      slug: "coordinator",
   })
      .select("_id")
      .lean();
   if (coordinatorRole) {
      const coordinator = await ClubMembership.findOne({
         clubId: club._id,
         roleId: coordinatorRole._id,
         status: "approved",
      })
         .select("userId")
         .lean();
      if (coordinator) return coordinator.userId;
   }
   return club.createdBy;
}

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

   console.log(`→ Seeding events for ${clubs.length} clubs`);
   const now = Date.now();

   for (let ci = 0; ci < clubs.length; ci++) {
      const club = clubs[ci];
      const createdBy = await eventAuthor(club);
      // Students only — faculty run events rather than join them, and the UI hides the
      // register control from them, so a seeded faculty seat couldn't be cancelled.
      const approved = await ClubMembership.find({
         clubId: club._id,
         status: "approved",
      })
         .select("userId")
         .lean();
      const studentIds = new Set(
         (
            await User.find({
               _id: { $in: approved.map((m) => m.userId) },
               role: "student",
            })
               .select("_id")
               .lean()
         ).map((u) => String(u._id)),
      );
      const members = approved
         .filter((m) => studentIds.has(String(m.userId)))
         .slice(0, 8);

      let seededEvents = 0;
      let seededRegistrations = 0;

      for (const bp of blueprintsFor(ci)) {
         const startAt = new Date(now + bp.dayOffset * DAY);
         const endAt = new Date(startAt.getTime() + bp.hours * HOUR);

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
               // Sign-ups close a day before the doors open.
               registrationDeadline: new Date(startAt.getTime() - DAY),
               venue: bp.venue,
               capacity: bp.capacity,
               waitlistEnabled: !!bp.waitlistEnabled,
               status: bp.status,
            },
            { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
         );
         seededEvents++;

         // Rebuild this event's registrations from scratch so re-running can't double-count.
         await EventRegistration.deleteMany({ eventId: event._id });

         const signUps = members.slice(0, bp.fill);
         if (signUps.length) {
            const seats = bp.capacity || signUps.length; // 0 = unlimited
            const rows = signUps.map((m, i) => ({
               eventId: event._id,
               userId: m.userId,
               // Anyone past the seat count spills onto the waitlist.
               status: i < seats ? "registered" : "waitlisted",
               // Stagger sign-up times so the waitlist has a real queue order.
               registeredAt: new Date(now - (signUps.length - i) * HOUR),
            }));
            await EventRegistration.insertMany(rows);
            seededRegistrations += rows.length;

            // Keep the denormalized counters in step with the rows just written.
            const held = rows.filter((r) => r.status !== "waitlisted").length;
            await Event.updateOne(
               { _id: event._id },
               { $set: { "stats.registered": held } },
            );
         } else {
            await Event.updateOne(
               { _id: event._id },
               { $set: { "stats.registered": 0 } },
            );
         }
      }

      // seedClubs can't know how many events a club ends up with — set the real count.
      const liveEvents = await Event.countDocuments({
         clubId: club._id,
         status: { $ne: "draft" },
      });
      await Club.updateOne(
         { _id: club._id },
         { $set: { "stats.eventCount": liveEvents } },
      );

      console.log(
         `  ✓ ${club.slug}: ${seededEvents} events (${liveEvents} live), ${seededRegistrations} registrations`,
      );
   }

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
