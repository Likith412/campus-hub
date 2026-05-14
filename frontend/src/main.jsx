import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";
import App from "./App.jsx";

// BrowserRouter wraps the app so any component can use react-router hooks (useNavigate, useLocation, etc).
createRoot(document.getElementById("root")).render(
   <BrowserRouter>
      <App />
   </BrowserRouter>,
);
