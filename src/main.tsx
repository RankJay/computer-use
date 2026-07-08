import React from "react";
import ReactDOM from "react-dom/client";
import { scan } from "react-scan";

if (import.meta.env.DEV) {
  scan({ enabled: true, animationSpeed: "slow" });
}

import App from "./app/App";

import "./index.css";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TooltipProvider>
      <App />
      <Toaster position="top-center" richColors />
    </TooltipProvider>
  </React.StrictMode>,
);
