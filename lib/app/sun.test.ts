import { describe, expect, it } from "vitest";
import { AFTERNOON_FROM, BASE, blend, dayPart, favPart, histPart, HOME_CAMERA, homePart, layerOpacity, light, MORNING_UNTIL, overrideTime, PHOTO_ORDER, projectSun, solar, SUNSET_AT } from "./sun";

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

describe("dayPart（書類・出力の写真の昼・夕方・夜）", () => {
  const at = (ymd: string, hm: string) => {
    const s = solar(jst(ymd, hm));
    return dayPart(s.altitude, s.rising);
  };
  it("11 月 1 日：昼・夕方（日の入り 16:46 の前後）・夜", () => {
    expect(at("2026-11-01", "05:30")).toBe("night");
    expect(at("2026-11-01", "06:00")).toBe("day");
    expect(at("2026-11-01", "12:00")).toBe("day");
    expect(at("2026-11-01", "16:00")).toBe("day");
    expect(at("2026-11-01", "16:30")).toBe("evening");
    expect(at("2026-11-01", "17:05")).toBe("evening");
    expect(at("2026-11-01", "17:30")).toBe("night");
    expect(at("2026-11-01", "23:59")).toBe("night");
    expect(at("2026-11-01", "00:30")).toBe("night");
  });
  it("季節で夕方の時刻が変わる（夏至は 18 時台、冬至は 16 時前から）", () => {
    expect(at("2026-06-21", "18:00")).toBe("day");
    expect(at("2026-06-21", "18:45")).toBe("evening");
    expect(at("2026-06-21", "19:20")).toBe("evening");
    expect(at("2026-06-21", "19:45")).toBe("night");
    expect(at("2026-06-21", "04:30")).toBe("day");
    expect(at("2026-12-22", "15:30")).toBe("day");
    expect(at("2026-12-22", "16:00")).toBe("evening");
    expect(at("2026-12-22", "17:10")).toBe("night");
    expect(at("2026-12-22", "06:20")).toBe("night");
  });
  it("朝の低い太陽は夕方にしない（昇るときは −3° から昼）", () => {
    expect(dayPart(2, true)).toBe("day");
    expect(dayPart(-2, true)).toBe("day");
    expect(dayPart(-4, true)).toBe("night");
    expect(dayPart(2, false)).toBe("evening");
    expect(dayPart(-5, false)).toBe("evening");
    expect(dayPart(-7, false)).toBe("night");
    expect(dayPart(30, false)).toBe("day");
  });
});

describe("favPart（お気に入りの写真の昼・昼と夕方のあいだ・夕方・夜）", () => {
  const at = (ymd: string, hm: string) => {
    const s = solar(jst(ymd, hm));
    return favPart(s.altitude, s.rising);
  };
  it("11 月 1 日：昼 → 15:16 から昼と夕方のあいだ → 16:12 から夕方 → 夜", () => {
    expect(at("2026-11-01", "07:00")).toBe("day");
    expect(at("2026-11-01", "12:00")).toBe("day");
    expect(at("2026-11-01", "15:10")).toBe("day");
    expect(at("2026-11-01", "15:20")).toBe("afternoon");
    expect(at("2026-11-01", "16:05")).toBe("afternoon");
    expect(at("2026-11-01", "16:20")).toBe("evening");
    expect(at("2026-11-01", "17:30")).toBe("night");
  });
  it("季節で時刻が変わる（夏至は 17 時半から、冬至は 15 時前から）", () => {
    expect(at("2026-06-21", "17:20")).toBe("day");
    expect(at("2026-06-21", "17:40")).toBe("afternoon");
    expect(at("2026-06-21", "18:30")).toBe("evening");
    expect(at("2026-12-22", "14:40")).toBe("day");
    expect(at("2026-12-22", "15:00")).toBe("afternoon");
    expect(at("2026-12-22", "16:00")).toBe("evening");
  });
  it("朝の低い太陽は昼のまま。夕方・夜の境目と、書類・出力の分け方（dayPart）は変わらない", () => {
    expect(favPart(10, true)).toBe("day");
    expect(favPart(AFTERNOON_FROM, false)).toBe("day");
    expect(favPart(AFTERNOON_FROM - 0.1, false)).toBe("afternoon");
    expect(favPart(6, false)).toBe("afternoon");
    expect(favPart(5.9, false)).toBe("evening");
    expect(favPart(-7, false)).toBe("night");
    expect(dayPart(10, false)).toBe("day");
  });
});

