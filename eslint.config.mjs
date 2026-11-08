import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // node_modules から置いた MapLibre のワーカー（scripts/copy-maplibre-worker.mjs）
    "public/maplibre/**",
    // Claude Code の作業用の git worktree（別の作業の写し。リポジトリの中身ではない）
    ".claude/worktrees/**",
    // node_modules から置いた Draco の部品（scripts/copy-draco.mjs。3D の街の形をほどく）
    "public/draco/**",
    // ホームの街の焼き込み（ヘッドレスの Chromium で動かす道具。アプリには入らない）
    "scripts/city-bake/**",
    // 外部 Agent Skills のサンプル/補助スクリプトはアプリのlint対象外
    ".claude/skills/**",
    ".agents/skills/**",
  ]),
]);

export default eslintConfig;
