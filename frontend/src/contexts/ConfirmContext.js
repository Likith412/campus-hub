// Confirm context + hook. Kept separate from the provider component so the
// provider file exports only components (required for Vite Fast Refresh).
import { createContext, useContext } from "react";

export const ConfirmContext = createContext(null);

export function useConfirm() {
   const ctx = useContext(ConfirmContext);
   if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
   return ctx;
}
