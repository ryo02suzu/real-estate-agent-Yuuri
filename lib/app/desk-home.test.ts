import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TODS, todOfSun } from "./desk";
import { HOME_BOUNDS, HOME_CORNERS, HOME_FADE_MS, HOME_TILE_ZOOMS, homeCrispZoom, homeFadeMs, homeFadeZooms, homeImage, homeLightsCredit, nextHomeStep } from "./desk-home";
import { BASE, solar } from "./sun";

/** WebP の大きさ（RIFF の見出しから。VP8・VP8L・VP8X） */
function webpSize(buf: Buffer): [number, number] {
  expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
  expect(buf.toString("ascii", 8, 12)).toBe("WEBP");
  const kind = buf.toString("ascii", 12, 16);
  if (kind === "VP8X") return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (kind === "VP8L") {
    const b = buf.readUInt32LE(21);
    return [1 + (b & 0x3fff), 1 + ((b >>> 14) & 0x3fff)];
  }
  if (kind === "VP8 ") return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  throw new Error(`知らない WebP：${kind}`);
}

const mercY = (lat: number) => (1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2;
/** 経度・緯度を含むタイルの番号 */
const tileOf = (lon: number, lat: number, z: number) => [Math.floor(((lon + 180) / 360) * 2 ** z), Math.floor(mercY(lat) * 2 ** z)];

describe("PC のホームの背景：時間帯の絵", () => {
  it("上の帯の時間帯ごとの絵。「夕」は dusk の絵。明かりの入った絵は夕と夜だけ", () => {
    expect(TODS.map((t) => homeImage(t).key)).toEqual(["morning", "day", "dusk", "night"]);
    expect(TODS.map((t) => homeImage(t).lights)).toEqual([false, false, true, true]);
  });

  it("4つとも同じ四隅。タイルを読む範囲は四隅と同じ", () => {
    const [[w, n], [e], [, s]] = HOME_CORNERS;
    expect(HOME_CORNERS[1][1]).toBe(n);
    expect(HOME_CORNERS[3]).toEqual([w, s]);
    expect(HOME_BOUNDS).toEqual([w, s, e, n]);
  });

  it("タイルは時間帯ごとに public/home/tiles にあり、1枚 512 画素（粗い段から細かい段まで。東京も那覇も、いちばん細かい段まで）", () => {
    expect(HOME_TILE_ZOOMS).toEqual({ minzoom: 4, maxzoom: 8 });
    for (const t of TODS) {
      const { tiles } = homeImage(t);
      // 作り直すたびに後ろの印（?v=作った日時）が変わる（タイルは長く覚えてよい決まりなので、古いものを出さない）
      expect(tiles).toMatch(/^\/home\/tiles\/(morning|day|dusk|night)\/\{z\}\/\{x\}\/\{y\}\.webp\?v=\d{12}$/);
      for (const [lon, lat] of [
        [139.767, 35.681], // 東京駅
        [127.681, 26.212], // 那覇
        [141.354, 43.062], // 札幌
      ]) {
        for (let z = HOME_TILE_ZOOMS.minzoom; z <= HOME_TILE_ZOOMS.maxzoom; z++) {
          const [x, y] = tileOf(lon, lat, z);
          const url = tiles.split("?")[0].replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
          const file = join(process.cwd(), "public", url);
          expect(existsSync(file), url).toBe(true);
          expect(webpSize(readFileSync(file)), url).toEqual([512, 512]);
        }
      }
    }
  });

  it("くっきり見える一番寄った高さ：ふつうの画面はズーム 8、細かい画面（Mac・iPad）は 7。そこから薄くなり、少し先で今の地図になる", () => {
    expect(homeCrispZoom(1)).toBe(8);
    expect(homeCrispZoom(2)).toBe(7);
    expect(homeCrispZoom(NaN)).toBe(8);
    expect(homeCrispZoom(0.5)).toBe(8);
    expect(homeFadeZooms(2)).toEqual([7, 7.8]);
    expect(homeFadeZooms(1)[0]).toBe(8);
    expect(homeFadeZooms(1)[1]).toBeCloseTo(8.8);
    // ホームを開いたとき（ズーム 5〜6）は、どちらの画面でも薄くならない
    expect(homeFadeZooms(3)[0]).toBeGreaterThan(6);
  });

  it("時計に合わせるときは、物件の場所（無ければ東京駅）の今の太陽の時間帯の絵", () => {
    const at = (hhmm: string) => {
      const s = solar(new Date(`2026-11-21T${hhmm}:00+09:00`), BASE);
      return homeImage(todOfSun(s.altitude, s.rising)).key;
    };
    expect(at("06:45")).toBe("morning"); // 日の出の少しあと（昇る途中の低い太陽）
    expect(at("12:00")).toBe("day");
    expect(at("16:20")).toBe("dusk"); // 沈む途中
    expect(at("21:00")).toBe("night");
  });
});

describe("PC のホームの背景：溶かして替える順番", () => {
  it("同じ絵なら何もしない。違えば読み込む", () => {
    expect(nextHomeStep({ shown: "day" }, "day")).toBe("none");
    expect(nextHomeStep({ shown: "day" }, "night")).toEqual({ load: "night" });
  });

  it("読み込み中に別の時間帯を選んだら、読み込み中の絵はやめる（同じなら待つ）", () => {
    expect(nextHomeStep({ shown: "day", incoming: { key: "night", fading: false } }, "night")).toBe("wait");
    expect(nextHomeStep({ shown: "day", incoming: { key: "night", fading: false } }, "dusk")).toBe("cancel");
    expect(nextHomeStep({ shown: "day", incoming: { key: "night", fading: false } }, "day")).toBe("cancel");
    // やめたあとは、出したい絵を読む（今の絵なら何もしない）
    expect(nextHomeStep({ shown: "day" }, "dusk")).toEqual({ load: "dusk" });
    expect(nextHomeStep({ shown: "day" }, "day")).toBe("none");
  });

  it("溶かしている途中に選び直しても、溶かし終えるまで待つ（途中で飛ばない）", () => {
    expect(nextHomeStep({ shown: "day", incoming: { key: "night", fading: true } }, "morning")).toBe("wait");
    expect(nextHomeStep({ shown: "day", incoming: { key: "night", fading: true } }, "day")).toBe("wait");
    // 溶かし終えたら（夜が見えている）、続けて選んだ絵へ
    expect(nextHomeStep({ shown: "night" }, "morning")).toEqual({ load: "morning" });
  });

  it("溶かす長さは約 1.2 秒。動きを減らす設定では溶かさない", () => {
    expect(HOME_FADE_MS).toBe(1200);
    expect(homeFadeMs(true)).toBe(1200);
    expect(homeFadeMs(false)).toBe(0);
  });

  it("明かりの出典は、明かりの入った絵（夕・夜）が見えている間だけ（読み込み中の見えない絵は数えない）", () => {
    expect(homeLightsCredit({ shown: "night" })).toBe(true);
    expect(homeLightsCredit({ shown: "dusk" })).toBe(true);
    expect(homeLightsCredit({ shown: "day" })).toBe(false);
    expect(homeLightsCredit({ shown: "day", incoming: { key: "night", fading: false } })).toBe(false);
    expect(homeLightsCredit({ shown: "day", incoming: { key: "night", fading: true } })).toBe(true);
    expect(homeLightsCredit({ shown: "night", incoming: { key: "morning", fading: true } })).toBe(true);
  });
});
