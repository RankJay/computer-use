import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { RouteErrorBoundary } from "@/components/boundaries/ErrorBoundary";
import { SettingsPageSkeleton } from "@/features/settings/SettingsPageSkeleton";

import HistoryPage from "./pages/history";
import HomePage from "./pages/home";
import { AppQueryProvider } from "./providers/QueryProvider";

const SettingsPage = lazy(() => import("./pages/settings"));

function App() {
  return (
    <AppQueryProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/settings"
            element={
              <RouteErrorBoundary>
                <Suspense>
                  <SettingsPage />
                </Suspense>
              </RouteErrorBoundary>
            }
          />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </BrowserRouter>
    </AppQueryProvider>
  );
}

export default App;
