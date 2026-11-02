import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HOME_PARTS, homePhoto, HOME_TOP } from "./home-photos";
import { SKY_HEAD_SCRIPT } from "./sky-vars";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

/** webp の RIFF の中の塊の名前と、絵の大きさ（VP8 の頭から） */
function webpInfo(file: string): { chunks: string[]; width: number; height: number } {
  const b = readFileSync(file);
  expect(b.toString("ascii", 0, 4)).toBe("RIFF");
  expect(b.toString("ascii", 8, 12)).toBe("WEBP");
  const chunks: string[] = [];
  let width = 0;
  let height = 0;
  for (let p = 12; p + 8 <= b.length; ) {
    const id = b.toString("ascii", p, p + 4);
    const len = b.readUInt32LE(p + 4);
    chunks.push(id);
    if (id === "VP8 ") {
      // 非可逆の webp：フレームの頭（3 バイト）と開始の印（3 バイト）のあとに、幅・高さ（下 14 ビット）
      width = b.readUInt16LE(p + 8 + 6) & 0x3fff;
      height = b.readUInt16LE(p + 8 + 8) & 0x3fff;
    }
    p += 8 + len + (len & 1);
  }
  return { chunks, width, height };
}

describe("ホームの背景の写真（時間帯で 5 枚）", () => {
  it("5 枚とも public にあり、941×1672 の webp で、写真の情報（EXIF・XMP など）は入っていない", () => {
    expect(HOME_PARTS).toEqual(["morning", "day", "evening", "dusk", "night"]);
    for (const p of HOME_PARTS) {
      const file = join(process.cwd(), "public", homePhoto(p));
      expect(existsSync(file)).toBe(true);
      const info = webpInfo(file);
      expect(info.chunks).toEqual(["VP8 "]);
      expect([info.width, info.height]).toEqual([941, 1672]);
    }
  });

  it("app/globals.css は、時間帯ごとに同じ写真を出し、読み込みの途中の時刻・電池の帯の色は HOME_TOP と同じ", () => {
    for (const p of HOME_PARTS) {
      const photo = css.match(new RegExp(`\\.home-photo\\[data-part="${p}"\\] \\{\\s*background-image:[^;]*url\\("([^"]+)"\\);`));
      expect(photo?.[1]).toBe(homePhoto(p));
      expect(css).toContain(`html[data-home="${p}"] .home-photo:not([data-part]),\n  .home-photo[data-part="${p}"] {`);
      const body = css.match(new RegExp(`html\\[data-home="${p}"\\] body \\{\\s*background-color: (#[0-9a-f]{6});`));
      expect(body?.[1]).toBe(HOME_TOP[p]);
      // 写真の上の端は、帯の色のもとの空の色からなじませる（帯の色 = 空の色に、上の暗いぼかし rgba(8,18,40,0.3) を重ねた色）
      const fade = css.match(new RegExp(`\\.home-photo\\[data-part="${p}"\\] \\{\\s*background-image: linear-gradient\\(180deg, rgb\\((\\d+), (\\d+), (\\d+)\\) 0,`));
      expect(fade).toBeTruthy();
      const top = [1, 3, 5].map((i) => parseInt(HOME_TOP[p].slice(i, i + 2), 16));
      const mixed = [0, 1, 2].map((i) => Number(fade![i + 1]) * 0.7 + [8, 18, 40][i] * 0.3);
      for (let i = 0; i < 3; i++) expect(Math.abs(mixed[i] - top[i])).toBeLessThanOrEqual(1.5);
    }
  });

  it("<head> の計算（SKY_HEAD_SCRIPT）が先に読み始める写真も同じ場所", () => {
    expect(SKY_HEAD_SCRIPT).toContain('hi.src="/home/"+hp+".webp"');
    expect(homePhoto("night")).toBe("/home/night.webp");
  });
});
