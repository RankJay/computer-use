import { AppQueryProvider } from "@/app/providers/QueryProvider";
import { SettingsProvider } from "@/app/providers/SettingsProvider";
import { ControlCenter } from "@/features/control-center/ControlCenter";

export default function App() {
  return (
    <AppQueryProvider>
      <SettingsProvider>
        <ControlCenter />
      </SettingsProvider>
    </AppQueryProvider>
  );
}
