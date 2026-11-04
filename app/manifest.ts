import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Saheli — Voice-Activated AI Guardian",
    short_name: "Saheli",
    description:
      "Activates with your voice, verifies real emergencies before escalating, seals tamper-evident evidence.",
    start_url: "/arm",
    display: "standalone",
    background_color: "#140b26",
    theme_color: "#1a1030",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
