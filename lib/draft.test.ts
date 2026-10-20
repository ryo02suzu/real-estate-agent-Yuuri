import { describe, expect, it } from "vitest";
import { buildDraft, draftText, DRAFT_NOTE } from "./draft";
import { buildLinks, findMunicipality } from "./roadmap";
import { HAZARDS } from "./roadmap/hazard";
import { parcelCreditLine } from "./roadmap/kozu-data";
import type { Zoning, ZoningStatus } from "./roadmap/zoning";

const m = findMunicipality("13101")!;
const base = {
  status: "ok" as const,
  lat: 35.6895,
  lng: 139.7441,
  matchedAddress: "東京都千代田区三番町",
  town: "三番町",
  approximate: false,
  municipality: m,
  links: buildLinks(m, 35.6895, 139.7441),
};
const zoning: Zoning = {
  youto: [{ name: "第一種住居地域", code: 5, bcr: 60, far: 400 }],
  youtoNear: [],
  senbiki: "市街化区域",
  tokei: true,
  jyuntoshi: false,
  bouka: "準防火地域",
  koudoti: true,
  others: [{ layer: "chikukei", label: "地区計画", name: "番町地区地区計画" }],
};
const st: ZoningStatus = { city: "千代田区", asOf: "2024年", layers: { senbiki: 1, youto: 1, bouka: 1, koudoti: 1, chikukei: 1, tokei: 1 } };

