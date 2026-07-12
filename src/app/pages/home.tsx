import { useParams } from "react-router-dom";

import { HomePageContent } from "@/features/home";

export default function HomePage() {
  const { chatId } = useParams<{ chatId?: string }>();

  return (
    <main className="flex flex-col items-center justify-start h-screen w-screen bg-background text-white shadow-none ring-0">
      <HomePageContent chatId={chatId} />
    </main>
  );
}
