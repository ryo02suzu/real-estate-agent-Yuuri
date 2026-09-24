// 自治体が使っている Web GIS ごとの「座標付きURL」の作り方。
// どれも実機で「その地点が中心に開く」ことを確かめた形式（未確認のものはデータ側で verified:false）。
type Build = (lat: number, lng: number) => string;

/**
 * wagmap（www2.wagmap.jp）。gprj=2 を付けると mpx/mpy を世界測地系(WGS84)の経度・緯度として受け取り、
 * サーバが地図の測地系へ変換する。付けないと地図の測地系（旧日本測地系が多い）のまま解釈され約450mずれる。
 * gprj=3（JGD2000）は厚木・小田原・茅ヶ崎などで無視されるため使わない（全地図の変換結果を確認済み）。
 */
export const wagmap =
  (slug: string, mid: number): Build =>
  (lat, lng) =>
    `https://www2.wagmap.jp/${slug}/Map?mid=${mid}&mpx=${lng.toFixed(6)}&mpy=${lat.toFixed(6)}&mps=1000&gprj=2`;

/** Sonicweb（sonicweb-asp.jp）。世界測地系、pos=経度,緯度。layers は最初から表示するレイヤ（例: "dm%2Cth_5"） */
export const sonicweb =
  (slug: string, theme: string, scale = 1000, layers?: string): Build =>
  (lat, lng) =>
    `https://www.sonicweb-asp.jp/${slug}/map?theme=${theme}&pos=${lng.toFixed(6)}%2C${lat.toFixed(6)}&scale=${scale}${layers ? `&layers=${layers}` : ""}`;

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

/** geocloud 新版（https://<市>.geocloud.jp/mp/<地図ID>、戸田市の e-toda.kukanjoho.jp も同じ）。?z=&ll=緯度,経度 */
export const geocloudMp =
  (host: string, mapId: number): Build =>
  (lat, lng) =>
    `https://${host}/mp/${mapId}?z=18&ll=${lat.toFixed(6)},${lng.toFixed(6)}`;

/** ArcGIS Experience Builder。#<地図ウィジェットID>=center:経度,緯度,4326,scale:n */
export const arcgisExperience =
  (appId: string, mapWidget: string, scale = 2500): Build =>
  (lat, lng) =>
    `https://experience.arcgis.com/experience/${appId}#${mapWidget}=center:${lng.toFixed(6)},${lat.toFixed(6)},4326,scale:${scale}`;
