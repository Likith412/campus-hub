import { Routes, Route } from "react-router";

import Register from "./pages/Register";
import Login from "./pages/Login";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import Home from "./pages/Home";
import Profile from "./pages/Profile";

import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { ProtectedRoute, PublicOnlyRoute } from "./components/ProtectedRoute";

import "./App.css";

function App() {
   return (
      // AuthProvider wraps everything so route guards can read auth state.
      <AuthProvider>
         <ToastProvider>
         <Routes>
            {/* Auth pages: redirect to "/" if already logged in. */}
            <Route element={<PublicOnlyRoute />}>
               <Route path="/login" element={<Login />} />
               <Route path="/register" element={<Register />} />
               <Route path="/forgot-password" element={<ForgotPassword />} />
            </Route>

            {/* Email-link landing pages: reachable regardless of session state. */}
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Everything below requires a logged-in user. */}
            <Route element={<ProtectedRoute />}>
               <Route path="/" element={<Home />} />
               <Route path="/profile" element={<Profile />} />
            </Route>

            {/* Catch-all: any unmatched URL renders the 404 page. */}
            <Route path="*" element={<NotFound />} />
         </Routes>
         </ToastProvider>
      </AuthProvider>
   );
}

export default App;
