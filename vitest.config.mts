import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// 試験でも、アプリと同じ「@/」（リポジトリの根）で読めるようにする（部品の試験が components/app/home.tsx などを通して lib を読むため）
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // 作業用の別の作業ツリー（.claude/worktrees。Git には入らない）の試験は数えない
  test: { exclude: [...configDefaults.exclude, ".claude/worktrees/**"] },
});
