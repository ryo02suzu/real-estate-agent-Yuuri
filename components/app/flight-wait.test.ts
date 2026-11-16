import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PREF_NAMES } from "@/lib/roadmap/regions";
import { PREF_VIEW, prefOfLabel, waitViewOf } from "./flight-wait";

/** 2点の距離（km。近い所の目安） */
const km = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * 111.32 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110.95);

/**
 * 2026-11-16 に利用者から「住所で検索したら、よく分からない所へ拡大していった」と知らせがあった。地球から降りる演出は、調べ終わるまで
 * 日本の真ん中（長野県のあたり）の1点へ寄り続けていたので、調べるのに時間がかかる住所（本番の八街市の地番で約16秒）では、物件と関係の
 * 無い所へ拡大して見えた。調べている間は、入れた住所の都道府県の上空へ向かう
 */
describe("調べている間に向かう上空（components/app/flight-wait.ts）", () => {
  it("47都道府県すべてにあり、中心は日本の中、ズームは都道府県のまわりが見える大きさ", () => {
    expect(Object.keys(PREF_VIEW).sort()).toEqual(Object.values(PREF_NAMES).sort());
    for (const [pref, [lng, lat, zoom]] of Object.entries(PREF_VIEW)) {
      expect(lng, pref).toBeGreaterThan(122);
      expect(lng, pref).toBeLessThan(146);
      expect(lat, pref).toBeGreaterThan(24);
      expect(lat, pref).toBeLessThan(46);
      // 遠くの地球の絵（ズーム 8 までの粗い絵）がぼやけない高さ
      expect(zoom, pref).toBe(5.5);
    }
    // 人口の重心：都庁・県庁のある街の近く（群馬県は前橋・高崎のあいだ、東京都は都心、北海道は札幌の近く）
    expect(km(PREF_VIEW["東京都"].slice(0, 2) as [number, number], [139.6917, 35.6895])).toBeLessThan(10);
    expect(km(PREF_VIEW["群馬県"].slice(0, 2) as [number, number], [139.0608, 36.3912])).toBeLessThan(15);
    expect(km(PREF_VIEW["北海道"].slice(0, 2) as [number, number], [141.3469, 43.0642])).toBeLessThan(60);
  });

  it("入れた住所から都道府県を読む（都道府県から・郵便番号つき・地番・市区町村から）", () => {
    expect(prefOfLabel("群馬県桐生市元宿町3-27")).toBe("群馬県");
    expect(prefOfLabel("〒376-0045 群馬県桐生市元宿町3-27")).toBe("群馬県");
    expect(prefOfLabel("地番 千葉県八街市八街ほ224-12")).toBe("千葉県");
    expect(prefOfLabel("神奈川県横浜市西区みなとみらい2-2-1")).toBe("神奈川県");
    expect(prefOfLabel("京都府京都市中京区河原町通二条下る下丸屋町400")).toBe("京都府");
    // 都道府県を書かなくても、市区町村の名前が1つの都道府県にだけあれば
    expect(prefOfLabel("桐生市元宿町3-27")).toBe("群馬県");
    expect(prefOfLabel("吾川郡いの町字西前田1186番10")).toBe("高知県");
  });

  it("読めない・2つ以上の都道府県にある名前は null（日本の上空のまま、どこかへ寄らない）", () => {
    expect(prefOfLabel("府中市宮西町2-24")).toBeNull();
    expect(prefOfLabel("本町1-1")).toBeNull();
    expect(prefOfLabel("")).toBeNull();
    expect(waitViewOf("本町1-1")).toBeNull();
    expect(waitViewOf("群馬県桐生市元宿町3-27")).toEqual({ center: [PREF_VIEW["群馬県"][0], PREF_VIEW["群馬県"][1]], zoom: PREF_VIEW["群馬県"][2] });
  });

  it("演出は、調べている間にこの上空へ向かい、日本の真ん中の1点へ寄り続けない", () => {
    const src = readFileSync(join(__dirname, "globe-flight.tsx"), "utf8");
    expect(src).toMatch(/const v = waitViewOf\(label\);/);
    expect(src).not.toMatch(/m\.easeTo\(\{ zoom: 4\.4/);
    // 地番で探す住所は時間がかかることがあるので、あきらめるまで 20 秒待つ
    expect(src).toMatch(/giveUp: 20000/);
  });

  // 本番を 4G くらいの回線で確かめると、絵の無い地球のまま回り（星だけ）、降りる途中は灰色一色、そのあといきなり住宅地の写真になっていた
  it("回線が遅くても：地球の絵を 2 秒まで待ち、山並みの上の写真を先に読んで（最大 0.9 秒）から降りる。遠くを淡くしすぎない", () => {
    const src = readFileSync(join(__dirname, "globe-flight.tsx"), "utf8");
    expect(src).toMatch(/firstTiles: 2000/);
    expect(src).toMatch(/warmOver: 900/);
    expect(src).toMatch(/const over = warmOver\(target\.lat, target\.lng\);/);
    expect(src).toMatch(/void over\.then\(go\);\s*later\(T\.warmOver, go\);/);
    // 降り始め（flyTo）は go の中だけ（写真を待たずに降りない）
    const goBody = src.slice(src.indexOf("const go = () => {"), src.indexOf("void over.then(go);"));
    expect(goBody).toMatch(/m\.flyTo\(\{ center: here, zoom: OVER\.zoom/);
    expect(src.split("m.flyTo({ center: here, zoom: OVER.zoom").length).toBe(2);
    const look = readFileSync(join(__dirname, "flight-look.ts"), "utf8");
    expect(look).toMatch(/"raster-brightness-min": \["interpolate", \["linear"\], \["zoom"\], 8, 0, 10, L\.far \* 0\.6\]/);
    expect(look).toMatch(/"raster-saturation": \["interpolate", \["linear"\], \["zoom"\], 8, L\.earth\.saturation, 10, -0\.3\]/);
  });
});
