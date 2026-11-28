import { describe, expect, it } from "vitest";
import { buildLinks, findMunicipality, resolveContact } from "@/lib/roadmap";
import type { Neighbor, Parcel } from "@/lib/roadmap/parcel";
import type { ParcelInfo } from "../parcel-card";
import { copyHasLot, copyText } from "../result-view";
import { parcelStatus } from "./status";

type OkParcel = Extract<ParcelInfo, { status: "ok" }>;

const K = "渋谷区_神南_１丁目__";
const parcel = (chibanRaw: string, more: Partial<Parcel> = {}): Parcel => ({ kuiki: K, chiban: chibanRaw, chibanRaw, pieces: [], point: { lat: 35.6629, lng: 139.6994 }, ...more });
const near = (n: number): Neighbor[] => Array.from({ length: n }, (_, i) => ({ kuiki: K, chiban: `${i + 100}-1` }));
const info = (chibanRaw: string, kind: OkParcel["kind"], n = 3): OkParcel => ({ status: "ok", parcel: parcel(chibanRaw), kind, neighbors: near(n) });

describe("調査の状況の「地番・土地」の行（2026-11-28）", () => {
  it("地図データの印の付いた地番（「51-3W2」）は出さず、登記の地番で書く", () => {
    const s = parcelStatus(info("51-3W2", "address"));
    expect(s.value).toBe("地番 51-3（住所の地点の筆・参考）");
    expect(s.value).not.toContain("W2");
    expect(parcelStatus(info("100V1", "chiban")).value).toBe("地番 100（地番で探した筆）");
  });

  it("「取得済み」は物件の筆（地番で探した筆・地図で選んだ地点の筆）だけ。住所の地点の筆は「参考・要確認」", () => {
    expect(parcelStatus(info("34-1", "chiban"))).toMatchObject({ status: "auto", chip: "取得済み", value: "地番 34-1（地番で探した筆）" });
    expect(parcelStatus(info("39-7", "picked"))).toMatchObject({ status: "auto", chip: "取得済み", value: "地番 39-7（地図で選んだ地点の筆）" });
    const ref = parcelStatus(info("51-3", "address"));
    expect(ref).toMatchObject({ status: "unconfirmed", chip: "参考・要確認" });
    expect(ref.hint).toContain("公図で物件の筆を確認");
  });

  it("隣地のとても多い筆（道路など物件の外の土地の可能性）は「未確認」で、場所の直し方を案内する", () => {
    const s = parcelStatus(info("51-3W2", "address", 166));
    expect(s).toMatchObject({ status: "unconfirmed", chip: "未確認" });
    expect(s.value).toBe("住所の地点の筆は地番 51-3。隣地が166筆あり、道路など物件の外の土地の可能性");
    expect(s.hint).toContain("場所を直す");
  });

  it("地番の無い土地（道路・水路・筆界未定地）は地番のように書かず「未確認」", () => {
    const road = parcelStatus(info("道-5", "address"));
    expect(road).toMatchObject({ status: "unconfirmed", chip: "未確認", value: "住所の地点の筆は道路（地番なし）" });
    expect(road.hint).toContain("場所を直す");
    expect(parcelStatus(info("水-154", "picked")).value).toBe("地図で選んだ地点の筆は水路（地番なし）");
    const und = parcelStatus(info("筆界未定地-1", "picked"));
    expect(und).toMatchObject({ status: "unconfirmed", chip: "未確認", value: "地図で選んだ地点の筆は筆界未定地" });
    expect(und.hint).toContain("法務局の公図");
  });
});

describe("住所のコピー（2026-11-28）", () => {
  const m = findMunicipality("13113")!;
  const base = {
    status: "ok" as const,
    lat: 35.6629,
    lng: 139.6994,
    matchedAddress: "東京都渋谷区神南一丁目１９番１１号",
    town: "神南一丁目",
    approximate: false,
    municipality: m,
    links: buildLinks(m, 35.6629, 139.6994),
    contact: resolveContact(m, "13113"),
  };

  it("数字は見出しと同じ半角で写す。住所で調べたときは住所だけ（地番は付けない）", () => {
    expect(copyHasLot(base)).toBe(false);
    expect(copyText(base)).toBe("東京都渋谷区神南一丁目19番11号");
  });

  it("地番で探した筆は登記の地番まで写す。地図で選んだ地点は住所だけ", () => {
    const lot = { ...base, matchedAddress: "東京都渋谷区神南一丁目", parcel: parcel("51-3W2") };
    expect(copyHasLot(lot)).toBe(true);
    expect(copyText(lot)).toBe("東京都渋谷区神南一丁目51-3");
    const picked = { ...lot, picked: true as const };
    expect(copyHasLot(picked)).toBe(false);
    expect(copyText(picked)).toBe("東京都渋谷区神南一丁目");
    expect(copyHasLot({ ...base, parcel: parcel("道-5") })).toBe(false);
  });
});
