import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

// Authenticated-page chrome: sidebar + topbar + main content slot.
// Page-level components render their own `.main` inside `children`.
export default function AppShell({ title, topbarRight, children }) {
   return (
      <div className="app">
         <Sidebar />
         <main>
            <Topbar title={title} rightSlot={topbarRight} />
            {children}
         </main>
      </div>
   );
}
