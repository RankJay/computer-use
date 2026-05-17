import { AppQueryProvider } from "@/providers/query-provider";
import { SettingsProvider } from "@/providers/settings-provider";
import { ControlCenter } from "@/components/ControlCenter";

export default function App() {
  return (
    <AppQueryProvider>
      <SettingsProvider>
        <ControlCenter />
      </SettingsProvider>
    </AppQueryProvider>
  );
}
