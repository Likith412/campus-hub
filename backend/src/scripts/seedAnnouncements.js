// Idempotent seed (npm run db:seed:announcements) — a notice board per club.
// Each active club gets three announcements written by its coordinator: one pinned
// standing notice and two ordinary ones, so the board, the pinned-first ordering and
// the dashboard digest all have real data.
// Run AFTER db:seed:users. Re-running is safe (upserts by club + title).
const dotenv = require("dotenv");
dotenv.config();

const mongoose = require("mongoose");
const { connectDatabase, disconnectDatabase } = require("../config/database");
const {
   Club,
   ClubMembership,
   ClubRole,
} = require("../models");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// `agoDays` keeps the feed looking lived-in rather than all posted at once, and
// `visibility` gives each board a mix so the filter has something to filter.
const NOTICES = [
   {
      title: "How this club runs",
      visibility: "private",
      body: "Meetings are every Tuesday at 5pm. Bring your own laptop. Anything urgent goes here first — check this board before asking in person.\n\nIf you can't make a session, let a coordinator know a day ahead so we can keep numbers right.",
      pinned: true,
      agoDays: 21,
   },
   {
      title: "Recruitment for the core team is open",
      visibility: "public",
      body: "We're looking for two more people to help run sessions this semester. No prior experience needed — just turn up consistently and be willing to learn.\n\nSpeak to a coordinator at the next meeting if you're interested.",
      pinned: false,
      agoDays: 6,
   },
   {
      title: "Room change for this week",
      visibility: "private",
      body: "We're in the seminar hall this week instead of the usual room — the block is being repainted. Back to normal from next week.",
      pinned: false,
      agoDays: 1,
   },
];

async function seed() {
   console.log("→ Connecting to database");
   await connectDatabase();

   const clubs = await Club.find({ status: "active" }).select("_id name slug");
   if (clubs.length === 0) {
      console.log("⚠ no active clubs — run db:seed:clubs first");
      await disconnectDatabase();
      return;
   }

   const announcements = mongoose.connection.db.collection("announcements");

   let total = 0;
   for (const club of clubs) {
      // Post as the club's coordinator; without one there's nobody to author them.
      const coordinatorRole = await ClubRole.findOne({
         clubId: club._id,
         slug: "coordinator",
      }).select("_id");
      const membership = coordinatorRole
         ? await ClubMembership.findOne({
              clubId: club._id,
              roleId: coordinatorRole._id,
              status: "approved",
           }).select("userId")
         : null;

      if (!membership) {
         console.log(`  – ${club.slug}: no coordinator, skipped`);
         continue;
      }

      let seeded = 0;
      for (const n of NOTICES) {
         const createdAt = new Date(Date.now() - n.agoDays * DAY);
         // Raw driver on purpose: the schema's `timestamps: true` strips createdAt out
         // of a Mongoose $set (even with timestamps:false), leaving an empty no-op
         // update, and every notice would land on the same second.
         const res = await announcements.updateOne(
            { clubId: club._id, title: n.title },
            {
               $set: {
                  authorId: membership.userId,
                  body: n.body,
                  pinned: n.pinned,
                  visibility: n.visibility,
                  eventId: null,
                  createdAt,
                  updatedAt: createdAt,
               },
            },
            { upsert: true },
         );
         if (res.upsertedCount || res.modifiedCount) seeded += 1;
      }
      total += seeded;
      console.log(`  ✓ ${club.slug}: ${NOTICES.length} announcements`);
   }

   console.log(`→ ${total} announcements written`);
   console.log("→ Disconnecting");
   await disconnectDatabase();
   console.log("✅ announcements seed complete");
}

seed().catch(async (err) => {
   console.error("❌ announcements seed failed:", err);
   try {
      await disconnectDatabase();
   } catch {
      // ignore disconnect errors during failure cleanup
   }
   process.exit(1);
});
