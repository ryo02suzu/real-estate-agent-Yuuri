// 道路種別の地図の一覧（市区町村・地図の名前・URL）を書き出す。凡例を作り直すスクリプト（scripts/legends/build.py）に渡す。
// npm run legends から LEGEND_MAPS=<出力先> で呼ぶ
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { MUNICIPALITIES, buildLinks } from "./municipalities";

it.runIf(process.env.LEGEND_MAPS)("道路種別の地図の一覧を書き出す", () => {
  const rows = MUNICIPALITIES.flatMap((m) =>
    buildLinks(m, 36, 139.5)
      .filter((l) => l.kind !== "public_road")
      .map((l) => ({ city: m.name, pref: m.pref, label: l.label, url: l.url })),
  );
  writeFileSync(process.env.LEGEND_MAPS!, JSON.stringify(rows, null, 1));
});
