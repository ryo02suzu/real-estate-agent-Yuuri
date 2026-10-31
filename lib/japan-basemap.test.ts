import { describe, expect, it } from "vitest";
import {
  cameraMove,
  distanceM,
  GSI_PALE_URL,
  GSI_STD_URL,
  JAPAN_BOUNDS,
  JAPAN_MAIN_BOUNDS,
  MAIN_ONLY_MIN_ZOOM,
  MAP_MIN_ZOOM,
  planBase,
  probeLowZoom,
  probeTile,
  PROBE_ZOOM,
  tileUrl,
} from "./japan-basemap";

describe("カメラの動かし方", () => {
  it("2点間の距離：同じ点は0、東京駅〜新宿駅は約6km", () => {
    expect(distanceM({ lat: 35.681, lng: 139.767 }, { lat: 35.681, lng: 139.767 })).toBe(0);
    const d = distanceM({ lat: 35.681, lng: 139.767 }, { lat: 35.69, lng: 139.7 });
    expect(d).toBeGreaterThan(5800);
    expect(d).toBeLessThan(6400);
  });

  it("引いた地図（日本全体など）からは常にそのまま寄る", () => {
    expect(cameraMove(3.4, 400_000)).toBe("ease");
    expect(cameraMove(7.9, 100_000)).toBe("ease");
  });

  it("寄った地図から近い所へはそのまま、遠い所へは引いてから寄る", () => {
    expect(cameraMove(16, 300)).toBe("ease");
    expect(cameraMove(16, 1500)).toBe("ease");
    expect(cameraMove(16, 1501)).toBe("fly");
    expect(cameraMove(12, 50_000)).toBe("fly");
  });
});

describe("日本地図の背景タイル", () => {
  it("確かめるタイルは東京駅付近を含む（z3=7/3、z4=14/6）", () => {
    expect(probeTile(3)).toEqual({ z: 3, x: 7, y: 3 });
    expect(probeTile(4)).toEqual({ z: 4, x: 14, y: 6 });
  });

  it("タイルのURLを組み立てる", () => {
    expect(tileUrl(GSI_PALE_URL, probeTile(4))).toBe("https://cyberjapandata.gsi.go.jp/xyz/pale/4/14/6.png");
    expect(tileUrl(GSI_STD_URL, probeTile(4))).toBe("https://cyberjapandata.gsi.go.jp/xyz/std/4/14/6.png");
  });

  it("最小ズームで読むタイルの段は、確かめる段と同じ（確かめていない段のタイルを読まない）", () => {
    // MapLibre の 256px ラスタタイルは floor(ズーム + 1) の段を読む
    expect(Math.floor(MAP_MIN_ZOOM + 1)).toBe(PROBE_ZOOM);
  });

  it("日本の主な島の範囲は、日本全体の範囲の内側にあり、z5 以上だけで見せられる大きさ", () => {
    const [[w, s], [e, n]] = JAPAN_BOUNDS;
    const [[mw, ms], [me, mn]] = JAPAN_MAIN_BOUNDS;
    expect(mw).toBeGreaterThanOrEqual(w);
    expect(ms).toBeGreaterThanOrEqual(s);
    expect(me).toBeLessThanOrEqual(e);
    expect(mn).toBeLessThanOrEqual(n);
    // 最小ズーム4（読むタイルは z5 以上）
    expect(Math.floor(MAIN_ONLY_MIN_ZOOM + 1)).toBeGreaterThanOrEqual(5);
  });

  it("背景の決め方：淡色が使えればそのまま、無ければ標準、どちらも無ければ主な島だけ", () => {
    expect(planBase({ pale: true, std: true })).toBe("pale");
    expect(planBase({ pale: true, std: false })).toBe("pale");
    expect(planBase({ pale: false, std: true })).toBe("std");
    expect(planBase({ pale: false, std: false })).toBe("main-only");
  });

  it("確認は固定の東京付近のタイルだけを淡色・標準の2か所に問い合わせる（住所や座標は使わない）", async () => {
    const asked: string[] = [];
    const r = await probeLowZoom(async (url) => {
      asked.push(url);
      return url.includes("/std/");
    });
    expect(asked.sort()).toEqual(["https://cyberjapandata.gsi.go.jp/xyz/pale/4/14/6.png", "https://cyberjapandata.gsi.go.jp/xyz/std/4/14/6.png"]);
    expect(r).toEqual({ pale: false, std: true });
  });

  it("確認中の通信エラー（例外）は「読めない」として扱い、止まらない", async () => {
    const r = await probeLowZoom(async () => {
      throw new Error("offline");
    });
    expect(r).toEqual({ pale: false, std: false });
    expect(planBase(r)).toBe("main-only");
  });
});
