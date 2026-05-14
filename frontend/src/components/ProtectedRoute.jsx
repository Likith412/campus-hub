import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../contexts/AuthContext";

// Gate for authenticated routes. Returns null during bootstrap to avoid flashing
// the login page while we're still checking whether the user has a valid session.
export function ProtectedRoute() {
   const { user, loading } = useAuth();
   const location = useLocation();

   if (loading) return null;
   if (!user) {
      // Stash the attempted path so we can send them back after login.
      return <Navigate to="/login" replace state={{ from: location }} />;
   }
   return <Outlet />;
}

// Inverse gate for /login and /register — bounces already-authenticated users home.
export function PublicOnlyRoute() {
   const { user, loading } = useAuth();
   const location = useLocation();

   if (loading) return null;
   if (user) {
      const redirectTo = location.state?.from?.pathname ?? "/";
      return <Navigate to={redirectTo} replace />;
   }
   return <Outlet />;
}
