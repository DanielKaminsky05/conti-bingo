import type { MetadataRoute } from "next"

// Served at /manifest.webmanifest. Next auto-injects <link rel="manifest">.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Contibingo",
    short_name: "Contibingo",
    description: "Section participation bingo for Ivey.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf9f6",
    theme_color: "#6aaa64",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
