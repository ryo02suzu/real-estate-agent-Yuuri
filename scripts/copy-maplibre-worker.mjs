// MapLibre GL（v6）の地図描画のワーカーを public/maplibre/<版>/ に置く。ワーカーは本体とは別のファイルで読み込まれ、
// バンドルすると本体からの相対パスでは見つからないので、components/live-map.tsx が setWorkerUrl() でこの場所を教える。
// npm run dev / build の最初に実行される（package.json）。
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const pkg = join(process.cwd(), "node_modules/maplibre-gl");
const { version } = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
const out = join(process.cwd(), "public/maplibre", version);
mkdirSync(out, { recursive: true });
// ワーカーは同じ場所の maplibre-gl-shared.mjs を読み込む
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(join(pkg, "dist", f), join(out, f));
console.log(`MapLibre GL ${version} のワーカーを ${out} に置きました`);
