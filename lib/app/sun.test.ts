import { describe, expect, it } from "vitest";
import { blend, BASE, HOME_CAMERA, light, overrideTime, projectSun, solar } from "./sun";

// 国立天文台「こよみの計算」東京（35.6581, 139.7414）2026年の日の出入り・南中（分と 0.1° に丸めた値）
const NAOJ = { lat: 35.6581, lng: 139.7414, utcOffset: 540 };
const ROWS: [string, string, number, string, number, string, number][] = [
  // 日付, 日の出, 方位, 南中, 高度, 日の入り, 方位
  ["2026-03-20", "05:45", 89.8, "11:49", 54.2, "17:52", 270.5],
  ["2026-06-21", "04:25", 60.0, "11:43", 77.8, "19:00", 300.0],
  ["2026-09-23", "05:29", 89.3, "11:34", 54.3, "17:37", 270.4],
  ["2026-12-22", "06:47", 118.6, "11:39", 30.9, "16:32", 241.4],
];
const jst = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+09:00`);
const secDiff = (a: Date | null, b: Date) => Math.abs((a?.getTime() ?? 0) - b.getTime()) / 1000;

describe("solar（天体計算）", () => {
  it("日の出・南中・日の入りが国立天文台の暦と 60 秒以内で一致する", () => {
    for (const [ymd, sr, , noon, , ss] of ROWS) {
      const s = solar(jst(ymd, "12:00"), NAOJ);
      expect(secDiff(s.times.sunrise, jst(ymd, sr))).toBeLessThanOrEqual(60);
      expect(secDiff(s.times.solarNoon, jst(ymd, noon))).toBeLessThanOrEqual(60);
      expect(secDiff(s.times.sunset, jst(ymd, ss))).toBeLessThanOrEqual(60);
    }
  });
  it("日の出入りの方位と南中高度が国立天文台の値と 0.2° 以内で一致する", () => {
    for (const [ymd, , srAz, , noonAlt, , ssAz] of ROWS) {
      const s = solar(jst(ymd, "12:00"), NAOJ);
      expect(Math.abs(solar(s.times.sunrise!, NAOJ).azimuth - srAz)).toBeLessThanOrEqual(0.2);
      expect(Math.abs(solar(s.times.sunset!, NAOJ).azimuth - ssAz)).toBeLessThanOrEqual(0.2);
      expect(Math.abs(solar(s.times.solarNoon, NAOJ).altitude - noonAlt)).toBeLessThanOrEqual(0.2);
    }
  });
  it("夏至は冬至より昼が長く、南中高度が高い", () => {
    const summer = solar(jst("2026-06-21", "12:00"));
    const winter = solar(jst("2026-12-22", "12:00"));
    const len = (s: typeof summer) => s.times.sunset!.getTime() - s.times.sunrise!.getTime();
    expect(len(summer)).toBeGreaterThan(len(winter) + 4 * 3600e3);
    expect(solar(summer.times.solarNoon).altitude).toBeGreaterThan(solar(winter.times.solarNoon).altitude + 40);
  });
  it("南中は 12 時ちょうどではなく、一年を通して 11:24〜11:56（日本時間）", () => {
    for (let k = 0; k < 365; k += 7) {
      const d = new Date(jst("2026-01-01", "12:00").getTime() + k * 86400e3);
      const noon = solar(d).times.solarNoon;
      const t = new Date(noon.getTime() + BASE.utcOffset * 60e3);
      const min = t.getUTCHours() * 60 + t.getUTCMinutes();
      expect(min).toBeGreaterThanOrEqual(11 * 60 + 24);
      expect(min).toBeLessThanOrEqual(11 * 60 + 56);
    }
  });
  it("23:50 に聞いても、その日の日の出を返す（日付の境目）", () => {
    const s = solar(jst("2026-12-22", "23:50"));
    const t = new Date(s.times.sunrise!.getTime() + BASE.utcOffset * 60e3);
    expect(t.toISOString().slice(0, 10)).toBe("2026-12-22");
  });
  it("朝は rising、午後は沈む", () => {
    expect(solar(jst("2026-06-21", "08:00")).rising).toBe(true);
    expect(solar(jst("2026-06-21", "16:00")).rising).toBe(false);
    expect(solar(jst("2026-06-21", "02:00")).rising).toBe(true);
  });
});

describe("blend（写真の混ぜ方）", () => {
  it("合計は常に 1 で、負にならない", () => {
    for (const rising of [true, false])
      for (let alt = -30; alt <= 90; alt += 0.5) {
        const b = blend(alt, rising);
        const sum = b.day + b.golden + b.twilight + b.night;
        expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
        for (const v of Object.values(b)) expect(v).toBeGreaterThanOrEqual(0);
      }
  });
  it("高度 +10° 以上は昼、−12° 以下は夜", () => {
    expect(blend(45, false).day).toBe(1);
    expect(blend(10, true).day).toBe(1);
    expect(blend(-18, false).night).toBe(1);
  });
  it("同じ高度でも朝と夕方で違う（夕方の絵は朝に使わない）", () => {
    const evening = blend(4, false);
    const morning = blend(4, true);
    expect(evening.golden).toBeGreaterThan(0);
    expect(morning.golden).toBe(0);
    expect(morning.twilight).toBeGreaterThan(0);
  });
  it("境界で連続している（0° と −6° の前後で飛ばない）", () => {
    for (const rising of [true, false])
      for (const edge of [0, -6, -12, 10]) {
        const a = blend(edge - 0.01, rising);
        const b = blend(edge + 0.01, rising);
        for (const k of Object.keys(a) as (keyof typeof a)[]) expect(Math.abs(a[k] - b[k])).toBeLessThan(0.02);
      }
  });
});

describe("light（コードで描く光）", () => {
  it("昼は紺の文字、夜は白の文字", () => {
    expect(light(45, false).dark).toBe(false);
    expect(light(-20, false).dark).toBe(true);
  });
  it("地平線の近くで光が強く、真昼と真夜中は弱い", () => {
    expect(light(-1, false).glow.strength).toBeGreaterThan(0.9);
    expect(light(45, false).glow.strength).toBeLessThan(0.01);
    expect(light(-25, false).glow.strength).toBeLessThan(0.01);
  });
  it("時刻の帯の色は #rrggbb", () => {
    expect(light(30, true).top).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("projectSun（画面の位置）", () => {
  it("カメラが未設定なら描かない", () => {
    expect(projectSun({ altitude: 10, azimuth: 270 }, HOME_CAMERA)).toBeNull();
  });
  it("設定後は、正面の地平線の太陽が画面の中央の地平線の位置に来る", () => {
    const cam = { ...HOME_CAMERA, calibrated: true, bearing: 270 };
    const p = projectSun({ altitude: 0, azimuth: 270 }, cam)!;
    expect(p.inside).toBe(true);
    expect(Math.abs(p.x - 0.5)).toBeLessThan(0.001);
    expect(Math.abs(p.y - cam.horizon)).toBeLessThan(0.001);
    // 右（北西寄り）の太陽は右に
    expect(projectSun({ altitude: 0, azimuth: 290 }, cam)!.x).toBeGreaterThan(0.5);
    // 画角の外と後ろ
    expect(projectSun({ altitude: 0, azimuth: 200 }, cam)!.inside).toBe(false);
    expect(projectSun({ altitude: 0, azimuth: 90 }, cam)).toBeNull();
  });
});

describe("overrideTime（プレビュー用の日時）", () => {
  it("#t=… を日本時間として読む", () => {
    expect(overrideTime("#t=2026-06-21T18:30")?.toISOString()).toBe("2026-06-21T09:30:00.000Z");
    expect(overrideTime("#q=x&t=2026-12-22")?.toISOString()).toBe("2026-12-22T03:00:00.000Z");
    expect(overrideTime("#t=2026-06-21T18:30Z")?.toISOString()).toBe("2026-06-21T18:30:00.000Z");
  });
  it("無ければ null", () => {
    expect(overrideTime("")).toBeNull();
    expect(overrideTime("#q=abc")).toBeNull();
    expect(overrideTime("#t=xyz")).toBeNull();
  });
});

describe("SKY_HEAD_SCRIPT（最初に描く前の簡単な計算）", () => {
  it("1年を通して、SunCalc で入れる変数とほぼ同じになる", async () => {
    const { SKY_HEAD_SCRIPT, skyValues } = await import("./sky-vars");
    const vm = await import("node:vm");
    let worst = 0;
    for (let k = 0; k < 365; k += 3)
      for (const hm of ["04:30", "05:30", "06:30", "09:00", "12:00", "15:30", "16:30", "17:30", "18:30", "19:30", "23:00"]) {
        const d = new Date(jst("2026-01-01", hm).getTime() + k * 86400e3);
        const store: Record<string, string> = {};
        const ctx = {
          location: { hash: `#t=${d.toISOString()}` },
          document: { documentElement: { style: { setProperty: (key: string, v: string) => (store[key] = v) }, dataset: {} as Record<string, string> } },
          Math,
          Date,
          isNaN,
          decodeURIComponent,
        };
        vm.runInNewContext(SKY_HEAD_SCRIPT, ctx);
        const ref = skyValues(d).vars;
        for (const key of ["--sky-day", "--sky-golden", "--sky-twilight", "--sky-night"]) worst = Math.max(worst, Math.abs(Number(store[key]) - Number(ref[key])));
        // 字を白にする境目（上端の明るさ 0.42）のすぐ近くでは、わずかな高度の差で結果が分かれてよい
        const top = ref["--sky-top"].match(/[0-9a-f]{2}/g)!.map((h) => parseInt(h, 16));
        const lum = (0.2126 * top[0] + 0.7152 * top[1] + 0.0722 * top[2]) / 255;
        if (Math.abs(lum - 0.42) > 0.03) expect(store["--sky-dark"]).toBe(ref["--sky-dark"]);
      }
    expect(worst).toBeLessThan(0.05);
  });
});
