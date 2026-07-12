import React from "react";
import ReactDOM from "react-dom/client";
import { scan } from "react-scan";

import App from "./app/App";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";

import "./index.css";

if (import.meta.env.DEV) {
  scan({ enabled: true, animationSpeed: "slow" });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TooltipProvider>
      <App />
      <Toaster position="top-center" richColors />
    </TooltipProvider>
  </React.StrictMode>,
);
