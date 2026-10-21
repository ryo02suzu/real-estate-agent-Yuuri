import { describe, expect, it } from "vitest";
import { CHIBANZU_CITIES, chibanzuFor } from "./chibanzu";
import { MUNICIPALITIES } from "./municipalities";

describe("市町村の地番図", () => {
  it("公開している市町村は、地番図を物件の場所で開く", () => {
    expect(chibanzuFor({ pref: "埼玉県", name: "熊谷市" }, 36.153221, 139.392611)).toEqual({
      name: "熊谷市の地番情報",
      url: "https://www2.wagmap.jp/kumagaya/Map?mid=260&mpx=139.392611&mpy=36.153221&mps=1000&gprj=2",
    });
    expect(chibanzuFor({ pref: "群馬県", name: "高崎市" }, 36.327316, 139.007265)?.url).toBe(
      "https://www.sonicweb-asp.jp/takasaki2/map?theme=th_66&pos=139.007265%2C36.327316&scale=1000",
    );
    expect(chibanzuFor({ pref: "神奈川県", name: "相模原市" }, 35.577388, 139.377337)?.url).toBe(
      "https://sagamihara.geocloud.jp/webgis/?mp=101&z=18&ll=35.577388%2C139.377337",
    );
    expect(chibanzuFor({ pref: "埼玉県", name: "上里町" }, 36.255698, 139.147852)).toEqual({
      name: "上里町の参考地番図",
      url: "https://www.sonicweb-asp.jp/kamisato/map?theme=th_2&pos=139.147852%2C36.255698&scale=1000",
    });
  });

  it("地番図が見つかっていない市区町村は無し", () => {
    expect(chibanzuFor({ pref: "東京都", name: "千代田区" }, 35.6895, 139.7441)).toBeUndefined();
  });

  it("地番図を書いた市町村（都県名＋市区町村名）が、市区町村の一覧にある", () => {
    const names = new Set(MUNICIPALITIES.map((m) => `${m.pref}${m.name}`));
    for (const key of CHIBANZU_CITIES) expect(names, key).toContain(key);
  });
});
