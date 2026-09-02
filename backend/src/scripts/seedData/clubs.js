// The twelve clubs, each with its own events and notice board. Everything here is
// written per-club rather than templated, so no two boards read the same.
//
// Events are positioned relative to the moment the seed runs:
//   startInDays  negative = already happened, 0-ish = in progress right now, positive = upcoming
//   hours        how long it runs
//   fill         how many club members to sign up (anyone past `capacity` lands on the waitlist)
// A club that isn't verified can only host private events — assertCanBePublic enforces
// the same rule in the app, and the seed respects it rather than working around it.

const CLUBS = [
   {
      slug: "ai-club",
      name: "AI & ML Collective",
      category: "tech",
      tagline: "Read the paper, then build the thing.",
      description:
         "We are a working group, not a lecture series. Every fortnight one member presents a paper they have actually implemented — code first, slides second — and the room pulls it apart. In between we run hands-on sessions on the parts nobody writes tutorials about: getting a model off a notebook and onto a server, evaluating it honestly, and noticing when it has learned the wrong thing.\n\nMembers range from first-years who have never trained anything to MTech students halfway through a thesis. You do not need a background in maths to start; you do need to be willing to be wrong in public, which is most of what the reading group is for.\n\nWe keep a shared GPU box, a reading backlog that is far too long, and a standing rule that any project demoed at the end of term has to run live in front of everyone.",
      tags: ["Machine Learning", "LLMs", "Research", "MLOps"],
      settings: { joinPolicy: "open", isPrivate: false },
      foundedYear: 2021,
      verified: true,
      coverFrom: "#6c63ff",
      coverTo: "#34d399",
      socialLinks: {
         website: "https://aicollective.college.edu",
         instagram: "https://instagram.com/aicollective.campus",
         linkedin: "https://linkedin.com/company/ai-collective-campus",
      },
      events: [
         {
            title: "Paper Night: Attention Is All You Need, Eight Years On",
            eventType: "seminar",
            description:
               "We are going back to the transformer paper and reading it the way you would read it today, knowing what came after. Krishna will walk through the architecture on the board, then we compare the original scaled dot-product attention against what current implementations actually ship — flash attention, grouped queries, rotary embeddings.\n\nBring the paper. Bring questions. This is the session where asking 'wait, why does that work' is the entire point.",
            startInDays: 4, hours: 2,
            venue: { type: "offline", location: "CSE Seminar Hall B" },
            capacity: 40, waitlistEnabled: true, status: "published", visibility: "public",
            tags: ["transformers", "reading group"], fill: 6,
         },
         {
            title: "Fine-Tuning Clinic: Bring Your Own Dataset",
            eventType: "workshop",
            description:
               "A four-hour working session. Turn up with a dataset and a question; leave with a fine-tuned model and an honest evaluation of whether it was worth doing.\n\nWe will cover dataset hygiene first — deduplication, leakage between splits, the class imbalance you did not notice — because that is where most of the damage happens. Then LoRA adapters, a training run small enough to finish inside the session, and an evaluation harness you can keep.\n\nLaptops required. A GPU is not: we will run on the club box over SSH. If you do not have a dataset, we will hand you one.",
            startInDays: 11, hours: 4,
            venue: { type: "hybrid", location: "Innovation Lab", meetingUrl: "https://meet.college.edu/ai-clinic" },
            capacity: 4, waitlistEnabled: true, status: "published", visibility: "public",
            tags: ["fine-tuning", "hands-on", "LoRA"], fill: 9,
         },
         {
            title: "Ethics Slot: When the Model Is Confidently Wrong",
            eventType: "seminar",
            description:
               "Zoya runs this one. We take three real deployments that failed — a hiring screen, a medical triage tool, a content classifier — and work backwards from the harm to the decision that caused it. Usually it is not the model. Usually it is the objective.\n\nNo prerequisites, no maths. Forty-five minutes of discussion and it consistently runs long.",
            startInDays: -0.05, hours: 2,
            venue: { type: "offline", location: "CSE Block, Room 214" },
            capacity: 0, status: "published", visibility: "public",
            tags: ["ethics", "discussion"], fill: 5,
         },
         {
            title: "Winter Model Showcase",
            eventType: "contest",
            description:
               "End-of-term demo day. Every project group gets eight minutes and a live run — no recorded demos, no slides-only submissions. Dr. Nair and two guests from industry judge on whether the thing works and whether you can explain why.\n\nLast year's winner was a Malayalam speech-to-text model trained on eleven hours of scraped audio. The bar is 'genuinely useful', not 'technically impressive'.",
            startInDays: -21, hours: 5,
            venue: { type: "offline", location: "Main Auditorium" },
            capacity: 120, status: "published", visibility: "public",
            tags: ["showcase", "demo day"], fill: 8,
         },
         {
            title: "Reading Group: Mixture-of-Experts Routing",
            eventType: "seminar",
            description:
               "Draft — Priya is still deciding whether to run this before or after the showcase, and whether we need two sessions to do the routing maths properly. Do not announce yet.",
            startInDays: 26, hours: 2,
            venue: { type: "online", meetingUrl: "https://meet.college.edu/ai-moe" },
            capacity: 0, status: "draft", visibility: "private",
            tags: ["MoE", "reading group"], fill: 0,
         },
      ],
      announcements: [
         {
            title: "How the collective actually works",
            visibility: "private", pinned: true, agoDays: 34,
            body: "Read this before your first session.\n\nWe meet Tuesdays at 5pm in CSE Seminar Hall B. Paper nights are every second Tuesday; the weeks in between are working sessions where people just sit and build with others around.\n\nThe GPU box is shared. Book a slot on the sheet in the channel, keep runs under six hours, and kill anything you are not actively watching. If you need longer, ask — it is usually fine, we just need to know.\n\nThere is no attendance requirement and no membership fee. The only real expectation is that if you sign up to present, you present. Swapping is fine if you give a week's notice; vanishing is not.",
         },
         {
            title: "GPU box is back up — CUDA 12.4, drivers updated",
            visibility: "private", pinned: false, agoDays: 3,
            body: "The box was down for four days while the driver upgrade fought with the kernel. It is back and everything is on CUDA 12.4 now.\n\nIf you had an environment pinned to 11.8 it will need rebuilding. There is a working conda spec in the repo under infra/env-cuda124.yml — start from that rather than debugging your old one.\n\nSorry for the timing, I know two of you lost training runs.",
         },
         {
            title: "Fine-tuning clinic: what to bring",
            visibility: "public", pinned: false, agoDays: 1, linkEvent: "Fine-Tuning Clinic: Bring Your Own Dataset",
            body: "A few people have asked what preparation is needed for the clinic.\n\nBring a laptop that can hold an SSH session and a dataset you actually care about — a few hundred labelled examples is plenty, this is not about scale. CSV or JSONL both work.\n\nIf you do not have a dataset, say so when you register and we will pair you with someone who does. Working on somebody else's problem is a perfectly good way to spend the afternoon.\n\nNo need to install anything beforehand. Everything runs on the club box.",
         },
      ],
   },
   {
      slug: "codeforces-nitk",
      name: "CodeForces NITK",
      category: "tech",
      tagline: "Two hours a week, every week, for two years.",
      description:
         "Competitive programming, taken seriously. We run a training ladder rather than a set of lectures: you get problems matched to where you actually are, you solve them, and someone reviews your solution properly. The ladder runs from 'I know a for loop' up to ICPC regional level, and people move at very different speeds, which is fine.\n\nContests every second Sunday, editorials published within forty-eight hours, and a weekly upsolving session where we work through whatever nobody managed during the round. Prof. Deshpande coaches the ICPC squad and picks the teams in October.\n\nThe uncomfortable truth about this sport is that it clicks somewhere around month three, and most people quit in month two. The ladder exists to get you to month four.",
      tags: ["DSA", "ICPC", "Contests", "C++"],
      settings: { joinPolicy: "open", isPrivate: false },
      foundedYear: 2019,
      verified: true,
      coverFrom: "#3b82f6",
      coverTo: "#60a5fa",
      socialLinks: {
         website: "https://cp.college.edu",
         instagram: "https://instagram.com/codeforces.nitk",
         linkedin: "https://linkedin.com/company/codeforces-nitk",
      },
      events: [
         {
            title: "ByteBlitz #47 — Div 2 Rated Round",
            eventType: "contest",
            description:
               "Five problems, two and a half hours, rated for anyone under 1600. Problems are set by Shaurya and Vivaan and tested by the ICPC squad, so the difficulty curve is deliberate: A and B are approachable for a first-timer, C is the one that decides the standings, D and E are for the top of the room.\n\nEditorial goes up on the club site within two days. Upsolving session the following Wednesday — come even if you solved nothing, especially if you solved nothing.",
            startInDays: 6, hours: 2.5,
            venue: { type: "online", meetingUrl: "https://contest.college.edu/byteblitz47" },
            capacity: 0, status: "published", visibility: "public",
            tags: ["rated", "div2"], fill: 7,
         },
         {
            title: "ICPC Regionals — Team Selection Round",
            eventType: "contest",
            description:
               "Selection for the three teams going to regionals. Five hours, one machine per team of three, ICPC rules — no internet, printed reference only.\n\nTeams are provisional going in; the coach reserves the right to reshuffle after seeing how people work together under time pressure, which is at least half of what this is testing. Seats are capped at eight teams and the waitlist is real.",
            startInDays: 17, hours: 5,
            venue: { type: "offline", location: "CSE Lab 3" },
            capacity: 3, waitlistEnabled: true, status: "published", visibility: "public",
            tags: ["ICPC", "selection"], fill: 11,
         },
         {
            title: "Upsolving: Segment Trees, Properly This Time",
            eventType: "workshop",
            description:
               "Three problems from the last two rounds that nobody solved, all of which come down to a segment tree with lazy propagation. We build one from scratch on the board, then apply it to each problem in turn.\n\nIf segment trees are the thing you keep bouncing off, this is the session. Bring a laptop and last round's problems.",
            startInDays: -5, hours: 2,
            venue: { type: "offline", location: "CSE Lab 3" },
            capacity: 30, status: "published", visibility: "public",
            tags: ["segment tree", "upsolving"], fill: 6,
         },
         {
            title: "Beginner Ladder Kickoff — Week 1",
            eventType: "workshop",
            description:
               "For anyone starting the ladder this term. We set up your Codeforces handle, walk through how to read a problem statement without panicking, and solve two Div 3 A problems together at a deliberately slow pace.\n\nNo experience assumed beyond knowing one language well enough to print a number. Genuinely, that is the bar.",
            startInDays: -30, hours: 1.5,
            venue: { type: "offline", location: "CSE Seminar Hall A" },
            capacity: 0, status: "published", visibility: "public",
            tags: ["beginner", "ladder"], fill: 9,
         },
      ],
      announcements: [
         {
            title: "The ladder, and how to not quit in week six",
            visibility: "private", pinned: true, agoDays: 40,
            body: "Everyone who joins gets put on the ladder at a level based on a short diagnostic. This is not a ranking and nobody else sees it.\n\nThe deal is two problems a week, reviewed. Not five, not twenty — two, done properly, with someone reading your solution afterwards. People who try to do twenty burn out by October without exception.\n\nWeek six is where it gets hard: the problems stop being pattern-matchable and start needing actual thought, and it feels like going backwards. It is not. Tell a coordinator when you hit it and we will slow the ladder down rather than let you drop off.",
         },
         {
            title: "ICPC team selection — read before you register",
            visibility: "public", pinned: true, agoDays: 8, linkEvent: "ICPC Regionals — Team Selection Round",
            body: "Register as a team of three. If you do not have a team, register anyway and put it in the note — we will place you.\n\nWhat we are watching for is not raw solve count. It is whether your team splits work sensibly, whether you notice when someone is stuck, and whether you can be wrong quickly and move on. Two of last year's regional team were not the strongest individual solvers.\n\nPrinted reference material is allowed and encouraged. Build it now, not the night before.",
         },
         {
            title: "Editorial for ByteBlitz #46 is up",
            visibility: "public", pinned: false, agoDays: 12,
            body: "Editorials for all five problems are on the site. Problem D has two accepted approaches and we have written up both — the intended one with a sparse table, and the neater DSU solution three of you found independently.\n\nIf your solution differs from both and passed, send it over. We will add it.",
         },
      ],
   },
   {
      slug: "webdev-society",
      name: "WebDev Society",
      category: "tech",
      tagline: "We build and maintain the things the campus actually uses.",
      description:
         "Most web clubs build a to-do app and stop. We run real software with real users: the department's attendance tool, the fest registration system, and the internal room-booking service that around four hundred people touch every week. When it breaks, we are the ones who fix it, which turns out to be where the learning is.\n\nNew members pair with someone on an existing service for their first term rather than starting something new. It is less glamorous and far more useful — you learn migrations, on-call, code review and the specific horror of a production data bug in your first month instead of your third year.\n\nWednesday evenings are open pairing sessions. Anyone can turn up, grab a ticket off the board, and work through it with someone who knows the codebase.",
      tags: ["React", "Node", "TypeScript", "DevOps"],
      settings: { joinPolicy: "open", isPrivate: false },
      foundedYear: 2020,
      verified: true,
      coverFrom: "#ef4444",
      coverTo: "#fca5a5",
      socialLinks: {
         website: "https://webdev.college.edu",
         instagram: "https://instagram.com/webdev.society",
         linkedin: "https://linkedin.com/company/webdev-society",
      },
      events: [
         {
            title: "Open Pairing Night — Ticket Board Is Live",
            eventType: "workshop",
            description:
               "Our weekly working session. The ticket board goes up at the start, you take something that looks interesting, and you pair with whoever knows that codebase.\n\nTickets are labelled by difficulty and by service. There are always a few marked 'first ticket' — small, well-scoped, and with someone assigned to walk you through the setup. You will have a pull request open by the end of the evening.\n\nNo need to register in advance for this one, but signing up helps us know how many people to have around who can review.",
            startInDays: 2, hours: 3,
            venue: { type: "offline", location: "IT Block, Lab 2" },
            capacity: 0, status: "published", visibility: "public",
            tags: ["pairing", "open"], fill: 8,
         },
         {
            title: "From Localhost to Live: Deploying the Booking Service",
            eventType: "workshop",
            description:
               "We take the room-booking service from a fresh clone to a running deployment, on a real box, in front of everyone. Environment variables, database migrations, a reverse proxy, TLS, and the health check that tells you it actually worked.\n\nThen we break it deliberately — bad migration, exhausted connection pool, expired certificate — and fix each one while watching the logs. The debugging is the point; the happy path takes twenty minutes.\n\nCapped because everyone gets their own box.",
            startInDays: 9, hours: 4,
            venue: { type: "hybrid", location: "IT Block, Lab 2", meetingUrl: "https://meet.college.edu/webdev-deploy" },
            capacity: 4, waitlistEnabled: true, status: "published", visibility: "public",
            tags: ["deployment", "devops"], fill: 10,
         },
         {
            title: "Postmortem: The Registration Outage",
            eventType: "seminar",
            description:
               "Fest registration went down for fifty minutes on opening night under about nine hundred concurrent users. We are walking through exactly what happened — the connection pool sizing, the missing index, and the retry storm our own client caused — with the real graphs.\n\nBlameless, as always. The interesting part is not who wrote the query, it is why three separate safeguards failed to catch it.",
            startInDays: -9, hours: 1.5,
            venue: { type: "offline", location: "IT Block, Seminar Room" },
            capacity: 0, status: "published", visibility: "public",
            tags: ["postmortem", "reliability"], fill: 7,
         },
         {
            title: "Accessibility Audit Sprint",
            eventType: "workshop",
            description:
               "Draft. Anika has offered to run a session auditing our three services against WCAG, and we should absolutely do it — just need to work out whether it is one long sprint or three shorter sessions, and get her a date that works.",
            startInDays: 21, hours: 4,
            venue: { type: "offline", location: "IT Block, Lab 2" },
            capacity: 20, status: "draft", visibility: "private",
            tags: ["accessibility", "audit"], fill: 0,
         },
      ],
      announcements: [
         {
            title: "Start here: your first ticket",
            visibility: "private", pinned: true, agoDays: 45,
            body: "Welcome. Do not start a new project in your first term — pick up an existing service instead. You will learn more in six weeks of maintenance than six months of greenfield.\n\nSetup instructions for all three services are in the handbook repo. If the README does not work on your machine, that is a bug: open an issue rather than working around it silently, because the next person will hit the same thing.\n\nEvery pull request needs one review before merge, including ours. Nobody merges to main directly, and that includes the coordinators.",
         },
         {
            title: "On-call rota for the fest period",
            visibility: "private", pinned: false, agoDays: 5,
            body: "Registration opens in three weeks and we need cover for the first seventy-two hours, which is when everything historically goes wrong.\n\nTwo-hour slots, two people per slot, and you are not expected to fix anything alone — the rota is about someone noticing quickly and escalating. Vihaan has the runbook and will walk through it at Wednesday's session.\n\nSign-up sheet is in the channel. Please take a slot even if you are new; being paired with someone experienced during an incident is the fastest learning there is.",
         },
         {
            title: "Deployment workshop is nearly full",
            visibility: "public", pinned: false, agoDays: 2, linkEvent: "From Localhost to Live: Deploying the Booking Service",
            body: "Sixteen boxes, sixteen seats, and they are going fast. The waitlist is open and we do usually get a couple of drop-outs the day before, so it is worth joining.\n\nIf you cannot get a seat, the whole thing is being recorded and the lab environment stays up for a fortnight afterwards. It is not the same as doing it live with someone next to you, but it is not nothing.",
         },
      ],
   },
];

