// 壮大なオープニング（長い版）の街の光（components/app/launch-city.js）を、app/layout.tsx の <head> にそのまま入れるための文字列。
// 書き出し（next build）のときにファイルを読む（サーバーでだけ使う。行ごとの字下げと、// だけの説明の行・空の行は外して小さくする。
// 行は分けたままなので、書いたとおりに動く）
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const LAUNCH_CITY_SCRIPT = readFileSync(join(process.cwd(), "components/app/launch-city.js"), "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("//"))
  .join("\n");
