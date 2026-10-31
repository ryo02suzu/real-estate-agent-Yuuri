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
    // 外部 Agent Skills のサンプル/補助スクリプトはアプリのlint対象外
    ".claude/skills/**",
    ".agents/skills/**",
    // claude-code-action が Claude の作業用ディレクトリに置く、PR 側の .claude の控え（.claude-pr/.claude/skills/ の外部サンプル）。
    // git では追跡されず、CI・Vercel の取得には無いので、アプリの lint 対象外にする
    ".claude-pr/**",
  ]),
]);

export default eslintConfig;
