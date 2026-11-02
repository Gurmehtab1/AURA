import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AURA — Adaptive Urban Response Assistant" },
      { name: "description", content: "AURA fuses citizen emergency reports into prioritized incidents. When every second matters." },
      { property: "og:title", content: "AURA — Adaptive Urban Response Assistant" },
      { property: "og:description", content: "Emergency intelligence platform: citizen reporting, command center and responder portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

// The AURA site is plain HTML/CSS/JS in public/aura/. Send visitors there.
function Index() {
  useEffect(() => {
    window.location.replace("/aura/index.html");
  }, []);
  return <div className="min-h-screen bg-background" />;
}
