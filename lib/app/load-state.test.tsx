import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useAround, useEvacuation } from "@/components/app/use-property";
import { useLandPrices } from "@/components/land-price-card";
import { useSchools } from "@/components/school-card";
import { useStations } from "@/components/station-card";
import { samePlaces } from "./desk";
import { LOADING } from "./load-state";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** フックを 2 回描いて、返した値を並べる（描くたびに同じ値を返すか） */
function twice<T>(use: () => T): [T, T] {
  const seen: T[] = [];
  function Probe() {
    seen.push(use());
    return null;
  }
  renderToStaticMarkup(<Probe />);
  renderToStaticMarkup(<Probe />);
  return [seen[0], seen[1]];
}

/**
 * PC の物件の画面は、駅・学校・周辺施設から地図の札の並びを作り（useMemo）、地図へ渡す（useEffect で親の状態に入れる）。
 * 読み込み中のフックが描くたびに新しい「読み込み中」の値を返していたので、札の並びも毎回作り直され、親の描き直し →
 * また新しい値 → … と、読み込みが終わるまで描き直しが止まらなかった（検索から約5秒で 262 回。開発版で
 * 「Maximum update depth exceeded」）。読み込み中・データなしは、いつも同じ 1 つの値を返す
 */
describe("読み込み中の値は描くたびに同じ（lib/app/load-state.ts）", () => {
  it("駅・学校・周辺施設・避難場所・地価のフックは、読み込み中に同じ値を返す", () => {
    const hooks: (() => { status: string })[] = [() => useStations(36.41, 139.33), () => useSchools(36.41, 139.33), () => useAround(36.41, 139.33), () => useEvacuation(36.41, 139.33), () => useLandPrices(36.41, 139.33)];
    for (const use of hooks) {
      const [a, b] = twice(use);
      expect(a.status).toBe("loading");
      expect(a).toBe(b);
      expect(a).toBe(LOADING);
    }
  });

  it("データを読むフックの書き方：読み込み中・データなしを描くたびに作らない", () => {
    const files = [
      "components/app/use-property.ts",
      "components/app/use-national.ts",
      "components/app/neighbor-plan.tsx",
      "components/parcel-card.tsx",
      "components/school-card.tsx",
      "components/building-card.tsx",
      "components/hazard-card.tsx",
      "components/nearby-roads.tsx",
      "components/poi-card.tsx",
      "components/land-price-card.tsx",
      "components/station-card.tsx",
      "components/zoning-card.tsx",
    ];
    for (const f of files) {
      const src = read(f);
      // フックの最後の「読んだ地点の値か、読み込み中か」
      expect(src, f).not.toMatch(/state\?\.key === key \? state\.\w+ : \{ status: "loading" \}/);
      expect(src, f).toMatch(/state\?\.key === key \? state\.\w+ : LOADING;/);
    }
    // フックの中の「データなし」（描くたびに通る行）
    const none: [string, string][] = [
      ["components/app/use-property.ts", "if (!code) return NONE;"],
      ["components/app/use-national.ts", "if (!ready || key === null) return NONE;"],
      ["components/building-card.tsx", "if (!covered) return NONE;"],
      ["components/nearby-roads.tsx", "if (!read) return NONE;"],
      ["components/app/neighbor-plan.tsx", 'if (!ok) return info.status === "loading" ? LOADING : NONE;'],
      ["components/parcel-card.tsx", "if (townCenter) return TOWN_CENTER;"],
    ];
    for (const [f, line] of none) expect(read(f), f).toContain(line);
    // 周辺施設のデータが無いとき・共有の文面用の施設・近い地価 5 つも、描くたびに作り直さない
    const prop = read("components/app/use-property.ts");
    expect(prop).toMatch(/if \(!POI_DATA\.url\) return NO_POI_DATA;/);
    expect(prop).toMatch(/const pois: PoiState = useMemo\(/);
    expect(prop).toMatch(/const landPrice5 = useMemo\(/);
  });
});

describe("PC の地図の札（駅・学校・施設）の並び", () => {
  const a = [
    { key: "st:桐生", name: "桐生駅", sub: "徒歩8分", kind: "station" as const, lng: 139.33, lat: 36.41 },
    { key: "sc:北", name: "北小学校", kind: "school" as const, lng: 139.32, lat: 36.42 },
  ];
  it("同じ中身なら同じとみなし、名前・説明・位置・数が変われば違う", () => {
    expect(samePlaces(a, a.map((p) => ({ ...p })))).toBe(true);
    expect(samePlaces([], [])).toBe(true);
    expect(samePlaces(a, a.slice(0, 1))).toBe(false);
    expect(samePlaces(a, [{ ...a[0], sub: "徒歩9分" }, a[1]])).toBe(false);
    expect(samePlaces(a, [{ ...a[0], lat: 36.4101 }, a[1]])).toBe(false);
    expect(samePlaces(a, [a[1], a[0]])).toBe(false);
  });

  it("PC の画面は、同じ並びが届いても前の並びのまま（描き直しを起こさない）", () => {
    const shell = read("components/desktop-shell.tsx");
    expect(shell).toMatch(/setPlaces\(\(cur\) => \(samePlaces\(cur, next\) \? cur : next\)\)/);
    expect(shell).toMatch(/onPlaces=\{onPlaces\}/);
    expect(shell).not.toMatch(/onPlaces=\{setPlaces\}/);
  });
});
