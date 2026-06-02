import { useCallback, useEffect, useMemo, useState } from "react";
import Cookies from "js-cookie";
import { authApi, ApiError } from "../services";
import { AuthContext } from "./AuthContext";

// Non-httpOnly cookie set by the backend on login/refresh. Lets the SPA skip
// the bootstrap /me call for anonymous visitors (zero auth requests on cold load).
const hasSessionHint = () => Cookies.get("has_session") === "1";

export function AuthProvider({ children }) {
   const [user, setUser] = useState(null);
   // Lazy init: anonymous visitors start with loading=false and skip the effect entirely.
   const [loading, setLoading] = useState(hasSessionHint);

   useEffect(() => {
      if (!hasSessionHint()) return;

      // `cancelled` guards against setState after unmount (e.g. React Strict Mode double-mount).
      let cancelled = false;
      (async () => {
         try {
            const data = await authApi.me();
            if (!cancelled) setUser(data?.user ?? null);
         } catch (err) {
            if (!cancelled) {
               setUser(null);
               // 401 is the expected "session expired" path — swallow it; log anything else.
               if (!(err instanceof ApiError) || err.status !== 401) {
                  console.error("auth bootstrap failed:", err);
               }
            }
         } finally {
            if (!cancelled) setLoading(false);
         }
      })();
      return () => {
         cancelled = true;
      };
   }, []);

   const login = useCallback(async (credentials) => {
      const data = await authApi.login(credentials);
      setUser(data?.user ?? null);
      return data;
   }, []);

   const logout = useCallback(async () => {
      try {
         await authApi.logout();
      } finally {
         setUser(null);
      }
   }, []);

   const value = useMemo(
      () => ({ user, loading, login, logout }),
      [user, loading, login, logout],
   );

   return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
