import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AppQueryProvider } from "@/app/providers/QueryProvider";
import { ControlCenter } from "@/features/control-center/ControlCenter";
import { SettingsPage } from "@/features/settings/SettingsPage";

export default function App() {
  return (
    <AppQueryProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ControlCenter />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </BrowserRouter>
    </AppQueryProvider>
  );
}
