import { describe, expect, it } from "vitest";
import { ISEKI_CITIES, isekiFor, isekiLine, isekiNote } from "./iseki";
import { MUNICIPALITIES } from "./municipalities";

const at = (pref: string, name: string, lat: number, lng: number) => isekiFor({ pref: pref as never, name }, lat, lng);

describe("埋蔵文化財の確認先", () => {
  it("埼玉・千葉・茨城・群馬は県の遺跡地図を物件の場所で開く", () => {
    const gyoda = at("埼玉県", "行田市", 36.1286, 139.4797);
    expect(gyoda.office).toBe("行田市の教育委員会（文化財の担当）");
    expect(gyoda.map).toMatchObject({ name: "埼玉県 埋蔵文化財包蔵地マップ", at: true });
    expect(gyoda.map?.url).toBe(
      "https://experience.arcgis.com/experience/6920299bacac4156a4b4240b2e420691/#widget_34=center:139.479700%2C36.128600%2C4326,scale:2500",
    );
    expect(at("千葉県", "千葉市", 35.6237, 140.164).map?.url).toBe(
      "https://map.pref.chiba.lg.jp/pref-chiba/Map?mid=30&mpx=140.164000&mpy=35.623700&mps=2500&gprj=2",
    );
    expect(at("茨城県", "水戸市", 36.3658, 140.4714).map?.url).toContain("https://www2.wagmap.jp/ibaraki/Map?mid=34&");
    expect(at("群馬県", "高崎市", 36.3221, 139.0032).map?.url).toContain("https://www2.wagmap.jp/pref-gunma/Map?mid=1601&");
  });

  it("川越市は埼玉県の地図に載っていないので、教育委員会で確かめる", () => {
    const k = at("埼玉県", "川越市", 35.925, 139.4858);
    expect(k.map).toBeUndefined();
    expect(isekiNote(k)).toBe("川越市の包蔵地は埼玉県の地図に載っていません。包蔵地（遺跡）に入るかは川越市の教育委員会で確認");
  });

  it("東京都は区市の地図があれば物件の場所で、無ければ都の遺跡地図の入口を開く", () => {
    expect(at("東京都", "世田谷区", 35.6464, 139.6533).map).toMatchObject({
      url: "https://www.sonicweb-asp.jp/setagaya/map?theme=th_58&pos=139.653300%2C35.646400&scale=2500",
      at: true,
    });
    const chiyoda = at("東京都", "千代田区", 35.6895, 139.7441);
    expect(chiyoda.map).toMatchObject({ name: "東京都遺跡地図", url: "https://tokyo-iseki.metro.tokyo.lg.jp/", at: false });
    expect(isekiLine(chiyoda)).toBe("東京都遺跡地図で確認");
    // 町田市は「その他の土地規制」の地図を、遺跡のレイヤだけにして開く
    expect(at("東京都", "町田市", 35.5658, 139.4426).map?.url).toBe(
      "https://machida.kukanjoho.jp/webgis/?mp=53&vlf=53-36-000160&z=16&ll=35.565800%2C139.442600",
    );
  });

  it("渋谷区・中野区・板橋区は区の地図の埋蔵文化財のレイヤを、都の遺跡地図より優先して開く", () => {
    expect(at("東京都", "渋谷区", 35.663475, 139.697189).map).toEqual({
      name: "渋谷区地図情報システム（文化マップ・埋蔵文化財）",
      url: "https://www2.wagmap.jp/shibuya/Map?mid=1105&mpx=139.697189&mpy=35.663475&mps=2500&gprj=2&mtl=143%2C144",
      at: true,
      tip: "利用規約に同意すると開きます",
    });
    expect(at("東京都", "中野区", 35.709118, 139.662613).map?.url).toBe(
      "https://www2.wagmap.jp/nakanodatamap/Map?mid=33&mpx=139.662613&mpy=35.709118&mps=2500&gprj=2&mtl=6000780",
    );
    // 板橋区の遺跡のレイヤは z15 以上で出る。同意の画面は無い
    const itabashi = at("東京都", "板橋区", 35.750694, 139.709503);
    expect(itabashi.map).toEqual({
      name: "どこナビいたばし（板橋区遺跡分布地図）",
      url: "https://itabashi.machi-info.jp/?map_id=100028&lt=35.750694&lg=139.709503&z=17",
      at: true,
      tip: undefined,
    });
    expect(isekiNote(itabashi)).toBe("包蔵地（遺跡）に入るかは板橋区の教育委員会で確認");
  });

  it("神奈川・栃木は見つかった市の地図だけ。無い市は教育委員会", () => {
    expect(at("神奈川県", "相模原市", 35.5715, 139.373).map?.url).toBe("https://sagamihara.geocloud.jp/webgis/?mp=13&z=15&ll=35.571500%2C139.373000");
    expect(at("神奈川県", "横浜市", 35.5146, 139.6218).map?.url).toBe(
      "https://wwwm.city.yokohama.lg.jp/yokohama/Map?mid=9&mpx=139.621800&mpy=35.514600&mps=2500&gprj=2",
    );
    const atsugi = at("神奈川県", "厚木市", 35.4433, 139.3625);
    expect(atsugi.map).toBeUndefined();
    expect(isekiLine(atsugi)).toBe("厚木市の教育委員会（文化財の担当）で確認");
    expect(isekiNote(atsugi)).toBe("包蔵地（遺跡）に入るかは厚木市の教育委員会で確認");
    expect(at("栃木県", "足利市", 36.3404, 139.4497).map?.url).toContain("https://www.sonicweb-asp.jp/ashikaga/map?theme=th_30&");
    expect(at("栃木県", "宇都宮市", 36.5551, 139.8828).map).toBeUndefined();
  });

  it("川崎・横須賀・大和・那須塩原は、市の地図の埋蔵文化財のレイヤを物件の場所で開く", () => {
    // 川崎市は「その他の土地規制」の地図を、地形図と埋蔵文化財の2つのレイヤだけにして開く
    const kawasaki = at("神奈川県", "川崎市", 35.530712, 139.703003);
    expect(kawasaki.map?.url).toBe("https://kawasaki.geocloud.jp/webgis/?mp=27&vlf=27-219-060024000000000000&z=17&ll=35.530712%2C139.703003");
    expect(isekiNote(kawasaki)).toBe("利用規約に同意すると開きます。包蔵地（遺跡）に入るかは川崎市の教育委員会で確認");
    expect(at("神奈川県", "横須賀市", 35.281387, 139.672134).map?.url).toBe(
      "https://www2.wagmap.jp/yokosuka/Map?mid=4&mpx=139.672134&mpy=35.281387&mps=2500&gprj=2&mtl=79&mcl=2790%2C790%2C0%2C0%3B2790%2C791%2C1%2C1",
    );
    // 大和市（machi-info 旧版）は日本測地系に換算した座標で開く（大和市役所。世界測地系のままだと約450mずれる）
    expect(at("神奈川県", "大和市", 35.487579, 139.458206).map?.url).toBe(
      "https://www.machi-info.jp/machikado/yamato_city/consentpage/gis-buried-cultural.html?mode=100&lon=139.461381&lat=35.484337&scale=2500",
    );
    expect(at("栃木県", "那須塩原市", 36.962711, 140.044891).map).toMatchObject({
      name: "なすしおばらまっぷ（文化財・遺跡）",
      url: "https://maps.city.nasushiobara.tochigi.jp/#/?center=140.044891%2F36.962711&zoom=16&baseMap=gsi&layers=R20NxZw1D",
      at: true,
    });
    expect(isekiLine(at("栃木県", "那須塩原市", 36.962711, 140.044891))).toBe("なすしおばらまっぷ（文化財・遺跡）で確認（物件の場所で開く）");
  });

  it("画面の補足：開くときの操作と窓口", () => {
    expect(isekiNote(at("埼玉県", "行田市", 36.1286, 139.4797))).toBe(
      "利用条件に同意すると開きます。包蔵地（遺跡）に入るかは行田市の教育委員会で確認",
    );
    expect(isekiLine(at("群馬県", "前橋市", 36.3895, 139.0634))).toBe("マッピングぐんま（遺跡）で確認（物件の場所で開く）");
  });

  it("区市の地図の名前（都県名＋市区町村名）が、市区町村の一覧にある", () => {
    const names = new Set(MUNICIPALITIES.map((m) => `${m.pref}${m.name}`));
    for (const key of ISEKI_CITIES) expect(names, key).toContain(key);
  });
});
