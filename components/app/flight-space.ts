// 検索したときの「地球から土地までズーム」の、宇宙の背景と先読み（軽い部品だけ。地図の部品は components/app/globe-flight.tsx で、
// 使うときに読む）。宇宙の背景は components/app/mobile-app.tsx が押した瞬間に出し、その上に地球の地図が重なる

/** 遠くの地球の絵（NASA GIBS の Blue Marble。地形と海底の陰影つき。ズーム 8 まで） */
export const NASA_TILES =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";

/** 宇宙（中ほどが少し明るい紺から黒へ）と星（決まった並び。毎回同じ空） */
export const SPACE_BACKGROUND = (() => {
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const dots: string[] = [];
  for (let i = 0; i < 70; i++) {
    const size = rnd() < 0.85 ? 1 : 1.6;
    const a = (0.35 + rnd() * 0.65).toFixed(2);
    dots.push(`radial-gradient(${size}px ${size}px at ${(rnd() * 100).toFixed(1)}% ${(rnd() * 100).toFixed(1)}%, rgba(255,255,255,${a}) 50%, transparent 51%)`);
  }
  dots.push("radial-gradient(130% 90% at 50% 45%, #0d1b3d 0%, #050a18 55%, #010207 100%)");
  return dots.join(",");
})();

/** はじめに見える地球の絵（ズーム 1〜2 のアジア・太平洋のあたり）。ホームを開いている間に読んでおく */
const FIRST_TILES: [number, number, number][] = [
  [1, 1, 0],
  [1, 1, 1],
  [1, 0, 0],
  [1, 0, 1],
  [2, 3, 1],
  [2, 3, 2],
  [2, 2, 1],
  [2, 2, 2],
];

/** 地図を描く裏方（ワーカー）のファイル。public/maplibre/<版>/ にある（scripts/copy-maplibre-worker.mjs）。版は package.json の maplibre-gl と同じ */
const WORKER_FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

let warmed = false;
/** 地球の演出の部品・地図の裏方のファイル（約 0.5MB。はじめて飛ぶときの待ちのいちばん大きいところ）・はじめに見える地球の絵を、
 *  先に読んでおく（1回だけ。端末に残るので、飛ぶときは読み直さずに済む） */
export function prefetchFlight(): void {
  if (warmed) return;
  warmed = true;
  void import("./globe-flight").then(({ MAPLIBRE_VERSION }) => {
    for (const f of WORKER_FILES) void fetch(`/maplibre/${MAPLIBRE_VERSION}/${f}`).catch(() => {});
  });
  for (const [z, x, y] of FIRST_TILES) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = NASA_TILES.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
  }
}
