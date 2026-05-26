import { useAuth } from "../contexts/AuthContext";
import AppShell from "../components/layout/AppShell";

// Placeholder home — real dashboard lands later. Wraps in AppShell so the
// sidebar (and topbar) match the rest of the authenticated app.
function Home() {
   const { user } = useAuth();
   return (
      <AppShell title="Dashboard">
         <div className="main">
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
               Welcome, {user?.name?.split(" ")[0] || "there"}
            </h1>
            <p style={{ color: "var(--text-secondary)" }}>
               Signed in as {user?.email}
            </p>
         </div>
      </AppShell>
   );
}

export default Home;
