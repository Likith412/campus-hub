// Toast context + hook. Kept separate from the provider component so the
// provider file exports only components (required for Vite Fast Refresh).
import { createContext, useContext } from "react";

export const ToastContext = createContext(null);

export function useToast() {
   const ctx = useContext(ToastContext);
   if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
   return ctx;
}
