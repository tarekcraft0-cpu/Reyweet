import { createFileRoute } from "@tanstack/react-router";
import { WebAppRoot } from "@/spa/WebAppRoot";

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
  return <WebAppRoot />;
}
