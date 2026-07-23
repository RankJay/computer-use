import { useParams } from "react-router-dom";

import { AppPageShell } from "@/app/AppPageShell";
import { HomePageContent } from "@/features/home";

export default function HomePage() {
  const { chatId } = useParams<{ chatId?: string }>();

  return (
    <AppPageShell>
      <HomePageContent chatId={chatId} />
    </AppPageShell>
  );
}
