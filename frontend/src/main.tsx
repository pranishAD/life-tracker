import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Skeleton entry point from devops (Phase 0). frontend-dev owns everything
// under src/ from here — routing, pages, API client, etc.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
