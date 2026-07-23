import { lazy, Suspense, type ReactElement, type ReactNode } from "react";
import { BrowserRouter, Route, Routes, useParams } from "react-router-dom";

import { RouteErrorBoundary } from "@/components/boundaries/ErrorBoundary";

import { DeepLinkBootstrap } from "./DeepLinkBootstrap";
import HomePage from "./pages/home";
import { AttemptHostProvider } from "./providers/AttemptHostProvider";
import { AppQueryProvider } from "./providers/QueryProvider";
import { RouteChunkFallback } from "./route-chunk-fallback";
import { UpdaterBootstrap } from "./UpdaterBootstrap";

const HistoryPage = lazy(() => import("./pages/history"));
const SettingsPage = lazy(() => import("./pages/settings"));
const AccountPage = lazy(() => import("./pages/account"));

function HomeRoute(): ReactElement {
  const { chatId } = useParams<{ chatId?: string }>();

  return (
    <RouteErrorBoundary resetKeys={[chatId ?? "new"]}>
      <HomePage />
    </RouteErrorBoundary>
  );
}

function LazyRoute(props: { readonly page: ReactNode }): ReactElement {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<RouteChunkFallback />}>{props.page}</Suspense>
    </RouteErrorBoundary>
  );
}

function App() {
  return (
    <AppQueryProvider>
      <AttemptHostProvider>
        <BrowserRouter>
          <DeepLinkBootstrap />
          <UpdaterBootstrap />
          <Routes>
            <Route path="/" element={<HomeRoute />} />
            <Route path="/chat/:chatId" element={<HomeRoute />} />
            <Route path="/settings" element={<LazyRoute page={<SettingsPage />} />} />
            <Route path="/settings/account" element={<LazyRoute page={<AccountPage />} />} />
            <Route path="/history" element={<LazyRoute page={<HistoryPage />} />} />
          </Routes>
        </BrowserRouter>
      </AttemptHostProvider>
    </AppQueryProvider>
  );
}

export default App;
