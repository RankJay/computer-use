import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { RouteErrorBoundary } from "@/components/boundaries/ErrorBoundary";

import HomePage from "./pages/home";
import { AppQueryProvider } from "./providers/QueryProvider";

const HistoryPage = lazy(() => import("./pages/history"));
const SettingsPage = lazy(() => import("./pages/settings"));

function App() {
  return (
    <AppQueryProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat/:chatId" element={<HomePage />} />
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
          <Route
            path="/history"
            element={
              <RouteErrorBoundary>
                <Suspense>
                  <HistoryPage />
                </Suspense>
              </RouteErrorBoundary>
            }
          />
        </Routes>
      </BrowserRouter>
    </AppQueryProvider>
  );
}

export default App;
