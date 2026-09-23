import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MICHILU（ミチル）",
    short_name: "MICHILU",
    description: "不動産のための道路情報チェック。住所から市町村の公式道路図をその場所で開きます。",
    start_url: "/",
    display: "standalone",
    background_color: "#fefeff",
    theme_color: "#fefeff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
