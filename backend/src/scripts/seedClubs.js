// Idempotent seed (npm run db:seed:clubs) — upserts a set of demo clubs.
// Use to populate the browse page during development.
// Re-running won't duplicate; it refreshes the doc for each slug.
const dotenv = require("dotenv");
dotenv.config();

const { connectDatabase, disconnectDatabase } = require("../config/database");
const { Club, User } = require("../models");
const { ROLES } = require("../constants/roles");

const CLUBS = [
   {
      slug: "ai-club",
      name: "AI Club",
      category: "tech",
      description:
         "Building production AI, hands-on. Workshops, contests, and talks from industry researchers.",
      tags: ["ML", "LLM", "workshops"],
      stats: { memberCount: 412, eventCount: 42, totalEngagement: 980 },
      settings: { joinPolicy: "open" },
      foundedYear: 2021,
      coverFrom: "#6c63ff",
      coverTo: "#34d399",
   },
   {
      slug: "codeforces-nitk",
      name: "CodeForces NITK",
      category: "tech",
      description:
         "Competitive programming, ICPC training and ByteBlitz contests every month.",
      tags: ["DSA", "contests", "ICPC"],
      stats: { memberCount: 328, eventCount: 36, totalEngagement: 840 },
      settings: { joinPolicy: "open" },
      foundedYear: 2019,
      coverFrom: "#3b82f6",
      coverTo: "#60a5fa",
   },
   {
      slug: "webdev-society",
      name: "WebDev Society",
      category: "tech",
      description:
         "Frontend, backend, full-stack. Real production gigs for the campus.",
      tags: ["React", "Node", "UI"],
      stats: { memberCount: 154, eventCount: 28, totalEngagement: 560 },
      settings: { joinPolicy: "open" },
      foundedYear: 2020,
      coverFrom: "#ef4444",
      coverTo: "#fca5a5",
   },
   {
      slug: "e-cell",
      name: "E-Cell",
      category: "business",
      description:
         "Build a startup, learn from founders, win pitch competitions. 6 alumni in YC.",
      tags: ["startup", "founders", "pitch"],
      stats: { memberCount: 298, eventCount: 18, totalEngagement: 720 },
      settings: { joinPolicy: "open" },
      foundedYear: 2017,
      coverFrom: "#4338ca",
      coverTo: "#818cf8",
   },
   {
      slug: "robotics-club",
      name: "Robotics Club",
      category: "tech",
      description:
         "Building autonomous bots, drones, and humanoid prototypes for inter-college expos.",
      tags: ["hardware", "ROS", "arduino"],
      stats: { memberCount: 220, eventCount: 14, totalEngagement: 510 },
      settings: { joinPolicy: "request" },
      foundedYear: 2018,
      coverFrom: "#064e3b",
      coverTo: "#34d399",
   },
   {
      slug: "design-studio",
      name: "Design Studio",
      category: "design",
      description:
         "Product design, branding, motion. Posters & identity for every event on campus.",
      tags: ["Figma", "branding", "UX"],
      stats: { memberCount: 186, eventCount: 22, totalEngagement: 620 },
      settings: { joinPolicy: "open" },
      foundedYear: 2020,
      coverFrom: "#f59e0b",
      coverTo: "#fcd34d",
   },
   {
      slug: "literary-society",
      name: "Literary Society",
      category: "culture",
      description:
         'Poetry slams, debate, creative writing workshops. The "Spinaker" magazine.',
      tags: ["poetry", "debate", "prose"],
      stats: { memberCount: 142, eventCount: 16, totalEngagement: 440 },
      settings: { joinPolicy: "open" },
      foundedYear: 1992,
      coverFrom: "#991b1b",
      coverTo: "#ef4444",
   },
   {
      slug: "music-club",
      name: "Music Club",
      category: "culture",
      description:
         "Bands, choir, classical, Western. Open jam every Friday at the open-air amphitheater.",
      tags: ["rock", "classical", "jam"],
      stats: { memberCount: 178, eventCount: 14, totalEngagement: 480 },
      settings: { joinPolicy: "open" },
      foundedYear: 1985,
      coverFrom: "#be185d",
      coverTo: "#f9a8d4",
   },
   {
      slug: "photography-club",
      name: "Photography Club",
      category: "media",
      description:
         "Wildlife, street, portrait. Cameras to lend & monthly photowalks.",
      tags: ["DSLR", "street", "wildlife"],
      stats: { memberCount: 148, eventCount: 9, totalEngagement: 360 },
      settings: { joinPolicy: "request" },
      foundedYear: 2015,
      coverFrom: "#6366f1",
      coverTo: "#a78bfa",
   },
   {
      slug: "quantum-computing",
      name: "Quantum Computing",
      category: "tech",
      description:
         "Brand new! Reading group for Qiskit, Q#, and the foundational textbooks.",
      tags: ["Qiskit", "reading", "new"],
      stats: { memberCount: 12, eventCount: 0, totalEngagement: 20 },
      settings: { joinPolicy: "request" },
      foundedYear: 2026,
      coverFrom: "#4338ca",
      coverTo: "#818cf8",
   },
   {
      slug: "film-makers",
      name: "Film Makers",
      category: "media",
      description:
         "Shorts, documentaries, fest submissions. Campus film festival in March.",
      tags: ["cinema", "editing", "shoot"],
      stats: { memberCount: 96, eventCount: 8, totalEngagement: 280 },
      settings: { joinPolicy: "request" },
      foundedYear: 2018,
      coverFrom: "#831843",
      coverTo: "#ec4899",
   },
   {
      slug: "sports-council",
      name: "Sports Council",
      category: "sports",
      description:
         "Coordinates all inter-college sports tournaments. Cricket, football, basketball, badminton.",
      tags: ["cricket", "football", "tournament"],
      stats: { memberCount: 284, eventCount: 24, totalEngagement: 660 },
      settings: { joinPolicy: "invite-only" },
      foundedYear: 2002,
      coverFrom: "#047857",
      coverTo: "#6ee7b7",
   },
];

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
      throw new Error(
         `No super admin found for ${email} — run npm run db:init first`,
      );
   }

   // Leave a few unverified so the "unverified" state is visible in the UI.
   const UNVERIFIED = new Set([
      "quantum-computing",
      "film-makers",
      "photography-club",
   ]);

   console.log(`→ Seeding ${CLUBS.length} clubs (owner: ${email})`);
   for (const c of CLUBS) {
      const doc = {
         ...c,
         status: "active",
         verified: !UNVERIFIED.has(c.slug),
         createdBy: owner._id,
      };
      await Club.findOneAndUpdate({ slug: c.slug }, doc, {
         upsert: true,
         setDefaultsOnInsert: true,
         returnDocument: "after",
      });
      console.log(`  ✓ ${c.slug}`);
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
