// Auth context + hook. Kept separate from the provider component so the
// provider file exports only components (required for Vite Fast Refresh).
import { createContext, useContext } from "react";

export const AuthContext = createContext(null);

export function useAuth() {
   const ctx = useContext(AuthContext);
   if (!ctx) {
      throw new Error("useAuth must be used inside <AuthProvider>");
   }
   return ctx;
}
