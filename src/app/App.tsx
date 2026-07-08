import { BrowserRouter, Route, Routes } from "react-router-dom";

import HistoryPage from "./pages/history";
import HomePage from "./pages/home";
import SettingsPage from "./pages/settings";
import { AppQueryProvider } from "./providers/QueryProvider";

function App() {
  return (
    <AppQueryProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </BrowserRouter>
    </AppQueryProvider>
  );
}

export default App;