describe("histPart（履歴の写真の朝・昼・夕方・夜）", () => {
  const at = (ymd: string, hm: string) => {
    const s = solar(jst(ymd, hm));
    return histPart(s.altitude, s.rising);
  };
  it("11 月 1 日：夜 → 5:49 から朝 → 7:34 から昼 → 16:12 から夕方 → 17:15 から夜", () => {
    expect(at("2026-11-01", "05:40")).toBe("night");
    expect(at("2026-11-01", "05:55")).toBe("morning");
    expect(at("2026-11-01", "07:30")).toBe("morning");
    expect(at("2026-11-01", "07:40")).toBe("day");
    expect(at("2026-11-01", "16:20")).toBe("evening");
    expect(at("2026-11-01", "17:20")).toBe("night");
  });
  it("季節で朝の時刻が変わる（夏至は 4:11〜5:56、冬至は 6:33〜8:31）", () => {
    expect(at("2026-06-21", "04:05")).toBe("night");
    expect(at("2026-06-21", "04:20")).toBe("morning");
    expect(at("2026-06-21", "06:00")).toBe("day");
    expect(at("2026-12-22", "06:40")).toBe("morning");
    expect(at("2026-12-22", "08:25")).toBe("morning");
    expect(at("2026-12-22", "08:40")).toBe("day");
  });
  it("沈んでいく低い太陽は朝にしない。夕方・夜の境目は書類・出力（dayPart）と同じ", () => {
    expect(histPart(10, true)).toBe("morning");
    expect(histPart(MORNING_UNTIL, true)).toBe("day");
    expect(histPart(-2, true)).toBe("morning");
    expect(histPart(-4, true)).toBe("night");
    expect(histPart(10, false)).toBe("day");
    expect(histPart(5.9, false)).toBe("evening");
    expect(histPart(-7, false)).toBe("night");
  });
});

describe("homePart（ホームの写真の朝・昼・夕方・夕方と夜のあいだ・夜）", () => {
  const at = (ymd: string, hm: string) => {
    const s = solar(jst(ymd, hm));
    return homePart(s.altitude, s.rising);
  };
  it("11 月 1 日：夜 → 5:49 朝 → 7:34 昼 → 16:12 夕方 → 16:50 夕方と夜のあいだ → 17:15 夜", () => {
    expect(at("2026-11-01", "05:40")).toBe("night");
    expect(at("2026-11-01", "05:55")).toBe("morning");
    expect(at("2026-11-01", "07:40")).toBe("day");
    expect(at("2026-11-01", "16:20")).toBe("evening");
    expect(at("2026-11-01", "16:45")).toBe("evening");
    expect(at("2026-11-01", "16:55")).toBe("dusk");
    expect(at("2026-11-01", "17:10")).toBe("dusk");
    expect(at("2026-11-01", "17:20")).toBe("night");
  });
  it("季節で時刻が変わる（夏至は 夕方と夜のあいだ 19:04〜19:34、冬至は 16:36〜17:03）", () => {
    expect(at("2026-06-21", "19:00")).toBe("evening");
    expect(at("2026-06-21", "19:10")).toBe("dusk");
    expect(at("2026-06-21", "19:40")).toBe("night");
    expect(at("2026-12-22", "16:30")).toBe("evening");
    expect(at("2026-12-22", "16:40")).toBe("dusk");
    expect(at("2026-12-22", "17:05")).toBe("night");
  });
  it("太陽が沈みきる −1° までは夕方、そこから −6° までは夕方と夜のあいだ。朝・昼・夜の境目は履歴（histPart）と同じ", () => {
    expect(homePart(SUNSET_AT, false)).toBe("evening");
    expect(homePart(SUNSET_AT - 0.1, false)).toBe("dusk");
    expect(homePart(-5.9, false)).toBe("dusk");
    expect(homePart(-6.1, false)).toBe("night");
    // 昇るときは夕方と夜のあいだにしない（日の出前の薄明るい時間は、履歴と同じく夜から朝へ）
    expect(homePart(-2, true)).toBe("morning");
    expect(homePart(-4, true)).toBe("night");
    for (const rising of [true, false])
      for (let alt = -30; alt <= 90; alt += 0.25) {
        const h = homePart(alt, rising);
        const p = histPart(alt, rising);
        expect(h === "dusk" ? "evening" : h).toBe(p);
      }
  });
});

