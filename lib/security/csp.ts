// 通信先の制限（Content-Security-Policy）。vercel.json のヘッダーの値はここから作る（lib/security/csp.test.ts が食い違いを見つける。
// 直すときは UPDATE_CSP=1 npx vitest run lib/security/csp.test.ts で vercel.json に書き込む）。
// ねらい：
//  - アプリが自分から通信する相手を、公的なデータの配り元と自分のデータ置き場だけに限る（住所・座標がほかへ送られない歯止め。
//    もし外から悪いスクリプトを入れられても、よそへは送れない）。
//  - よそのサイトのスクリプト・枠（iframe）・プラグインを読み込ませない。
// 外部のサイトを新しいタブで開くリンク（市の地図など）は、通信先の制限の対象ではない（利用者が押して開くもの）。
// スクリプトの 'unsafe-inline' は、静的サイトとして書き出した Next.js が最初の表示に使う埋め込みスクリプトのために要る
// （ページごとの合言葉（nonce）はサーバーが無いと付けられない）。eval は許さない（WebAssembly だけ許す：3D の Draco の復号）。

/** アプリが自分から読みに行く相手（データ・地図タイル・画像）。新しい相手を足したら、ここに理由つきで足す */
export const DATA_HOSTS: { host: string; why: string }[] = [
  { host: "https://*.gsi.go.jp", why: "国土地理院：地図タイル・住所検索・逆ジオコーダ・重ねるハザードマップ・避難場所・地図の文字" },
  { host: "https://www.jma.go.jp", why: "気象庁：天気・ひまわりの雲・雨雲レーダー" },
  { host: "https://gibs.earthdata.nasa.gov", why: "NASA GIBS：地球から降りる演出の衛星画像" },
  { host: "https://*.r2.dev", why: "MICHILU のデータ置き場（Cloudflare R2 の公開バケット）：地番・建物・取引事例などのタイル" },
  { host: "https://assets.cms.plateau.reearth.io", why: "国土交通省 PLATEAU：3D の街" },
  { host: "https://tile.googleapis.com", why: "Google の実写 3D タイル（鍵を設定したときだけ使う）" },
  { host: "https://*.arcgis.com", why: "市の道路種別の公開データ（ArcGIS Online のフィーチャレイヤ）" },
  { host: "https://tokei-gis2.chiyodatoshikei.jp", why: "千代田区の道路種別の公開データ" },
];

/** host が allow（「https://*.example.jp」の形も可）に入るか */
export function hostAllowed(origin: string, allow: string[] = DATA_HOSTS.map((h) => h.host)): boolean {
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  return allow.some((a) => {
    const m = /^https:\/\/(\*\.)?([a-z0-9.-]+)$/.exec(a);
    if (!m) return false;
    return m[1] ? u.hostname.endsWith(`.${m[2]}`) : u.hostname === m[2];
  });
}

/** Content-Security-Policy の値 */
export function contentSecurityPolicy(): string {
  const hosts = DATA_HOSTS.map((h) => h.host).join(" ");
  const directives: [string, string][] = [
    ["default-src", "'self'"],
    // 埋め込みスクリプトは Next.js の最初の表示用。blob: は 3D（Draco）の復号ワーカー
    ["script-src", "'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:"],
    ["style-src", "'self' 'unsafe-inline'"],
    // 地図のタイルは画像としても読む。data:・blob: は端末の中で作った絵（写真メモ・書き出し・3D の模様）
    ["img-src", `'self' data: blob: ${hosts}`],
    ["font-src", "'self' data:"],
    ["connect-src", `'self' blob: data: ${hosts}`],
    ["worker-src", "'self' blob:"],
    ["child-src", "'self' blob:"],
    ["media-src", "'self' blob: data:"],
    ["manifest-src", "'self'"],
    ["frame-src", "'none'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
  ];
  return directives.map(([k, v]) => `${k} ${v}`).join("; ");
}
