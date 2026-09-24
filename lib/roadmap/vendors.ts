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
 * alandis（webgis.alandis.jp）。地図URL機能の形式: x,y は EPSG:3857 のメートル
 * base 例: "https://webgis.alandis.jp/hanno11/210"、user はマップ種別（例: shitei）
 */
export const alandis =
  (base: string, user: string, scale = 1000): Build =>
  (lat, lng) => {
    const { x, y } = toWebMercator(lat, lng);
    return `${base}/webgis/index.php/autologin_jswebgis?ap=jsWebGIS&m=2&u=${user}&x=${x.toFixed(3)}&y=${y.toFixed(3)}&s=${scale}&rs=3857`;
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

/** geocloud（*.geocloud.jp/webgis）。?ll=緯度,経度&z= */
export const geocloud =
  (host: string, mp: number, extra = ""): Build =>
  (lat, lng) =>
    `https://${host}/webgis/?z=18&ll=${lat.toFixed(6)}%2C${lng.toFixed(6)}&t=roadmap&mp=${mp}${extra}`;

/** ArcGIS Experience Builder。#<地図ウィジェットID>=center:経度,緯度,4326,scale:n */
export const arcgisExperience =
  (appId: string, mapWidget: string, scale = 2500): Build =>
  (lat, lng) =>
    `https://experience.arcgis.com/experience/${appId}#${mapWidget}=center:${lng.toFixed(6)},${lat.toFixed(6)},4326,scale:${scale}`;
