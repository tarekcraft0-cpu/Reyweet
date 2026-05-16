import { createRoot } from "react-dom/client";
import { AppProvider } from "@/lib/store";
import { App } from "@/components/App";
import "@/styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("missing #root");

createRoot(el).render(
  <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-hidden bg-background text-start supports-[height:100dvh]:min-h-dvh">
    <AppProvider>
      <App />
    </AppProvider>
  </div>,
);
