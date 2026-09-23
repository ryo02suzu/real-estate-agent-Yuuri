import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // サーバー不要の静的サイトとして書き出す（住所をサーバーに送らないため）
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
