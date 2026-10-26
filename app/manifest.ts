import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tesorra Racing",
    short_name: "Tesorra",
    description: "Drift, formula and moto — drivers, live races and the team store.",
    start_url: "/en",
    display: "standalone",
    background_color: "#0b0d14",
    theme_color: "#0b0d14",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
