// 3D タイルの形の圧縮（Draco）をほどく部品を public/draco/<three.js の版>/ に置く（components/app/city-3d.ts が読む）。
// WebAssembly とその読み込み口で、バンドルには入らない別のファイル。npm run dev / build の最初に実行される（package.json）。
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const three = join(process.cwd(), "node_modules/three");
const { version } = JSON.parse(readFileSync(join(three, "package.json"), "utf8"));
// three.js の REVISION は版の真ん中の数（0.186.1 → 186）
const rev = version.split(".")[1];
const src = join(three, "examples/jsm/libs/draco/gltf");
const out = join(process.cwd(), "public/draco", rev);
mkdirSync(out, { recursive: true });
for (const f of ["draco_decoder.wasm", "draco_wasm_wrapper.js", "draco_decoder.js"]) copyFileSync(join(src, f), join(out, f));
console.log(`Draco の部品（three.js ${version}）を ${out} に置きました`);