describe("blend（写真の混ぜ方）", () => {
  it("合計は常に 1 で、負にならない", () => {
    for (const rising of [true, false])
      for (let alt = -30; alt <= 90; alt += 0.5) {
        const b = blend(alt, rising);
        const sum = b.day + b.golden + b.twilight + b.dawn + b.night;
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
    expect(morning.twilight).toBe(0);
    expect(morning.dawn).toBeGreaterThan(0);
    // 夜明け前の薄明は dawn、夕方の薄明は twilight
    expect(blend(-3, true).dawn).toBeGreaterThan(0);
    expect(blend(-3, true).twilight).toBe(0);
    expect(blend(-3, false).twilight).toBeGreaterThan(0);
    expect(blend(-3, false).dawn).toBe(0);
  });
  it("重ねた写真の不透明度は、重みどおりの混色になる", () => {
    for (const rising of [true, false])
      for (let alt = -14; alt <= 12; alt += 0.7) {
        const b = blend(alt, rising);
        const o = layerOpacity(b);
        // 下から順に重ねたときの合成の重みを求め、blend の重みと比べる
        let acc = 0;
        const got: Record<string, number> = {};
        for (const k of PHOTO_ORDER) {
          for (const j of Object.keys(got)) got[j] *= 1 - o[k];
          got[k] = o[k];
          acc = acc * (1 - o[k]) + o[k];
        }
        for (const k of PHOTO_ORDER) expect(Math.abs(got[k] - b[k])).toBeLessThan(1e-9);
        expect(Math.abs(acc - 1)).toBeLessThan(1e-9);
      }
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
    expect(projectSun({ altitude: 10, azimuth: 270 }, { ...HOME_CAMERA, calibrated: false })).toBeNull();
  });
  it("ホームのカメラは西南西：冬至と春分の日の入は画面の中、夏至の日の入は右の端の外。地平線は上から 50.5%", () => {
    expect(projectSun({ altitude: 0, azimuth: 241.4 }, HOME_CAMERA)!.inside).toBe(true);
    expect(projectSun({ altitude: 0, azimuth: 270.5 }, HOME_CAMERA)!.inside).toBe(true);
    const june = projectSun({ altitude: 0, azimuth: 300 }, HOME_CAMERA)!;
    expect(june.inside).toBe(false);
    expect(june.x).toBeGreaterThan(1);
    expect(june.x).toBeLessThan(2);
    const ahead = projectSun({ altitude: 0, azimuth: 246 }, HOME_CAMERA)!;
    expect(Math.abs(ahead.y - 0.505189)).toBeLessThan(0.001);
    // 午後の高い太陽は画面の上の外
    expect(projectSun({ altitude: 40, azimuth: 262 }, HOME_CAMERA)!.inside).toBe(false);
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
    let worstColor = 0;
    // ホームの写真の時間帯が homePart と違った回数（0 のはず）と、比べた回数
    let homeMismatch = 0;
    let homeTotal = 0;
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
        // ホームの写真の時間帯（html の data-home）。境目（+16°・−3°・+6°・−1°・−6°）のすぐ近くでは、わずかな高度の差で分かれてよい
        const sv = solar(d);
        if ([MORNING_UNTIL, -3, 6, SUNSET_AT, -6].every((b) => Math.abs(sv.altitude - b) > 0.15)) {
          homeTotal++;
          if (ctx.document.documentElement.dataset.home !== homePart(sv.altitude, sv.rising)) homeMismatch++;
        }
        const ref = skyValues(d).vars;
        for (const key of ["--sky-day", "--sky-golden", "--sky-twilight", "--sky-dawn", "--sky-night", "--sky-l-night", "--sky-l-twilight", "--sky-l-dawn", "--sky-l-golden", "--sky-l-day", "--sky-lights"]) worst = Math.max(worst, Math.abs(Number(store[key]) - Number(ref[key])));
        // 帯の色（大気の式）は、太陽の位置のわずかな差で 1〜2 だけ違ってよい
        for (const key of ["--sky-top", "--sky-mid", "--sky-horizon"]) {
          const a = store[key].match(/[0-9a-f]{2}/g)!.map((h) => parseInt(h, 16));
          const b = ref[key].match(/[0-9a-f]{2}/g)!.map((h) => parseInt(h, 16));
          for (let i = 0; i < 3; i++) worstColor = Math.max(worstColor, Math.abs(a[i] - b[i]));
        }
        // 字を白にする境目（上端の明るさ 0.42）のすぐ近くでは、わずかな高度の差で結果が分かれてよい
        const top = ref["--sky-top"].match(/[0-9a-f]{2}/g)!.map((h) => parseInt(h, 16));
        const lum = (0.2126 * top[0] + 0.7152 * top[1] + 0.0722 * top[2]) / 255;
        if (Math.abs(lum - 0.42) > 0.03) expect(store["--sky-dark"]).toBe(ref["--sky-dark"]);
      }
    expect(worst).toBeLessThan(0.05);
    expect(worstColor).toBeLessThanOrEqual(3);
    expect(homeTotal).toBeGreaterThan(1000);
    expect(homeMismatch).toBe(0);
  }, 30000);
});