describe("重説・物件概要の下書き", () => {
  it("都市計画・道路・災害を書類の欄の並びにし、要確認の印と出典を付ける", () => {
    const flood = HAZARDS.flood.layers[0];
    const draft = buildDraft(
      {
        ...base,
        parcel: { kuiki: "千代田区_三番町___", chiban: "2-1", chibanRaw: "2-1", pieces: [], point: { lat: 35.6895, lng: 139.7441 } },
      },
      {
        zoning: {
          zoning,
          st,
          morido: {
            area: { kind: "宅地造成等工事規制区域", city: "13101", level: "A", notice: "東京都告示第852号", since: "2024-07-31" },
            authority: "東京都",
            link: { label: "東京都の盛土規制法の地図", url: "https://www2.wagmap.jp/tokyo_tokeizu/Map?mid=4" },
          },
          hourei: {
            pref: "13",
            hits: [{ kind: "急傾斜地崩壊危険区域", name: "三番町1丁目", pref: "13", notice: "第605号", since: "2005-04-06" }],
            missing: [],
          },
          tochi: { park: "特別地域", year: 2015 },
        },
        parcels: { target: "千代田区三番町 2-1", neighbors: ["千代田区三番町 2-2", "千代田区三番町 3"], reference: false },
        roads: [{ label: "法第42条第1項第1号道路", short: "1項1号", direction: "北", distance: 4.2, width: "6.0m" } as never],
        hazard: {
          report: { flood: { status: "ok", hits: [{ layer: flood, at: flood.classes.find((c) => c.label === "0.5〜3m") }] }, dosha: { status: "ok", hits: [] } },
          elevation: { value: 25.3, source: "5mメッシュ（航空レーザ測量）" },
          maps: { flood: "https://example.jp/hm.html", naisui: "https://example.jp/hm.html" },
          muniCd: "13101",
        },
      },
    );
    const titles = draft.map((s) => s.title);
    expect(titles[0]).toBe("物件の表示");
    expect(titles).toContain("都市計画法・建築基準法に基づく制限（参考）");
    expect(titles).toContain("その他の法令に基づく制限（参考）");
    const text = draftText(draft, new Date(2026, 9, 12));
    expect(text.startsWith("【重説・物件概要の下書き（MICHILU・2026年10月12日）】")).toBe(true);
    expect(text).toContain("所在（地番）：千代田区三番町 2-1");
    expect(text).toContain("隣地の地番：千代田区三番町 2-2、千代田区三番町 3");
    expect(text).toContain("区域区分：市街化区域");
    expect(text).toContain("用途地域：第一種住居地域");
    expect(text).toContain("建ぺい率：60%（指定）");
    expect(text).toContain("容積率：400%（指定）（前面道路の幅による制限・角地の緩和は含まない）");
    expect(text).toContain("防火・準防火：準防火地域");
    expect(text).toContain("地区計画：番町地区地区計画");
    expect(text).toContain(
      "宅地造成及び特定盛土等規制法：宅地造成等工事規制区域（国のデータ・参考）（東京都が指定（東京都告示第852号・2024年7月31日から）。国のデータ（2025年7月18日時点）の概略の区域で、法的図書ではありません。重要事項説明には東京都（盛土規制法の担当課）の資料で確かめてください）【要確認】",
    );
    expect(text).toContain("盛土規制法の確認先：東京都の盛土規制法の地図（https://www2.wagmap.jp/tokyo_tokeizu/Map?mid=4）");
    // 国土数値情報のデータの出典は1つの文にまとめる
    expect(text).toContain(
      "国土数値情報の出典：「国土数値情報」（国土交通省、https://nlftp.mlit.go.jp/ksj/）を加工して作成（盛土規制法：宅地造成等工事規制区域・特定盛土等規制区域データ（2025年7月18日時点）／砂防指定地など：砂防指定地データ・地すべり防止区域データ・急傾斜地崩壊危険区域データ・災害危険区域データ",
    );
    // 砂防指定地・急傾斜地などは区域内・区域外とも国のデータの参考。東京都が求める特記事項は出典の欄に、どちらの区域の文かを添えて
    expect(text).toContain(
      "急傾斜地法（急傾斜地崩壊危険区域）：区域内（国のデータ・参考）（三番町1丁目（第605号・2005年4月6日）。国のデータ（2021年度）の概略の区域。重要事項説明には東京都（砂防の担当）の資料で確認）【要確認】",
    );
    expect(text).toContain("東京都の区域のデータについて：（急傾斜地）提供しているデータは、令和2年6月5日現在のもので");
    expect(text).toContain("お問合せをお願いします。（地すべり）平成29年5月19日現在のもので");
    // 区域外の種類は1つの欄にまとめる
    expect(text).toContain(
      "地すべり等防止法・砂防法（地すべり防止区域・砂防指定地）：区域外（国のデータ・参考）（2021年度・平成30年3月末時点の国のデータではどれも区域外。概略の区域で、重要事項説明には東京都（砂防・農林の担当）で確認）【要確認】",
    );
    // 自然公園法・農振法・森林法（2015年度の国のデータ。区域外の2つは1つの欄）
    expect(text).toContain("自然公園法：自然公園の特別地域（国のデータ・参考）（2015年度・縮尺約1/5万の国のデータ。");
    expect(text).toContain("自然公園は都県の担当で確認）【要確認】");
    expect(text).toContain(
      "農業振興地域の整備に関する法律・森林法：区域外（国のデータ・参考）（2015年度の国のデータ（縮尺約1/5万の概略）では農業振興地域・森林地域の外）【要確認】",
    );
    expect(text).toContain("自然公園・農振・森林：自然公園地域データ・農業地域データ・森林地域データ（2015年度）");
    expect(text).toContain("建築基準法39条（災害危険区域）：区域外（国のデータ・参考）（2021年度の国のデータでは区域外。概略の区域で、重要事項説明には東京都・千代田区（建築の担当）で確認）【要確認】");

    expect(text).toContain("北の道路（約4m）：法第42条第1項第1号道路・幅員 6.0m【要確認】");
    expect(text).toContain("■ハザードマップ（重要事項説明で所在地を示す市区町村の地図）\n洪水・内水：千代田区のハザードマップ（https://example.jp/hm.html）");
    expect(text).toContain("■災害リスク（国のデータ・参考）\n洪水（想定最大規模）：浸水 0.5〜3m");
    expect(text).toMatch(/\n大規模盛土造成地：国の重ねるハザードマップで確認（https:\/\/disaportal\.gsi\.go\.jp\/maps\/\?ll=[\d.]+,[\d.]+&z=16&base=pale&ls=daikiboumoritsuzouseichi_multi%2C0\.8&disp=1&vs=c1j0l0u0t0h0z0）\n/);
    expect(text).toContain("\n液状化の発生傾向：国の重ねるハザードマップで確認（https://disaportal.gsi.go.jp/maps/?ll=");
    // 路線価（全国地価マップを物件の場所で開く）
    expect(text).toMatch(/\n相続税路線価：全国地価マップで確認（令和\d+年分）（https:\/\/www\.chikamap\.jp\/chikamap\/Map\?mid=3\d\d&mpx=[\d.]+&mpy=[\d.]+&mps=1500&gprj=2）\n固定資産税路線価：全国地価マップで確認（令和\d+年度）（https:\/\/www\.chikamap\.jp\//);
    expect(text).toContain("用途地域・建ぺい率・容積率：第一種住居地域／建ぺい率60%／容積率400%");
    expect(text).toContain("■出典");
    expect(text.endsWith(DRAFT_NOTE)).toBe(true);
    // 判断の言葉は出さない
    expect(text).not.toMatch(/再建築(可|不可)|建築可能|接道義務を満たす/);
  });

  it("最寄り駅は物件概要の「交通」に、広告の書き方で並べる（要確認・出典付き）", () => {
    const text = draftText(
      buildDraft(base, {
        stations: [
          { name: "半蔵門", lines: [["半蔵門線", "東京メトロ"]], meters: 778, minutes: 10, straight: 603, routed: true },
          { name: "九段下", lines: [["東西線", "東京メトロ"], ["新宿線", "都営"]], meters: 826, minutes: 11, straight: 649, routed: true },
          { name: "石原", lines: [["秩父本線", "秩父鉄道"]], meters: 3956, minutes: 50, straight: 3956, routed: false },
        ],
      }),
    );
    expect(text).toContain("交通：東京メトロ半蔵門線「半蔵門」駅 徒歩約10分（道路距離 約780m・駅の出入口までではない目安）【要確認】");
    expect(text).toContain("交通：東京メトロ東西線・都営新宿線「九段下」駅 徒歩約11分");
    expect(text).toContain("交通：秩父鉄道秩父本線「石原」駅 直線約4.0km（歩いて行ける範囲に駅なし・直線距離）【要確認】");
    expect(text).toContain("駅の出典：「国土数値情報（鉄道データ）」");
  });

  it("市町村が地番図を公開していれば、物件の表示に地番の参考図の URL を入れる", () => {
    const kumagaya = findMunicipality("11202")!;
    const text = draftText(buildDraft({ ...base, lat: 36.153221, lng: 139.392611, municipality: kumagaya, links: buildLinks(kumagaya, 36.153221, 139.392611) }));
    expect(text).toContain(
      "地番の参考図：熊谷市の地番情報（https://www2.wagmap.jp/kumagaya/Map?mid=260&mpx=139.392611&mpy=36.153221&mps=1000&gprj=2）（市町村が公開している地番の参考図。登記の地番・筆の形と違うことがあるので、謄本・公図で確認）",
    );
    expect(draftText(buildDraft(base))).not.toContain("地番の参考図");
  });

  it("国土数値情報の出典が2つ以上なら1つの文にまとめる（時点の入れ子のかっこ・あとの文も残す）", () => {
    const land = { kind: "公示" as const, no: "千代田-1", point: [139.7448, 35.6901] as [number, number], price: 4_410_000, change: 11.4, usage: "住宅地" as const, year: 2026, history: [], distance: 92, bearing: "北東" };
    const station = { name: "半蔵門", lines: [["半蔵門線", "東京メトロ"]] as [string, string][], meters: 778, minutes: 10, straight: 603, routed: true };
    const text = draftText(buildDraft(base, { landPrice: [land], stations: [station] }));
    const line = text.split("\n").find((l) => l.startsWith("国土数値情報の出典："))!;
    expect(line).toMatch(/^国土数値情報の出典：「国土数値情報」（国土交通省、https:\/\/nlftp\.mlit\.go\.jp\/ksj\/）を加工して作成（地価：地価公示データ・都道府県地価調査データ（.+）／駅：鉄道データ（\d{4}年））。道のりは/);
    expect(text).not.toContain("駅の出典：");
  });

  it("データの無い欄は「要確認」と確かめる先", () => {
    const text = draftText(buildDraft({ ...base, approximate: true }));
    expect(text).toContain("所在（住所）：東京都千代田区三番町 付近（番地まで見つからず、町の中心の位置）【要確認】");
    expect(text).toContain("所在（地番）：要確認（登記・公図で確認）");
    expect(text).toContain("用途地域など：要確認");
    expect(text).toContain("宅地造成及び特定盛土等規制法：要確認（区域を指定した都県・市（盛土規制法の担当課）で確認）");
    expect(text).toContain("急傾斜地法（急傾斜地崩壊危険区域）：要確認（区域を指定した都県・市で確認）");
    // 埋蔵文化財は都市計画が読めなくても、確かめる窓口と遺跡地図を出す（千代田区は都の地図。地点では開けない）
    expect(text).toContain("文化財保護法（埋蔵文化財包蔵地）：要確認（包蔵地（遺跡）に入るかは千代田区の教育委員会（文化財の担当）で確認）");
    expect(text).toContain("遺跡地図：東京都遺跡地図（https://tokyo-iseki.metro.tokyo.lg.jp/）");
    // 上下水道・ガスは、台帳の地図が無くても確かめる先を出す
    expect(text).toContain("■飲用水・ガス・排水施設（参考）");
    expect(text).toContain("飲用水（上水道）：要確認（前面道路の配水管・口径・引込み管の有無は、水道事業者（市区町村の水道局など）で確認）");
    expect(text).toContain("ガス：要確認（都市ガスかプロパンガスか、前面道路のガス管の有無はガス会社で確認）");
    expect(text).not.toContain("下水道の台帳：");
    expect(text).toContain("道路の種別・幅員：要確認（市の道路種別の地図・窓口で確認）");
    expect(text).toContain("ハザードマップ：要確認");
    expect(text).not.toContain("■出典");
  });

  it("公図から推定した筆は、推定の印とずれの目安を添える", () => {
    const text = draftText(
      buildDraft({
        ...base,
        parcel: { kuiki: "横浜市港北区_大豆戸町___", chiban: "589-1", chibanRaw: "589-1", pieces: [], point: { lat: 35.51, lng: 139.62 }, estimated: "low" },
      }),
    );
    expect(text).toContain("所在（地番）：横浜市港北区大豆戸町 589-1（推定・確度低）（公図から推定した位置（確度が低く、5m前後ずれることあり））【要確認】");
    expect(text).toContain("国土地理院の基盤地図情報（道路縁）に合わせて MICHILU が推定の位置に置いたもので、数mずれることがあります。どちらも法務局の証明ではありません");
    expect(text).toContain("■出典\n筆の出典：「登記所備付地図データ」（法務省）");
  });
});

describe("筆の出典", () => {
  it("地番参考図・推定の筆があれば、1つの文に市町村の出典と注意を足す", () => {
    expect(parcelCreditLine(false)).toMatch(/^筆の出典：「登記所備付地図データ」（法務省）.+を加工して作成（.+）。法務局の証明ではありません$/);
    const s = parcelCreditLine(false, "13229");
    expect(s).toContain("。地番参考図の筆は西東京市「地番図」（CC BY 4.0・");
    expect(s).toContain("課税用の参考図のため登記の地番・筆の形と違うことがあります。どちらも法務局の証明ではありません");
    expect(parcelCreditLine(true, "13229")).toMatch(/数mずれることがあります。どれも法務局の証明ではありません$/);
  });
});
