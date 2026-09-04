// Backs the topbar bell's dot. There's no server-side read state for announcements,
// so "seen" is the timestamp of the newest notice you had when you last opened the
// digest, kept per-browser and scoped to the account that read it.
const keyFor = (userId) => `announcements:seenAt:${userId || "anon"}`;

export function lastSeenAt(userId) {
   try {
      return localStorage.getItem(keyFor(userId));
   } catch {
      return null; // Private mode or blocked storage — treat everything as unseen.
   }
}

export function markSeen(userId, iso) {
   if (!iso) return;
   try {
      localStorage.setItem(keyFor(userId), iso);
   } catch {
      // Nothing to do — the dot just stays lit.
   }
}
