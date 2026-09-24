// 自治体が使っている Web GIS ごとの「座標付きURL」の作り方。
// どれも実機で「その地点が中心に開く」ことを確かめた形式（未確認のものはデータ側で verified:false）。
type Build = (lat: number, lng: number) => string;

/**
 * wagmap（www2.wagmap.jp）。gprj=3 を付けると世界測地系(JGD2000/WGS84)の座標として解釈される。
 * 付けないと自治体ごとに旧日本測地系／世界測地系の解釈が違い、約450mずれる
 * （越谷・上尾・熊谷・川越・本庄・朝霞・鶴ヶ島・茂原・成田の市役所で gprj=3 の中心一致を確認済み）。
 */
export const wagmap =
  (slug: string, mid: number): Build =>
  (lat, lng) =>
    `https://www2.wagmap.jp/${slug}/Map?mid=${mid}&mpx=${lng.toFixed(6)}&mpy=${lat.toFixed(6)}&mps=1000&gprj=3`;

/** Sonicweb（sonicweb-asp.jp）。世界測地系、pos=経度,緯度 */
export const sonicweb =
  (slug: string, theme: string, scale = 1000): Build =>
  (lat, lng) =>
    `https://www.sonicweb-asp.jp/${slug}/map?theme=${theme}&pos=${lng.toFixed(6)}%2C${lat.toFixed(6)}&scale=${scale}`;

/** Webメルカトル（EPSG:3857）のメートル座標 */
export function toWebMercator(lat: number, lng: number): { x: number; y: number } {
  const R = 20037508.342789244;
  return {
    x: (lng * R) / 180,
    y: ((Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * R) / 180,
  };
}

/**
 * alandis（webgis.alandis.jp ほか）。地図の「地図URL」機能と同じ形式で、x,y は EPSG:3857 のメートル。
 * webgisBase 例: "https://webgis.alandis.jp/hanno11/210/webgis"、user はマップ種別（例: shitei, guest3）、
 * extra は表示レイヤ指定など（例: "&li=3&si=0"）
 */
export const alandis =
  (webgisBase: string, user: string, extra = "", scale = 1000): Build =>
  (lat, lng) => {
    const { x, y } = toWebMercator(lat, lng);
    return `${webgisBase}/index.php/autologin_jswebgis?ap=jsWebGIS&m=2&u=${user}&x=${x.toFixed(3)}&y=${y.toFixed(3)}&s=${scale}&rs=3857${extra}`;
  };

/** cloudgis（*.cloudgis.jp, gauandy）。?lon=&lat=&z= で世界測地系 */
export const cloudgis =
  (host: string, app: string, zoom = 18): Build =>
  (lat, lng) =>
    `https://${host}/${app}/?lon=${lng.toFixed(6)}&lat=${lat.toFixed(6)}&z=${zoom}`;

/** open-map.jp。#lat=&lng=&z=&layers=レイヤ名（同意ページが hash を地図へ引き継ぐ） */
export const openMap =
  (slug: string, layer: string, zoom = 18): Build =>
  (lat, lng) =>
    `https://open-map.jp/${slug}/index.html#lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}&z=${zoom}&layers=${encodeURIComponent(layer)}`;

/**
 * geocloud 旧版（…/webgis/?mp=…）。&ll=緯度,経度&z= で開く。
 * 自動ブラウザには 403 を返すため、確認は iPhone の User-Agent で行った（川口・市川）。
 */
export const geocloud =
  (webgisUrl: string, query: string): Build =>
  (lat, lng) =>
    `${webgisUrl}?${query}&z=18&ll=${lat.toFixed(6)}%2C${lng.toFixed(6)}`;

/** geocloud 新版（https://<市>.geocloud.jp/mp/<地図ID>）。?z=&ll=緯度,経度 */
export const geocloudMp =
  (host: string, mapId: number): Build =>
  (lat, lng) =>
    `https://${host}/mp/${mapId}?z=18&ll=${lat.toFixed(6)},${lng.toFixed(6)}`;

/** ArcGIS Experience Builder。#<地図ウィジェットID>=center:経度,緯度,4326,scale:n */
export const arcgisExperience =
  (appId: string, mapWidget: string, scale = 2500): Build =>
  (lat, lng) =>
    `https://experience.arcgis.com/experience/${appId}#${mapWidget}=center:${lng.toFixed(6)},${lat.toFixed(6)},4326,scale:${scale}`;
