import { Routes, Route, Navigate } from "react-router";

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
import CreateClub from "./pages/CreateClub";
import Faculty from "./pages/Faculty";
import AllClubs from "./pages/AllClubs";
import ClubControls from "./pages/ClubControls";

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
                     <Route
                        path="/forgot-password"
                        element={<ForgotPassword />}
                     />
                  </Route>

                  {/* Email-link landing pages: reachable regardless of session state. */}
                  <Route path="/verify-email" element={<VerifyEmail />} />
                  <Route path="/reset-password" element={<ResetPassword />} />

                  {/* Everything below requires a logged-in user (any role). */}
                  <Route element={<ProtectedRoute />}>
                     <Route path="/" element={<Home />} />
                     <Route path="/clubs/:slug" element={<ClubDetail />} />
                  </Route>

                  {/* Club browse/join is a student feature. */}
                  <Route element={<ProtectedRoute roles={["student"]} />}>
                     <Route path="/clubs" element={<Clubs />} />
                  </Route>

                  {/* Profile is for students + faculty only (super admin has none). */}
                  <Route
                     element={
                        <ProtectedRoute roles={["student", "faculty"]} />
                     }
                  >
                     <Route path="/profile" element={<Profile />} />
                  </Route>

                  {/* Club creation — faculty + super admins. */}
                  <Route
                     element={
                        <ProtectedRoute roles={["faculty", "superAdmin"]} />
                     }
                  >
                     <Route path="/clubs/new" element={<CreateClub />} />
                  </Route>

                  {/* SuperAdmin-only platform administration, grouped under /admin. */}
                  <Route element={<ProtectedRoute roles={["superAdmin"]} />}>
                     <Route
                        path="/admin"
                        element={<Navigate to="/admin/faculty" replace />}
                     />
                     <Route path="/admin/faculty" element={<Faculty />} />
                     <Route path="/admin/clubs" element={<AllClubs />} />
                     <Route
                        path="/admin/clubs/:slug"
                        element={<ClubControls />}
                     />
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