CLUBS.push(
   {
      slug: "e-cell",
      name: "Entrepreneurship Cell",
      category: "business",
      tagline: "Six alumni companies, one of them profitable. Come find out which.",
      description:
         "E-Cell exists to shorten the distance between having an idea and finding out whether it is any good. We run a pitch cycle three times a year: you bring a problem, we help you talk to twenty people who actually have it, and most ideas die at that step. The ones that survive get a mentor, a small grant and a demo day slot.\n\nWe are deliberately unromantic about this. Most student startups do not work, and the useful part is learning to tell quickly which kind you are holding. Dr. Venkatesh has run two companies into the ground himself and is the most valuable person in the room precisely because of it.\n\nAlso here: the alumni network, a legal clinic twice a term for incorporation and equity questions, and a standing offer to introduce you to anyone we know who has the problem you are solving.",
      tags: ["Startups", "Pitching", "Product", "Fundraising"],
      settings: { joinPolicy: "open", isPrivate: false },
      foundedYear: 2017,
      verified: true,
      coverFrom: "#4338ca",
      coverTo: "#818cf8",
      socialLinks: {
         website: "https://ecell.college.edu",
         instagram: "https://instagram.com/ecell.campus",
         linkedin: "https://linkedin.com/company/ecell-campus",
      },
      events: [
         {
            title: "Demo Day — Autumn Cohort",
            eventType: "contest",
            description:
               "Nine teams, six minutes each, in front of a panel of four: two founders, one operator and one investor who has said no to most of them before.\n\nThe format is deliberately unforgiving. No slides for the first two minutes — just tell us what the problem is and who has it. Questions are hostile on purpose, because the first time someone asks 'why would anyone pay for this' should not be in a real pitch meeting.\n\nOpen to the whole campus as audience. Registration required, seats are limited by the hall.",
            startInDays: 14, hours: 3,
            venue: { type: "offline", location: "Main Auditorium" },
            capacity: 150, waitlistEnabled: true, status: "published", visibility: "public",
            tags: ["demo day", "pitching"], fill: 8,
         },
         {
            title: "Customer Discovery Workshop: Twenty Conversations",
            eventType: "workshop",
            description:
               "The single highest-leverage session we run. You will leave with a list of twenty named people who have the problem you think you are solving, and a script for talking to them that does not lead the witness.\n\nWe cover why 'would you use this?' is a useless question, how to ask about what someone did last week instead of what they might do next month, and how to hear a no clearly enough to act on it.\n\nIshita runs it. She is blunt and the session is better for it.",
            startInDays: 5, hours: 3,
            venue: { type: "offline", location: "MS Block, Seminar Room 2" },
            capacity: 5, waitlistEnabled: true, status: "published", visibility: "public",
            tags: ["customer discovery", "validation"], fill: 7,
         },
         {
            title: "Legal Clinic: Incorporation, Equity and Founder Agreements",
            eventType: "seminar",
            description:
               "An alumni lawyer takes questions for two hours. Incorporation structures, what a vesting schedule actually does, why a handshake split between four co-founders ends badly, and the paperwork you need before taking any money at all.\n\nBring specific questions. General ones get general answers.",
            startInDays: -12, hours: 2,
            venue: { type: "hybrid", location: "MS Block, Room 12", meetingUrl: "https://meet.college.edu/ecell-legal" },
            capacity: 0, status: "published", visibility: "public",
            tags: ["legal", "incorporation"], fill: 6,
         },
         {
            title: "Founder Fireside: Scaling Past the First Ten Customers",
            eventType: "seminar",
            description:
               "Cancelled — the speaker's funding round moved and she is travelling that week. We are rescheduling for next term rather than putting up a substitute, since the whole draw was her specific experience going from ten to a hundred customers without hiring a sales team.\n\nAnyone who registered has been notified directly.",
            startInDays: 8, hours: 1.5,
            venue: { type: "offline", location: "MS Block, Seminar Room 2" },
            capacity: 80, status: "cancelled", visibility: "public",
            tags: ["fireside", "founders"], fill: 4,
         },
      ],
      announcements: [
         {
            title: "The pitch cycle, start to finish",
            visibility: "private", pinned: true, agoDays: 50,
            body: "Three cycles a year: autumn, spring and a short summer one.\n\nWeek 1 you submit a one-page problem statement — the problem, who has it, and how you know. Not the solution. We reject roughly half at this stage and it is almost always because the problem is a guess.\n\nWeeks 2 to 6 are customer discovery. Twenty conversations minimum, written up. Weeks 7 to 10 you build the smallest thing that tests the risky assumption. Week 11 is demo day.\n\nMentors are assigned after week 6, not before. Plenty of teams dissolve during discovery and that is a success, not a failure — you found out in six weeks instead of two years.",
         },
         {
            title: "Demo day judges are confirmed",
            visibility: "public", pinned: false, agoDays: 4, linkEvent: "Demo Day — Autumn Cohort",
            body: "Four judges this cycle: two alumni founders, one operator who ran growth at a company most of you have used, and an early-stage investor.\n\nPitching teams — your slot order goes out on Friday. Six minutes hard stop, then eight minutes of questions, and the questions are where it is decided.\n\nEveryone else: come and watch. It is the single best session of the term for working out whether you want to do this yourself, and the audience seats are open to the whole campus.",
         },
         {
            title: "Fireside with Meghna has been called off",
            visibility: "public", pinned: false, agoDays: 2,
            body: "Meghna's round moved and she will be travelling that week, so the fireside is off rather than rescheduled with someone else.\n\nWe would rather wait and get her than fill the slot. She has agreed to a date early next term and we will confirm once it is locked.\n\nIf you had registered, your seat is released automatically — no action needed.",
         },
      ],
   },
   {
      slug: "robotics-club",
      name: "Robotics Club",
      category: "tech",
      tagline: "A bot you haven't crashed is a bot you haven't tested.",
      description:
         "We build things that move. Currently in the lab: a quadruped that walks about four metres before falling over, two competition drones, an autonomous rover being prepared for the inter-college expo, and a robotic arm that has been 'nearly finished' for eleven months.\n\nBuild nights are Thursdays and they run late. The fabrication shop is available to members after a safety induction — lathe, mill, 3D printers and the laser cutter, which is the one everybody wants and which has a booking sheet for that reason.\n\nWe take first-years seriously. Every new member is paired with a senior on an existing build for their first term, because the fastest way to learn is to be handed a subsystem that has to work by a deadline someone else set.",
      tags: ["ROS", "Embedded", "Drones", "Fabrication"],
      settings: { joinPolicy: "request", isPrivate: false },
      foundedYear: 2018,
      verified: true,
      coverFrom: "#064e3b",
      coverTo: "#34d399",
      socialLinks: {
         website: "https://robotics.college.edu",
         instagram: "https://instagram.com/robotics.campus",
         linkedin: "https://linkedin.com/company/robotics-club-campus",
      },
      events: [
         {
            title: "Build Night: Quadruped Gait Tuning",
            eventType: "workshop",
            description:
               "We have a trot gait that works on a flat lab floor and falls apart on anything else. Thursday we are putting the quadruped on the ramp and the gravel tray and tuning until it survives both.\n\nUseful if you want to see a control loop being debugged in the physical world, where the answer is sometimes 'the servo is overheating' rather than anything in the code. Aditya is leading; Nikhil is on the telemetry.\n\nOpen to members. Safety induction required for anyone going near the shop.",
            startInDays: 3, hours: 4,
            venue: { type: "offline", location: "Robotics Lab, Workshop Annexe" },
            capacity: 4, waitlistEnabled: true, status: "published", visibility: "private",
            tags: ["quadruped", "build night"], fill: 6,
         },
         {
            title: "Inter-College Robotics Expo — Rover Demo",
            eventType: "contest",
            description:
               "Our autonomous rover runs the obstacle course against eleven other colleges. Twenty minutes on the course, judged on completion time, autonomy level and how gracefully it handles the two deliberately unmapped obstacles.\n\nThe team has been building toward this since June. Come and watch — bring people, it is more fun with a crowd, and the other colleges bring theirs.",
            startInDays: 19, hours: 6,
            venue: { type: "offline", location: "Central Grounds, Expo Marquee" },
            capacity: 40, waitlistEnabled: true, status: "published", visibility: "public",
            tags: ["expo", "rover", "competition"], fill: 9,
         },
         {
            title: "Safety Induction: Shop Access",
            eventType: "seminar",
            description:
               "Mandatory before you touch anything in the fabrication shop. Ninety minutes covering the lathe, mill, laser cutter and 3D printers — what each one will do to you if you are careless, and the specific habits that prevent it.\n\nRun by Dr. Rao. Sign the sheet at the end and your card gets shop access within a day. No induction, no access, no exceptions, and we have had to enforce that.",
            startInDays: -6, hours: 1.5,
            venue: { type: "offline", location: "Workshop Annexe, Room 4" },
            capacity: 0, status: "published", visibility: "private",
            tags: ["safety", "induction"], fill: 8,
         },
         {
            title: "Drone Airframe Redesign Review",
            eventType: "seminar",
            description:
               "Draft. Rohan has the failure analysis from the arm that snapped at the expo qualifier and wants to walk the team through the redesign before we commit to another print run. Needs a slot after the expo, not before.",
            startInDays: 33, hours: 2,
            venue: { type: "offline", location: "Robotics Lab, Workshop Annexe" },
            capacity: 0, status: "draft", visibility: "private",
            tags: ["drones", "design review"], fill: 0,
         },
      ],
      announcements: [
         {
            title: "Shop rules — read before your first build night",
            visibility: "private", pinned: true, agoDays: 38,
            body: "Nobody uses the shop without the safety induction. It runs at the start of every term and takes ninety minutes; if you missed it, ask and we will run it again for three or more people.\n\nThe laser cutter has a booking sheet because there is one and there are forty of us. Two-hour slots, and cancel if you cannot make it.\n\nClean up your bench. This is not a moral point, it is that the next person needs to find the calipers where the calipers live. We lost a week in September to a missing torque driver that turned out to be in someone's bag.",
         },
         {
            title: "Expo team — final week schedule",
            visibility: "private", pinned: true, agoDays: 6, linkEvent: "Inter-College Robotics Expo — Rover Demo",
            body: "Lab is booked solid for the seven days before the expo. Full course runs at 6pm every evening, three attempts, telemetry logged each time.\n\nWhat we still need: the vision pipeline handling low light, a spare motor controller flashed and tested, and someone who is not Aditya able to run the startup sequence. That last one matters — if he is answering a judge's question we still need the rover to start.\n\nTransport leaves at 6am. Do not be late; we cannot hold it.",
         },
         {
            title: "Two spots left on the quadruped subteam",
            visibility: "public", pinned: false, agoDays: 11,
            body: "The quadruped team has room for two more, ideally someone comfortable with control theory and someone who wants to learn it.\n\nYou do not need robotics experience. You do need to be around on Thursday evenings consistently, because the build only moves when the same people keep showing up.\n\nMessage a coordinator or just turn up to a build night and say hello.",
         },
      ],
   },
   {
      slug: "design-studio",
      name: "Design Studio",
      category: "design",
      tagline: "Every poster on this campus went through a crit first.",
      description:
         "We are the studio the rest of the campus comes to. Event identity, posters, the fest brand system, the department websites nobody else wanted to touch — if it has been designed here in the last three years, someone in this room made it.\n\nThe core of the club is the weekly critique. You put work on the wall, people tell you what is not working, and you do it again. It is uncomfortable for about a month and then it becomes the most useful hour of your week. Prof. Menon runs crits the way a studio does, which is to say directly.\n\nWe also run the accessibility review for campus digital services, keep a small type licence library, and have a risograph that Meera guards with her life.",
      tags: ["Figma", "Branding", "Typography", "UX"],
      settings: { joinPolicy: "open", isPrivate: false },
      foundedYear: 2020,
      verified: true,
      coverFrom: "#f59e0b",
      coverTo: "#fcd34d",
      socialLinks: {
         website: "https://studio.college.edu",
         instagram: "https://instagram.com/designstudio.campus",
         linkedin: "https://linkedin.com/company/design-studio-campus",
      },
      events: [
         {
            title: "Weekly Crit — Bring Work In Progress",
            eventType: "workshop",
            description:
               "Pin up whatever you are working on, finished or not. Ten minutes per person: two minutes of context from you, eight of everyone else being honest.\n\nWork in progress is more useful here than finished work. Once it is done you have stopped being able to hear that the hierarchy is wrong.\n\nFirst-timers are welcome to come and just watch, though we will probably talk you into pinning something up by the third week.",
            startInDays: 1, hours: 2,
            venue: { type: "offline", location: "Design Studio, Main Floor" },
            capacity: 0, status: "published", visibility: "public",
            tags: ["critique", "weekly"], fill: 7,
         },
         {
            title: "Type Workshop: Setting Body Text That Reads",
            eventType: "workshop",
            description:
               "Three hours on the least glamorous and most valuable thing in visual design. Measure, leading, the difference a good typeface makes at 11pt, and why the poster you made looks amateurish in a way you cannot name.\n\nWe work in InDesign and Figma, set the same passage six ways, and print them so you can see it on paper rather than backlit. Bring a laptop; the printing is on us.",
            startInDays: 8, hours: 3,
            venue: { type: "offline", location: "Design Studio, Print Room" },
            capacity: 4, waitlistEnabled: true, status: "published", visibility: "public",
            tags: ["typography", "print"], fill: 11,
         },
         {
            title: "Zine Night: Risograph Open Session",
            eventType: "fun",
            description:
               "The riso is out and inked in two colours. Bring artwork, or make something on the night — we have paper, we have time, and Meera will show you how registration works and why your second colour is going to be slightly off no matter what.\n\nEverybody leaves with a printed zine. It is the most fun three hours the studio runs all term.",
            startInDays: -4, hours: 3,
            venue: { type: "offline", location: "Design Studio, Print Room" },
            capacity: 6, waitlistEnabled: true, status: "published", visibility: "public",
            tags: ["riso", "zines", "print"], fill: 10,
         },
         {
            title: "Campus App Accessibility Audit — Findings",
            eventType: "seminar",
            description:
               "Anika presents the full audit: contrast failures, focus order, screen-reader traps and the two forms that cannot be completed with a keyboard at all.\n\nThis is being shared with the IT department the same week, so the session doubles as a rehearsal for that conversation. Come if you want to see how you turn a list of complaints into something an engineering team can act on.",
            startInDays: -16, hours: 2,
            venue: { type: "hybrid", location: "Design Studio, Main Floor", meetingUrl: "https://meet.college.edu/a11y-audit" },
            capacity: 0, status: "published", visibility: "public",
            tags: ["accessibility", "audit"], fill: 6,
         },
      ],
      announcements: [
         {
            title: "How crit works, and how to survive your first one",
            visibility: "private", pinned: true, agoDays: 42,
            body: "Crit is Monday at 5pm, every week, no exceptions.\n\nHow it goes: you pin work up, give two minutes of context — what it is for, who it is for, what you are unsure about — and then you stay quiet while people respond. Defending your work in the room is the fastest way to learn nothing.\n\nThe first one is uncomfortable. Everyone's first one is uncomfortable. By week four you will be annoyed on the weeks we cancel it.\n\nOne rule we do enforce: criticise the work, not the person, and always say what you would try instead.",
         },
         {
            title: "Type workshop is full — waitlist is moving",
            visibility: "public", pinned: false, agoDays: 3, linkEvent: "Type Workshop: Setting Body Text That Reads",
            body: "Eighteen seats, all gone within a day, and there are eleven people waiting.\n\nWe are looking at running it a second time in three weeks — if you are on the waitlist you will get first refusal on that. Two seats usually free up the day before as well, so it is worth staying on the list.\n\nIf you only want the reading list, it is pinned in the channel and you do not need a seat for that.",
         },
         {
            title: "Riso is low on fluorescent pink",
            visibility: "private", pinned: false, agoDays: 9,
            body: "Down to about a third of a drum. The reorder is in but it takes three weeks to arrive.\n\nUntil then: pink is for finishing pieces only, not for test pulls. Use the blue drum for proofing and switch once you are happy with the registration.\n\nIf a job genuinely needs pink before the delivery lands, come and find me and we will work it out.",
         },
      ],
   },
);

