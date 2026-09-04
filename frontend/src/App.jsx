import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router";

import Register from "./pages/Register";
import Login from "./pages/Login";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Clubs from "./pages/Clubs";
import ClubDetail from "./pages/ClubDetail";
import CreateClub from "./pages/CreateClub";
import EventForm from "./pages/EventForm";
import Explore from "./pages/Explore";
import MyEvents from "./pages/MyEvents";
import MyClubs from "./pages/MyClubs";
import EventDetail from "./pages/EventDetail";
import Faculty from "./pages/Faculty";
import AllClubs from "./pages/AllClubs";
import AllStudents from "./pages/AllStudents";
import AllEvents from "./pages/AllEvents";
import ClubControls from "./pages/ClubControls";
import ManageMembers from "./pages/ManageMembers";
import ClubRoles from "./pages/ClubRoles";
import ClubAdmin from "./pages/ClubAdmin";
import ClubEvents from "./pages/ClubEvents";
import ClubAnnouncements from "./pages/ClubAnnouncements";
import MyAnnouncements from "./pages/MyAnnouncements";

import { AuthProvider } from "./contexts/AuthProvider";
import { ActiveClubProvider } from "./contexts/ActiveClubProvider";
import { ToastProvider } from "./contexts/ToastProvider";
import { ConfirmProvider } from "./contexts/ConfirmProvider";
import { ProtectedRoute, PublicOnlyRoute } from "./components/ProtectedRoute";
import { useAuth } from "./contexts/AuthContext";
import BootScreen from "./components/BootScreen";

import "./App.css";

// Hold the whole app behind the branded splash until the session bootstrap
// (the /me check) settles, so no route flashes before we know who's logged in.
// The splash also stays up for a minimum dwell so it never just flickers by.
const BOOT_MIN_MS = 3000;

function BootGate({ children }) {
   const { loading } = useAuth();
   const [minElapsed, setMinElapsed] = useState(false);

   useEffect(() => {
      const id = setTimeout(() => setMinElapsed(true), BOOT_MIN_MS);
      return () => clearTimeout(id);
   }, []);

   if (loading || !minElapsed) return <BootScreen />;
   return children;
}

// The dashboard at "/" is a personal view (your clubs, your events). SuperAdmins manage
// the institute rather than take part in it, so they're sent to the admin area instead.
function HomeRoute() {
   const { user } = useAuth();
   if (user?.role === "superAdmin") {
      return <Navigate to="/admin/faculty" replace />;
   }
   return <Home />;
}

function App() {
   return (
      // AuthProvider wraps everything so route guards can read auth state.
      <AuthProvider>
         <BootGate>
            <ActiveClubProvider>
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
                        <Route
                           path="/reset-password"
                           element={<ResetPassword />}
                        />

                        {/* Everything below requires a logged-in user (any role). Club admin
                            pages are reachable by anyone authenticated — the pages themselves
                            gate on per-club capabilities (members:moderate / roles:manage), so a
                            delegated non-coordinator (even a student) can use them. */}
                        <Route element={<ProtectedRoute />}>
                           <Route path="/" element={<HomeRoute />} />
                           <Route
                              path="/clubs/:slug"
                              element={<ClubDetail />}
                           />
                           <Route
                              path="/clubs/:slug/members"
                              element={<ManageMembers />}
                           />
                           <Route
                              path="/clubs/:slug/admin"
                              element={<ClubAdmin />}
                           />
                           <Route
                              path="/clubs/:slug/events"
                              element={<ClubEvents />}
                           />
                           <Route
                              path="/clubs/:slug/roles"
                              element={<ClubRoles />}
                           />
                           <Route
                              path="/clubs/:slug/announcements"
                              element={<ClubAnnouncements />}
                           />
                           <Route
                              path="/clubs/:slug/events/new"
                              element={<EventForm />}
                           />
                           <Route
                              path="/events/:eventId"
                              element={<EventDetail />}
                           />
                           {/* Profiles are open to any signed-in user — your own at
                               /profile, anyone else's at /u/:handle. */}
                           <Route path="/profile" element={<Profile />} />
                           <Route path="/u/:handle" element={<Profile />} />
                        </Route>

                        {/* Club browse/join is a student feature. */}
                        <Route element={<ProtectedRoute roles={["student"]} />}>
                           {/* Topbar bell — the cross-club announcement digest. Faculty
                               reach each club's board from their own sidebar instead. */}
                           <Route
                              path="/announcements"
                              element={<MyAnnouncements />}
                           />
                           <Route path="/clubs" element={<Clubs />} />
                           <Route path="/explore" element={<Explore />} />
                           <Route path="/my-events" element={<MyEvents />} />
                           <Route path="/my-clubs" element={<MyClubs />} />
                        </Route>

                        {/* Account settings — students + faculty only; a super admin
                            has no editable profile of their own. */}
                        <Route
                           element={
                              <ProtectedRoute roles={["student", "faculty"]} />
                           }
                        >
                           <Route path="/settings" element={<Settings />} />
                        </Route>

                        {/* Club creation — faculty + super admins only. */}
                        <Route
                           element={
                              <ProtectedRoute
                                 roles={["faculty", "superAdmin"]}
                              />
                           }
                        >
                           <Route path="/clubs/new" element={<CreateClub />} />
                        </Route>

                        {/* SuperAdmin-only platform administration, grouped under /admin. */}
                        <Route
                           element={<ProtectedRoute roles={["superAdmin"]} />}
                        >
                           <Route
                              path="/admin"
                              element={<Navigate to="/admin/faculty" replace />}
                           />
                           <Route path="/admin/faculty" element={<Faculty />} />
                           <Route
                              path="/admin/students"
                              element={<AllStudents />}
                           />
                           <Route path="/admin/clubs" element={<AllClubs />} />
                           <Route
                              path="/admin/events"
                              element={<AllEvents />}
                           />
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
            </ActiveClubProvider>
         </BootGate>
      </AuthProvider>
   );
}

export default App;
