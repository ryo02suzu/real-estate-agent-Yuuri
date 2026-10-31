// 地理院タイル（淡色・標準）の低ズームの配信を、本物のタイルで確かめる。ネットにつなぐので TILE_CHECK=1 のときだけ（npm run check-tiles）。
// スマホの日本地図（components/japan-map.tsx）は、z4 のタイルが読めなければ標準地図・北海道〜九州だけの表示に切り替える（lib/japan-basemap.ts）。
// この結果（ログ）で、どの背景になるかが分かる。z4 以下が読めないことはテストの失敗にしない（アプリが代わりに切り替える）
import { describe, expect, it } from "vitest";
import { GSI_PALE_URL, GSI_STD_URL, probeTile, tileUrl } from "./japan-basemap";

const LAYERS = [
  ["淡色", GSI_PALE_URL],
  ["標準", GSI_STD_URL],
] as const;

/**
 * ブラウザの地図（別のサイトからの読み込み）と同じく Origin を付けて取得する。付けないと配信元は CORS の許可（Access-Control-Allow-Origin）を
 * 返さないことがあり、「CORS なし」と誤って出る。値は架空のサイト名（住所や座標は送らない）
 */
const ORIGIN = "https://michilu.example";

describe.skipIf(!process.env.TILE_CHECK)("地理院タイルの低ズーム（本物のタイル）", () => {
  for (const [name, template] of LAYERS) {
    for (const z of [2, 3, 4, 5]) {
      it(`${name} z${z}（東京駅付近のタイル）`, { timeout: 30_000 }, async () => {
        const url = tileUrl(template, probeTile(z));
        const res = await fetch(url, { headers: { Origin: ORIGIN } });
        const type = res.headers.get("content-type");
        const cors = res.headers.get("access-control-allow-origin");
        console.log(`${name} z${z}: ${res.status} ${type} CORS=${cors} ${url}`);
        // 既存の PC の地図が頼る z5 以上は、読めて、地図が fetch で読むための CORS 許可があること
        if (z >= 5) {
          expect(res.status).toBe(200);
          expect(type).toContain("image/");
          expect(cors).toBeTruthy();
        }
      });
    }
  }
});