CLUBS.push(
   {
      slug: "literary-society",
      name: "Literary Society",
      category: "culture",
      tagline: "Fourteen issues of Spinaker and counting. The deadline is real.",
      description:
         "The oldest society on campus and, by a wide margin, the one with the most arguments. We publish Spinaker twice a year, run a monthly open mic, and hold a workshop every fortnight where people bring work and get it taken apart kindly.\n\nThe workshop is the heart of it. Six to ten people, one piece each, read in advance so the hour is spent on response rather than reading. Prose one fortnight, poetry the next. Dr. Subramanian sits in and mostly lets the room do the work, which is the correct instinct.\n\nWe also run the inter-college debate team, which shares a membership with us for historical reasons nobody remembers and which we have stopped trying to separate.",
      tags: ["Writing", "Poetry", "Debate", "Publishing"],
      settings: { joinPolicy: "open", isPrivate: false },
      foundedYear: 1992,
      verified: true,
      coverFrom: "#991b1b",
      coverTo: "#ef4444",
      socialLinks: {
         website: "https://spinaker.college.edu",
         instagram: "https://instagram.com/litsoc.campus",
         linkedin: "https://linkedin.com/company/literary-society-campus",
      },
      events: [
         {
            title: "Open Mic: Anything Under Five Minutes",
            eventType: "fun",
            description:
               "Poetry, prose, stand-up, a song if you must. Five minutes, no theme, no vetting. The list opens at seven and fills fast.\n\nFirst-timers get the early slots on purpose — the room is warmest at the start and it is easier to go on before you have watched twelve other people be good.\n\nAudience is free to turn up without registering. Performers, please sign up so we can order the list.",
            startInDays: 7, hours: 2.5,
            venue: { type: "offline", location: "Open Air Theatre" },
            capacity: 0, status: "published", visibility: "public",
            tags: ["open mic", "performance"], fill: 9,
         },
         {
            title: "Prose Workshop — Submissions Read In Advance",
            eventType: "workshop",
            description:
               "Eight writers, eight pieces, circulated a week ahead. You come having read everything and having written a paragraph of response to each.\n\nThe rule that makes it work: the writer stays silent while their piece is discussed, then gets the last five minutes to ask questions. It sounds harsh and it is the reason people improve here faster than anywhere else on campus.\n\nCapped at eight. Submissions close four days before.",
            startInDays: 12, hours: 2,
            venue: { type: "offline", location: "HSS Block, Room 9" },
            capacity: 5, waitlistEnabled: true, status: "published", visibility: "private",
            tags: ["workshop", "prose"], fill: 10,
         },
         {
            title: "Spinaker Issue 15 — Launch Reading",
            eventType: "fun",
            description:
               "The new issue is back from the printer. Contributors read their pieces, we hand out copies, and there is tea and an unreasonable quantity of biscuits.\n\nThis issue ran to ninety-six pages, our longest, with eleven first-time contributors. Meera's cover is the best one we have had.",
            startInDays: -8, hours: 2,
            venue: { type: "offline", location: "Library Reading Room" },
            capacity: 0, status: "published", visibility: "public",
            tags: ["launch", "spinaker"], fill: 8,
         },
         {
            title: "Inter-College Debate — Semi-Final",
            eventType: "contest",
            description:
               "Our team against three others in the regional semi-final. British parliamentary format, motion released fifteen minutes before each round.\n\nWe went out at this stage last year on a split decision that people are still annoyed about. Come and make noise.",
            startInDays: -25, hours: 4,
            venue: { type: "offline", location: "Main Auditorium" },
            capacity: 200, status: "published", visibility: "public",
            tags: ["debate", "regional"], fill: 5,
         },
      ],
      announcements: [
         {
            title: "Submitting to Spinaker",
            visibility: "private", pinned: true, agoDays: 55,
            body: "Two issues a year. Submissions open eight weeks before each and close hard on the date — we have gone to print without a piece we wanted because it arrived a day late, and we will do it again.\n\nWhat we take: prose up to 3,000 words, poetry up to four pieces, essays, translations, and artwork for the interior. One submission per person per issue in each category.\n\nEverything is read blind. Names come off before the editorial group sees anything, which is why we ask you not to put your name in the document itself.\n\nRejections come with a reason. Ask for more detail if you want it — most people do, and it is the most useful part of submitting.",
         },
         {
            title: "Workshop slots for this fortnight",
            visibility: "private", pinned: false, agoDays: 4, linkEvent: "Prose Workshop — Submissions Read In Advance",
            body: "Eight slots, ten people wanting them, so the waitlist is live.\n\nIf you have a slot: your piece needs to be in by Thursday so everyone has a week to read. Anything arriving after Thursday moves to the next session, no negotiation — the whole format depends on people having actually read the work.\n\nIf you are on the waitlist, come anyway. Reading and responding without submitting is genuinely worthwhile and there is always a chair.",
         },
         {
            title: "Open mic list opens at seven",
            visibility: "public", pinned: false, agoDays: 2, linkEvent: "Open Mic: Anything Under Five Minutes",
            body: "The sign-up sheet goes out at seven sharp and we usually have twenty names within ten minutes.\n\nFive minutes each, timed, and we are gentle but we do stop you. If you have never done this before, tell us when you sign up and you will go in the first four — the room is much easier early on.\n\nBring a friend. It is a better evening with a full theatre.",
         },
      ],
   },
   {
      slug: "music-club",
      name: "Music Club",
      category: "culture",
      tagline: "Friday jam, open to anyone, no audition ever.",
      description:
         "Four bands, a choir, a small classical ensemble and a Friday jam that anybody can walk into. There is no audition to join the club and there never has been — the bands form themselves, and if you want to be in one the way to do it is to keep turning up to jams.\n\nThe club owns a drum kit, three amps, two keyboards, a PA and a slowly improving collection of mics. All of it is available to members for practice; the booking sheet is on the door of the music room.\n\nProf. Qureshi teaches theory to anyone who asks and is entirely unbothered that most of the club would rather play metal than learn ragas. She also runs the recording setup, which is how the last two EPs got made.",
      tags: ["Bands", "Jam", "Classical", "Recording"],
      settings: { joinPolicy: "open", isPrivate: false },
      foundedYear: 1985,
      verified: true,
      coverFrom: "#be185d",
      coverTo: "#f9a8d4",
      socialLinks: {
         website: "https://music.college.edu",
         instagram: "https://instagram.com/musicclub.campus",
         linkedin: "https://linkedin.com/company/music-club-campus",
      },
      events: [
         {
            title: "Friday Jam — Open Session",
            eventType: "fun",
            description:
               "Every Friday, amphitheatre, from six until they make us stop. Backline is provided: kit, two guitar amps, a bass amp, keys and a four-channel PA. Bring your instrument and a cable.\n\nNo set list, no audition, no minimum standard. People rotate through in whatever combination happens. It is how every band currently in this club got started.",
            startInDays: 2, hours: 3,
            venue: { type: "offline", location: "Open Air Amphitheatre" },
            capacity: 0, status: "published", visibility: "public",
            tags: ["jam", "weekly", "open"], fill: 8,
         },
         {
            title: "Autumn Gig Night — Four Bands",
            eventType: "fun",
            description:
               "Four sets, forty minutes each, proper sound and lights. Kiara's band is headlining and the choir opens with three pieces, which is a combination that should not work and somehow does.\n\nWe sell out this one every time. Tickets are free but registration is required because the amphitheatre has a real capacity and the fire officer counts.",
            startInDays: 16, hours: 4,
            venue: { type: "offline", location: "Open Air Amphitheatre" },
            capacity: 200, waitlistEnabled: true, status: "published", visibility: "public",
            tags: ["gig", "live"], fill: 11,
         },
         {
            title: "Recording Session: EP Tracking Weekend",
            eventType: "workshop",
            description:
               "Two days in the music room tracking drums and bass for the club EP. Prof. Qureshi is engineering, and anyone who wants to watch a real tracking session is welcome to sit in — quietly.\n\nIf you are playing, your parts need to be finished before you arrive. Studio time is not rehearsal time and we lost most of last year's Saturday finding that out.",
            startInDays: -11, hours: 8,
            venue: { type: "offline", location: "Music Room, Cultural Centre" },
            capacity: 12, status: "published", visibility: "private",
            tags: ["recording", "EP"], fill: 6,
         },
         {
            title: "Theory for People Who Play by Ear",
            eventType: "workshop",
            description:
               "Draft. Farah wants to run a short series for the players who are self-taught and hit a ceiling — reading, intervals, why the chord you found works. Needs three sessions rather than one, so it has to wait until after the gig night.",
            startInDays: 29, hours: 1.5,
            venue: { type: "offline", location: "Music Room, Cultural Centre" },
            capacity: 15, status: "draft", visibility: "private",
            tags: ["theory", "beginners"], fill: 0,
         },
      ],
      announcements: [
         {
            title: "Room booking, gear and the one rule",
            visibility: "private", pinned: true, agoDays: 47,
            body: "The music room is bookable by any member. Sheet is on the door, two-hour slots, and please cross out your name if you cannot make it — an empty booked room is the most annoying thing we deal with.\n\nGear stays in the room. The one rule, and the only one we have ever had to enforce with a membership suspension, is that nothing leaves the building. Not for a gig, not for a weekend, not for half an hour.\n\nBroken gear is fine. Tell somebody. We have a repair budget and we would much rather fix a cracked cymbal than discover it three weeks later.",
         },
         {
            title: "Gig night — set times and soundcheck",
            visibility: "private", pinned: true, agoDays: 5, linkEvent: "Autumn Gig Night — Four Bands",
            body: "Soundcheck runs from two in the afternoon, twenty-five minutes per band, in reverse set order. Choir at half past four.\n\nBe there for yours. If you miss your check you play through whatever the previous band left set up, and that has gone badly enough times that nobody argues about it any more.\n\nDoors at six, first set at half past. Kiara's band closes.",
         },
         {
            title: "Two mics have gone missing",
            visibility: "private", pinned: false, agoDays: 13,
            body: "Two SM58s have not come back to the case since the last jam. They are almost certainly in a hostel room rather than gone for good.\n\nNo questions, no consequences — just put them back in the case in the music room. We need them for gig night and replacing them would take a real bite out of the term's budget.",
         },
      ],
   },
   {
      slug: "photography-club",
      name: "Photography Club",
      category: "media",
      tagline: "Borrow the lens. Write up what you shot.",
      description:
         "A camera club with an actual kit library. Two bodies, six lenses, a star tracker, tripods and a small lighting set, all lendable to members for up to a week. The deal is simple: borrow the gear, and write up what you shot for the club feed afterwards. That is the entire membership fee.\n\nMonthly photowalks — street, wildlife, architecture, and the night walk that Aadhya runs with the tracker. Dr. Joshi comes on the wildlife ones and is unreasonably good at spotting birds nobody else can see.\n\nWe also cover campus events. If you have shot a match or a fest for us, your photos end up in the archive that the college actually uses, credited.",
      tags: ["DSLR", "Street", "Wildlife", "Astro"],
      settings: { joinPolicy: "request", isPrivate: false },
      foundedYear: 2015,
      verified: false,
      coverFrom: "#6366f1",
      coverTo: "#a78bfa",
      socialLinks: {
         website: "https://photo.college.edu",
         instagram: "https://instagram.com/photoclub.campus",
         linkedin: "https://linkedin.com/company/photography-club-campus",
      },
      events: [
         {
            title: "Night Photowalk: Star Tracker Session",
            eventType: "fun",
            description:
               "Out to the far field where the light pollution drops off, with the tracker and whatever long lenses people bring. Aadhya runs it.\n\nWe will do polar alignment properly at the start — it takes twenty minutes and it is the difference between usable frames and streaks. Then stacking, and a walk through the processing the following week.\n\nDress warm, it gets cold out there. Numbers capped because there is one tracker and everyone needs a turn.",
            startInDays: 5, hours: 5,
            venue: { type: "offline", location: "North Field, past the water tower" },
            capacity: 3, waitlistEnabled: true, status: "published", visibility: "private",
            tags: ["astro", "photowalk", "night"], fill: 13,
         },
         {
            title: "Wildlife Walk — Campus Lake, Early Start",
            eventType: "fun",
            description:
               "Six in the morning at the lake, which is the only time the birds cooperate. Dr. Joshi leads and will identify things you did not notice were there.\n\nLong lens helps but is not required — half of what makes these walks good is learning to sit still and wait, which works with any camera. Two 300mm lenses are available from the library, first come.\n\nBack by half past eight, well before first lecture.",
            startInDays: 9, hours: 2.5,
            venue: { type: "offline", location: "Campus Lake, east bank" },
            capacity: 6, waitlistEnabled: true, status: "published", visibility: "private",
            tags: ["wildlife", "photowalk"], fill: 8,
         },
         {
            title: "Editing Session: Lightroom, Raw to Finished",
            eventType: "workshop",
            description:
               "We take one raw file, given to everybody, and each edit it independently for forty minutes. Then we put all the versions side by side and talk about why they are different.\n\nIt is the fastest way to understand that editing is a set of choices rather than a set of correct values. Bring a laptop with Lightroom or Darktable.",
            startInDays: -7, hours: 2.5,
            venue: { type: "offline", location: "ECE Block, Room 118" },
            capacity: 20, status: "published", visibility: "private",
            tags: ["editing", "lightroom"], fill: 7,
         },
      ],
      announcements: [
         {
            title: "Kit library rules",
            visibility: "private", pinned: true, agoDays: 36,
            body: "Everything in the library is lendable to members for up to seven days. Book it in the sheet, sign it out with a coordinator, and check it back in with the same person.\n\nThe write-up is not optional. Borrow the 300mm, post what you shot with it — even three frames and a paragraph. The whole library was funded on the argument that it gets used and the use is visible, and that argument needs the feed to keep working.\n\nIf you damage something, tell us immediately. We have never charged anyone for honest damage. We have suspended borrowing rights for people who returned something broken quietly.",
         },
         {
            title: "Night walk is over capacity — waitlist is long",
            visibility: "private", pinned: false, agoDays: 2, linkEvent: "Night Photowalk: Star Tracker Session",
            body: "Ten places, thirteen people signed up. Everyone past the tenth is on the waitlist and the queue is in order of sign-up.\n\nWe will run it again in three weeks around the new moon, which is better conditions anyway. If you are waitlisted you get first pick on that date.\n\nIf you are in and cannot make it, cancel rather than not turning up — it moves someone up automatically and the drive out is not worth doing with empty seats.",
         },
         {
            title: "Verification paperwork is in with the office",
            visibility: "private", pinned: false, agoDays: 17,
            body: "We have submitted for club verification, which is what unlocks posting events to the whole campus rather than just to members.\n\nOffice says four to six weeks. Until it comes through, everything we run stays members-only — that is a platform rule and not something coordinators can override.\n\nPractically it means the photowalks are not visible on the main events page yet. Tell people directly if you want them to come; anyone can join the club.",
         },
      ],
   },
);

