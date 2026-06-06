// Active-club context + hook. Holds the clubs a faculty coordinates and which one
// is "in focus", so the sidebar switcher and club-scoped pages share one source of truth.
// Kept separate from the provider component so the provider file exports only components
// (required for Vite Fast Refresh).
import { createContext, useContext } from "react";

export const ActiveClubContext = createContext(null);

export function useActiveClub() {
   const ctx = useContext(ActiveClubContext);
   if (!ctx) {
      throw new Error("useActiveClub must be used inside <ActiveClubProvider>");
   }
   return ctx;
}
