import { AppQueryProvider } from "@/app/providers/QueryProvider";
import { SettingsProvider } from "@/app/providers/SettingsProvider";
import { AgentSessionProvider } from "@/features/control-center/AgentSessionProvider";
import { ControlCenter } from "@/features/control-center/ControlCenter";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { BrowserRouter, Route, Routes } from "react-router-dom";

export default function App() {
  return (
    <AppQueryProvider>
      <SettingsProvider>
        <BrowserRouter>
          <AgentSessionProvider>
            <Routes>
              <Route path="/" element={<ControlCenter />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </AgentSessionProvider>
        </BrowserRouter>
      </SettingsProvider>
    </AppQueryProvider>
  );
}
