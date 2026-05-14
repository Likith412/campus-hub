import { Routes, Route } from "react-router";

import Register from "./pages/Register";
import Login from "./pages/Login";
import Home from "./pages/Home";

import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute, PublicOnlyRoute } from "./components/ProtectedRoute";

import "./App.css";

function App() {
   return (
      // AuthProvider wraps everything so route guards can read auth state.
      <AuthProvider>
         <Routes>
            {/* Auth pages: redirect to "/" if already logged in. */}
            <Route element={<PublicOnlyRoute />}>
               <Route path="/login" element={<Login />} />
               <Route path="/register" element={<Register />} />
            </Route>

            {/* Everything below requires a logged-in user. */}
            <Route element={<ProtectedRoute />}>
               <Route path="/" element={<Home />} />
            </Route>
         </Routes>
      </AuthProvider>
   );
}

export default App;
