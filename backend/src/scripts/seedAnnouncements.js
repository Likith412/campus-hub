// Idempotent seed (npm run db:seed:announcements) — each club's notice board from
// seedData/clubs, posted by that club's coordinator and back-dated so the feed reads
// as though it accumulated over a term.
// Run AFTER db:seed:events (notices that reference an event need it to exist).
const dotenv = require("dotenv");
dotenv.config();

const mongoose = require("mongoose");
const { connectDatabase, disconnectDatabase } = require("../config/database");
const { Club, ClubMembership, ClubRole, Event } = require("../models");
const { CLUBS } = require("./seedData/clubs");

const DAY = 24 * 60 * 60 * 1000;

async function seed() {
   if (!process.env.DATABASE_URI) {
      throw new Error("DATABASE_URI is not set");
   }
   console.log("→ Connecting to database");
   await connectDatabase();

   const announcements = mongoose.connection.db.collection("announcements");
   let total = 0;

   for (const spec of CLUBS) {
      const club = await Club.findOne({ slug: spec.slug }).select("_id slug").lean();
      if (!club) continue;

      // Posted as the club's coordinator; without one there is nobody to author them.
      const role = await ClubRole.findOne({ clubId: club._id, slug: "coordinator" })
         .select("_id")
         .lean();
      const membership = role
         ? await ClubMembership.findOne({
              clubId: club._id,
              roleId: role._id,
              status: "approved",
           })
              .select("userId")
              .lean()
         : null;
      if (!membership) {
         console.log(`  – ${spec.slug}: no coordinator, skipped`);
         continue;
      }

      for (const n of spec.announcements) {
         // A notice can point at one of its club's events; resolve by title.
         let eventId = null;
         if (n.linkEvent) {
            const event = await Event.findOne({ clubId: club._id, title: n.linkEvent })
               .select("_id")
               .lean();
            eventId = event?._id ?? null;
         }
         const createdAt = new Date(Date.now() - n.agoDays * DAY);
         // Raw driver on purpose: the schema's `timestamps: true` strips createdAt out of
         // a Mongoose $set, so every notice would otherwise land on the same second.
         await announcements.updateOne(
            { clubId: club._id, title: n.title },
            {
               $set: {
                  authorId: membership.userId,
                  body: n.body,
                  pinned: !!n.pinned,
                  visibility: n.visibility,
                  eventId,
                  createdAt,
                  updatedAt: createdAt,
               },
            },
            { upsert: true },
         );
         total++;
      }
      const linked = spec.announcements.filter((n) => n.linkEvent).length;
      console.log(
         `  ✓ ${spec.slug.padEnd(18)} ${spec.announcements.length} notices${linked ? ` (${linked} linked to an event)` : ""}`,
      );
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
