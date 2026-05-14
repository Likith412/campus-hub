import { useAuth } from "../contexts/AuthContext";

// Placeholder home page — only reachable when authenticated (gated by ProtectedRoute).
function Home() {
   const { user, logout } = useAuth();
   return (
      <div style={{ padding: 24 }}>
         <h1>Home</h1>
         <p>Signed in as {user?.email}</p>
         <button onClick={logout}>Log out</button>
      </div>
   );
}

export default Home;
