import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AppQueryProvider } from "@/app/providers/QueryProvider";
import { SettingsProvider } from "@/app/providers/SettingsProvider";
import { ControlCenter } from "@/features/control-center/ControlCenter";
import { SettingsPage } from "@/features/settings/SettingsPage";

export default function App() {
  return (
    <AppQueryProvider>
      <SettingsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ControlCenter />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </BrowserRouter>
      </SettingsProvider>
    </AppQueryProvider>
  );
}
