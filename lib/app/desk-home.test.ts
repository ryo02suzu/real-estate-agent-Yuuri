import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TODS, todOfSun } from "./desk";
import { HOME_CORNERS, HOME_FADE_MS, homeFadeMs, homeImage, homeLightsCredit, nextHomeStep } from "./desk-home";
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

describe("PC のホームの背景：時間帯の絵", () => {
  it("上の帯の時間帯ごとの絵。「夕」は dusk の絵。明かりの入った絵は夕と夜だけ", () => {
    expect(TODS.map((t) => homeImage(t).key)).toEqual(["morning", "day", "dusk", "night"]);
    expect(TODS.map((t) => homeImage(t).lights)).toEqual([false, false, true, true]);
  });

  it("4枚とも public/home にあり、同じ四隅（メルカトルで横・縦の比が四隅の範囲と同じ）", () => {
    const [[w, n], [e], [, s]] = HOME_CORNERS;
    expect(HOME_CORNERS[1][1]).toBe(n);
    expect(HOME_CORNERS[3]).toEqual([w, s]);
    const ratio = (e - w) / 360 / (mercY(s) - mercY(n));
    for (const t of TODS) {
      const { url } = homeImage(t);
      expect(url).toMatch(/^\/home\/desk-japan(-(morning|day|dusk|night))?\.webp$/);
      const file = join(process.cwd(), "public", url);
      expect(existsSync(file), url).toBe(true);
      const [iw, ih] = webpSize(readFileSync(file));
      expect(Math.abs(iw / ih / ratio - 1), `${url} ${iw}×${ih}`).toBeLessThan(0.005);
    }
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
