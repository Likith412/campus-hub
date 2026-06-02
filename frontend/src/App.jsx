import { Routes, Route } from "react-router";

import Register from "./pages/Register";
import Login from "./pages/Login";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Clubs from "./pages/Clubs";
import ClubDetail from "./pages/ClubDetail";

import { AuthProvider } from "./contexts/AuthProvider";
import { ToastProvider } from "./contexts/ToastProvider";
import { ConfirmProvider } from "./contexts/ConfirmProvider";
import { ProtectedRoute, PublicOnlyRoute } from "./components/ProtectedRoute";

import "./App.css";

function App() {
   return (
      // AuthProvider wraps everything so route guards can read auth state.
      <AuthProvider>
         <ToastProvider>
         <ConfirmProvider>
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
               <Route path="/clubs" element={<Clubs />} />
               <Route path="/clubs/:slug" element={<ClubDetail />} />
            </Route>

            {/* Catch-all: any unmatched URL renders the 404 page. */}
            <Route path="*" element={<NotFound />} />
         </Routes>
         </ConfirmProvider>
         </ToastProvider>
      </AuthProvider>
   );
}

export default App;
