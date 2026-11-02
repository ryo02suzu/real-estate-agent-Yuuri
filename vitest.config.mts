import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 試験でも、アプリと同じ「@/」（リポジトリの根）で読めるようにする（部品の試験が components/app/home.tsx などを通して lib を読むため）
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
