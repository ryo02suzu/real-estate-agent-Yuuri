import { describe, expect, it } from "vitest";
import { linkTexts } from "../roadmap/link-texts";
import { buildLinks, findMunicipality } from "../roadmap/municipalities";
import { PHONE_COPY_HINT, roadGuide, roadSheetTexts } from "./road-guide";

// スマホの「道路」タブには、地図の開き方（市のページのどこを押すか）が出ていなかった（PC だけ）。
// 入口のページを開く市では、開いたあとの道順が分からないと地図にたどり着けない
describe("スマホの「道路」タブの、地図の開き方（lib/app/road-guide.ts）", () => {
  const links = (code: string, lat: number, lng: number) => buildLinks(findMunicipality(code)!, lat, lng);

  it("入口のページを開く市は、どの地図にも開き方が出る（姫路市：市のページから地図の中の道順）", () => {
    const g = roadGuide(links("28201", 34.8154, 134.6853));
    expect(g.map((x) => x.label)).toEqual(["姫路市Webマップ 指定道路（建築基準法上の道路種別。姫路市のページから開く）", "姫路市Webマップ 道路台帳図・路線網図（姫路市のページから開く）"]);
    expect(g[0].what).toBe("地図の入口が開きます");
    expect(g[0].tip).toMatch(/「都市計画・土地利用」の「指定道路（建築基準法上の道路種別）」を選んで/);
    expect(g[0].url).toBe("https://www.city.himeji.lg.jp/sangyo/0000013652.html");
  });

  it("トップページを開く市（宇治市）は、トップページからの道順が出る", () => {
    const g = roadGuide(links("26204", 34.8844, 135.7997));
    expect(g).toHaveLength(1);
    expect(g[0].url).toBe("https://www.city.uji.kyoto.jp/");
    expect(g[0].tip).toMatch(/確認申請の手続きについて/);
  });

  it("物件の場所がそのまま開いて、開いたあとの操作が要らない地図は入れない（さいたま市）。同意が要る地図は入れる（尼崎市の市道の地図）", () => {
    const saitama = links("11107", 35.8617, 139.6455);
    expect(saitama.some((l) => l.pinpoint && !l.tip)).toBe(true);
    for (const x of roadGuide(saitama)) expect(saitama.find((l) => l.url === x.url)?.tip ?? "").not.toBe("");
    const amagasaki = roadGuide(links("28202", 34.7335, 135.4065));
    expect(amagasaki[1].what).toBe("物件の場所が開きます");
    expect(amagasaki[1].tip).toMatch(/読んで自分で同意する/);
  });

  it("開き方の文が無い入口だけの地図は、スマホの「住所をコピー」を使う案内になる（PC の「住所コピー」ではない）", () => {
    const entrance = { kind: "road_type" as const, label: "入口だけの地図", url: "https://example.lg.jp/map", pinpoint: false, verified: true };
    expect(roadGuide([entrance])).toEqual([{ label: "入口だけの地図", url: "https://example.lg.jp/map", what: "地図の入口が開きます", tip: PHONE_COPY_HINT }]);
    expect(PHONE_COPY_HINT).toContain("「住所をコピー」");
    // PC の文は今までどおり
    expect(linkTexts(entrance).tip).toBe("上の「住所コピー」を押し、地図の住所検索に貼り付けてください。");
  });

  it("近畿で登録した市（調査中・非公開・区域外を除く）は、道路種別の地図に開き方がある", () => {
    for (const code of ["25201", "25202", "25204", "26204", "29205", "30201", "28201", "28202", "28203", "28204", "28206", "28207", "28210", "28214", "28216", "28217", "28219"]) {
      const m = findMunicipality(code)!;
      const g = roadGuide(buildLinks(m, 34.8, 135.5));
      expect(g.length, m.name).toBeGreaterThan(0);
      expect(g[0].tip.length, m.name).toBeGreaterThan(20);
    }
  });
  // 茨木市などの「非公開」の市で、くわしい話のシートに「市町村の地図を開いて確認してください」と出ていた（開ける地図が無い）
  it("開ける道路種別の地図が無い市町村では、「地図を開いて確認」と言わず、窓口で確かめるよう書く（roadSheetTexts）", () => {
    const ibaraki = roadSheetTexts(links("27211", 34.8164, 135.5686), "茨木市"); // 地図なし（窓口の端末で見る市）
    expect(ibaraki.heading).toBe("茨木市の道路の調べ方の注意");
    expect(ibaraki.unread).toBe("この市町村は、MICHILU から開ける道路種別の地図がありません。道路の種別は、道路のタブの問い合わせ先（窓口）で確かめてください。");
    expect(ibaraki.lead).toBe("前面道路の種別と幅員は、現地と窓口で確かめてください。");
    const takatsuki = roadSheetTexts(links("27207", 34.8461, 135.6173), "高槻市"); // 市道の参考の地図だけ
    expect(takatsuki.heading).toBe("高槻市の地図の開き方と注意");
    expect(takatsuki.unread).toMatch(/MICHILU から開ける道路種別の地図がありません/);
    expect(takatsuki.lead).not.toMatch(/地図に色の無い道/);
    const moriguchi = roadSheetTexts(links("27209", 34.7377, 135.5641), "守口市"); // 道路種別の地図がある
    expect(moriguchi.heading).toBe("守口市の地図の開き方と注意");
    expect(moriguchi.unread).toBe("この市町村は、地図の道路の種別を MICHILU で読めません。道路のタブから市町村の地図を開いて確認してください。");
    expect(moriguchi.lead).toMatch(/^地図に色の無い道は載っていません。/);
    // 位置指定道路だけの図（designated_only）も「道路種別の地図がある」に数える。調査中の市町村（地図なし）は窓口へ
    const pending = roadSheetTexts([], "調査中の町");
    expect(pending.unread).toMatch(/窓口）で確かめてください/);
  });
});
