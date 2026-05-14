import { createFileRoute } from "@tanstack/react-router";
import { AppProvider } from "@/lib/store";
import { App } from "@/components/App";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Retweet | شبكة اجتماعية" },
      { name: "description", content: "Retweet — تطبيق اجتماعي بميزات منشورات وتغريدات وريلز ومحادثات ومجموعات" },
      { name: "icon", content: "/favicon.png" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-hidden bg-background text-start [word-spacing:normal] [letter-spacing:normal] supports-[height:100dvh]:min-h-dvh">
      <AppProvider>
        <App />
      </AppProvider>
    </div>
  );
}