CLUBS.push(
   {
      slug: "quantum-computing",
      name: "Quantum Computing Group",
      category: "tech",
      tagline: "Eleven of us, one textbook, no idea what we're doing yet.",
      description:
         "The newest group on campus and the smallest. We started because Krishna wanted somebody to talk to about his thesis and put up a notice; eleven people turned up to the first meeting and most of them are still here.\n\nWe are working through Nielsen and Chuang at roughly a chapter a fortnight, with a Qiskit session in between so the maths connects to something you can run. Nobody in the room is an expert, including the person leading it, and the sessions are better for it — questions get asked that would not get asked in a lecture.\n\nDr. Nair supervises loosely and joins when she can. If you have done linear algebra and are willing to be confused for a few weeks, that is genuinely the whole prerequisite.",
      tags: ["Qiskit", "Reading Group", "Research", "New"],
      settings: { joinPolicy: "request", isPrivate: false },
      foundedYear: 2025,
      verified: false,
      coverFrom: "#4338ca",
      coverTo: "#818cf8",
      socialLinks: {
         website: "https://quantum.college.edu",
         instagram: "https://instagram.com/quantum.campus",
         linkedin: "https://linkedin.com/company/quantum-group-campus",
      },
      events: [
         {
            title: "Chapter 4: Quantum Circuits — Reading Session",
            eventType: "seminar",
            description:
               "Nielsen and Chuang chapter four, universal gates and circuit construction. Krishna leads, badly, which is the format — he works through it on the board at the speed he actually understands it rather than pretending to fluency.\n\nRead the chapter beforehand if you can. If you cannot, come anyway; about half the room never manages it and the session still works.",
            startInDays: 6, hours: 2,
            venue: { type: "offline", location: "CSE Block, Room 214" },
            capacity: 0, status: "published", visibility: "private",
            tags: ["reading group", "circuits"], fill: 4,
         },
         {
            title: "Qiskit Lab: Build and Run Grover's Algorithm",
            eventType: "workshop",
            description:
               "We implement Grover's search from scratch and run it on a simulator, then on real IBM hardware through the free tier, and compare. The gap between the two is the entire lesson — the simulator gives you the textbook answer and the hardware gives you noise.\n\nYou need a laptop and an IBM Quantum account, which is free and takes two minutes. Set it up before you arrive if you can.",
            startInDays: 13, hours: 3,
            venue: { type: "hybrid", location: "CSE Lab 1", meetingUrl: "https://meet.college.edu/qiskit-lab" },
            capacity: 15, waitlistEnabled: true, status: "published", visibility: "private",
            tags: ["qiskit", "hands-on", "grover"], fill: 5,
         },
         {
            title: "Intro Session: What This Group Is For",
            eventType: "seminar",
            description:
               "The first meeting, for anyone curious about whether this is for them. What quantum computing actually is, what it is not, what the textbook covers, and how much maths you realistically need.\n\nHonest answer to the last one: comfortable with linear algebra, and willing to be lost for a while.",
            startInDays: -19, hours: 1.5,
            venue: { type: "offline", location: "CSE Block, Room 214" },
            capacity: 0, status: "published", visibility: "private",
            tags: ["intro", "new members"], fill: 6,
         },
      ],
      announcements: [
         {
            title: "What we are reading and how fast",
            visibility: "private", pinned: true, agoDays: 28,
            body: "Nielsen and Chuang, a chapter a fortnight, with a Qiskit session in the off weeks. We are on chapter four.\n\nThe pace is deliberately slow. If you join now you are three chapters behind and that is fine — chapters one to three are background and you can pick them up alongside. Ask and someone will lend you their notes.\n\nNobody here is an expert. If you spot that the person at the board is wrong, say so. It has happened twice and both times the session was better afterwards.",
         },
         {
            title: "IBM Quantum accounts before the lab session",
            visibility: "private", pinned: false, agoDays: 3, linkEvent: "Qiskit Lab: Build and Run Grover's Algorithm",
            body: "Please set up your free IBM Quantum account before the session rather than during it. It takes about two minutes and last time we lost twenty minutes of a three-hour lab to sign-ups and email verification.\n\nInstall qiskit and qiskit-ibm-runtime too. Environment file is in the channel.\n\nQueue times on the free hardware tier can be twenty minutes or more, so we will submit early and do theory while we wait.",
         },
      ],
   },
   {
      slug: "film-makers",
      name: "Film Makers",
      category: "media",
      tagline: "Three shorts in festivals. One still in edit.",
      description:
         "We make short films and actually finish them, which is rarer than it should be. Two are in festival circulation, a third is in edit, and there is a documentary about the campus kitchen staff that has been shooting for eight months.\n\nEverything is crewed by members. If you want to direct you first spend a shoot pulling focus or holding a boom, because knowing what every job on a set feels like is what separates a director people want to work with from one they avoid.\n\nWe have two cameras, a decent lens set, lights, sound kit and an edit suite with a colour-calibrated monitor. Leela runs the writers' room; Navya handles post. Prof. Qureshi covers sound and keeps us honest about audio, which is the thing student films always get wrong.",
      tags: ["Shorts", "Documentary", "Editing", "Festivals"],
      settings: { joinPolicy: "request", isPrivate: false },
      foundedYear: 2018,
      verified: false,
      coverFrom: "#831843",
      coverTo: "#ec4899",
      socialLinks: {
         website: "https://film.college.edu",
         instagram: "https://instagram.com/filmmakers.campus",
         linkedin: "https://linkedin.com/company/film-makers-campus",
      },
      events: [
         {
            title: "Writers' Room: Second Draft Read-Through",
            eventType: "workshop",
            description:
               "Three scripts on the table, all on second draft. We read them aloud with parts assigned, because a line that works on the page and dies in a mouth is the single most common problem in student scripts.\n\nLeela runs it. Bring a printed copy — reading off a phone slows the room down and everybody notices.",
            startInDays: 4, hours: 3,
            venue: { type: "offline", location: "HSS Block, Room 9" },
            capacity: 5, waitlistEnabled: true, status: "published", visibility: "private",
            tags: ["writing", "script"], fill: 7,
         },
         {
            title: "Shoot Day: Kitchen Documentary, Block 3",
            eventType: "workshop",
            description:
               "Third block of the campus kitchen documentary. Early call — we are shooting prep service, which starts at half four in the morning and is the only time you see the place properly working.\n\nCrew only, and everyone has a defined role on the sheet. If you have not been on a shoot with us before, come as a second AC or on sound and watch how it runs.\n\nBreakfast is provided by the kitchen, which is both generous and slightly awkward given we are filming them.",
            startInDays: 10, hours: 6,
            venue: { type: "offline", location: "Central Kitchen, Hostel Block C" },
            capacity: 3, waitlistEnabled: true, status: "published", visibility: "private",
            tags: ["documentary", "shoot"], fill: 9,
         },
         {
            title: "Screening: Festival Cut of 'The Long Wait'",
            eventType: "fun",
            description:
               "The festival cut, on the big screen, with the sound mix it was made for rather than a laptop speaker. Fourteen minutes, then a Q and A with the crew.\n\nThis is the version that went to two festivals and got into one. We will talk about what changed between the rough cut and this, which is a lot more than anyone expects.",
            startInDays: -13, hours: 2,
            venue: { type: "offline", location: "Main Auditorium" },
            capacity: 0, status: "published", visibility: "private",
            tags: ["screening", "festival"], fill: 8,
         },
         {
            title: "Colour Grading Intensive",
            eventType: "workshop",
            description:
               "Draft. Navya wants a full day on Resolve — nodes, power windows, matching shots across a scene. Needs the edit suite for a whole Saturday, so it has to go after the documentary block or we lose the room.",
            startInDays: 24, hours: 7,
            venue: { type: "offline", location: "Edit Suite, Media Centre" },
            capacity: 8, status: "draft", visibility: "private",
            tags: ["colour", "post"], fill: 0,
         },
      ],
      announcements: [
         {
            title: "How a shoot runs here",
            visibility: "private", pinned: true, agoDays: 31,
            body: "Everyone crews before they direct. No exceptions, including for people who arrive with a finished script.\n\nCall sheets go out three days before with roles, call times and location. If you are on a sheet and cannot make it, tell us the moment you know — a missing sound recordist stops the whole day, and we have lost a shoot day to somebody who did not want to admit they had a clash.\n\nKit signs out to one named person per shoot who is responsible for it coming back. Everything is checked in that evening, not the next morning.",
         },
         {
            title: "Kitchen doc block 3 — call is 04:30",
            visibility: "private", pinned: true, agoDays: 1, linkEvent: "Shoot Day: Kitchen Documentary, Block 3",
            body: "Half four in the morning, at the kitchen loading door, not the main entrance.\n\nBring warm clothes — the prep area is cold before the ovens come up. Soft shoes, and nothing that rustles near the mic.\n\nWe are guests in a working kitchen. Stay out of the way, do not touch anything on a surface, and if a chef asks you to move, move first and ask why later.",
         },
         {
            title: "Edit suite is booked solid until the festival deadline",
            visibility: "private", pinned: false, agoDays: 8,
            body: "The suite is fully booked for the next fortnight while 'The Long Wait' finishes its grade for the submission deadline.\n\nIf you need it for coursework, talk to Navya — there are gaps in the mornings and she is keeping a list. After the deadline it goes back to the normal booking sheet.\n\nDo not just turn up and use it. Somebody lost two hours of grading work that way last term.",
         },
      ],
   },
   {
      slug: "sports-council",
      name: "Sports Council",
      category: "sports",
      tagline: "Nine teams, four grounds, one monsoon. Somebody has to schedule it.",
      description:
         "The council runs inter-college sport for the campus: cricket, football, basketball, badminton, athletics and the annual sports meet. That means fixtures, grounds allocation, kit, transport, the physio rota and the endless negotiation about who gets the main field on a Saturday.\n\nMembership is by invitation because the council is an administrative body rather than a team — you join it to run sport, not to play it, although most members do both. Team selection is separate and happens through the individual squads.\n\nProf. Shetty directs it. If you want to be involved in organising rather than competing, this is genuinely good experience and it looks like what it is on a CV: logistics under constraint, with people who care about the outcome.",
      tags: ["Cricket", "Football", "Athletics", "Tournaments"],
      settings: { joinPolicy: "invite-only", isPrivate: false },
      foundedYear: 2002,
      verified: true,
      coverFrom: "#047857",
      coverTo: "#6ee7b7",
      socialLinks: {
         website: "https://sports.college.edu",
         instagram: "https://instagram.com/sportscouncil.campus",
         linkedin: "https://linkedin.com/company/sports-council-campus",
      },
      events: [
         {
            title: "Inter-College Football — Quarter Final",
            eventType: "contest",
            description:
               "Quarter final against the engineering college from across the district, who knocked us out at the same stage two years running.\n\nKick-off at four on the main ground. Kabir captains. Bring everyone you know — the away side travels with a genuinely loud support and last time we were outnumbered on our own pitch.",
            startInDays: 3, hours: 2.5,
            venue: { type: "offline", location: "Main Ground" },
            capacity: 0, status: "published", visibility: "public",
            tags: ["football", "knockout"], fill: 7,
         },
         {
            title: "Annual Athletics Meet — Day 1",
            eventType: "contest",
            description:
               "Track and field across two days. Day one is the sprints, long jump, shot put and the 4x100 heats.\n\nRegistration is per event and closes a week before so we can seed the heats properly. You can enter up to three individual events plus a relay leg.\n\nPhysio is on site both days. If you are carrying anything, tell them before you compete rather than after.",
            startInDays: 20, hours: 8,
            venue: { type: "offline", location: "Athletics Track" },
            capacity: 120, waitlistEnabled: true, status: "published", visibility: "public",
            tags: ["athletics", "meet"], fill: 10,
         },
         {
            title: "Cricket League — Final",
            eventType: "contest",
            description:
               "The inter-hostel league final, forty overs, on the main ground. Block C chasing their third title in four years against a Block A side that has not lost since August.\n\nVed is shooting it for the archive. Tea between innings.",
            startInDays: -17, hours: 7,
            venue: { type: "offline", location: "Main Ground" },
            capacity: 0, status: "published", visibility: "public",
            tags: ["cricket", "final"], fill: 6,
         },
         {
            title: "Council Planning: Spring Fixture Calendar",
            eventType: "seminar",
            description:
               "Internal. Building the spring calendar across four grounds and nine teams, with the monsoon window blocked out and the exam period protected.\n\nCome with your squad's constraints written down. Every year somebody remembers a clash in the meeting after the calendar is published.",
            startInDays: 27, hours: 2,
            venue: { type: "offline", location: "Sports Complex, Admin Wing" },
            capacity: 0, status: "draft", visibility: "private",
            tags: ["planning", "internal"], fill: 0,
         },
      ],
      announcements: [
         {
            title: "How the council works, and how you get on it",
            visibility: "private", pinned: true, agoDays: 60,
            body: "The council is invite-only because it is an administrative body, not a team. Members handle fixtures, grounds, kit, transport and the physio rota.\n\nInvitations go out at the start of each academic year, usually to people who have already been doing the work informally — team captains, the person who always ends up organising transport, whoever keeps the kit inventory.\n\nIf you want in: start doing one of those jobs for your squad and we will notice. That is not a brush-off, it is genuinely how everyone currently here got in.",
         },
         {
            title: "Ground allocation for the quarter final week",
            visibility: "private", pinned: false, agoDays: 4, linkEvent: "Inter-College Football — Quarter Final",
            body: "Main ground is blocked from Tuesday for pitch preparation and stays blocked through the quarter final.\n\nCricket nets move to the practice ground for that week. Athletics is unaffected. Badminton has the hall as normal.\n\nI know this is short notice for the cricket squad and I am sorry — the away fixture moved and we found out on Monday.",
         },
         {
            title: "Athletics meet registration closes in a week",
            visibility: "public", pinned: false, agoDays: 6, linkEvent: "Annual Athletics Meet — Day 1",
            body: "Entries close seven days before day one so we can seed the heats. After that the sheets go to the printer and we cannot add you.\n\nUp to three individual events plus a relay leg. If you are unsure what to enter, the sprints are the friendliest place to start and the 800m is where people discover they have made a mistake.\n\nPhysio will be on site both days for anyone who needs strapping before an event.",
         },
      ],
   },
);

module.exports = { CLUBS };
