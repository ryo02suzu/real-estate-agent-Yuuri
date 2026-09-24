# MICHILU（ミチル）

不動産のための道路情報チェック。住所を入れると、その市の公式「建築基準法上の道路」図を物件の場所で開きます（関東1都6県 全316市区町村に対応）。ネットで分からない市は問い合わせ先を案内します。

## 動かす

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # ロジックのユニットテスト
npm run check-links  # 全地図リンクが開けるか確認（ネット接続が必要。毎週 GitHub Actions でも実行）
npm run build    # 静的サイトを out/ に書き出す（Vercel 等にそのまま置ける）
```

## 構成

| パス | 中身 |
|---|---|
| `lib/roadmap/` | コアロジック。`lookup(address)` を呼ぶだけで、地図URL・公開レベル・問い合わせ先が返る |
| `lib/roadmap/data/` | 都道府県ごとの市町村データ。`vendors.ts` が地図システムごとのURL形式 |
| `app/page.tsx`, `components/` | 画面（ホーム・結果・使い方・対応市一覧） |
| `lib/history.ts` | 直近5件の検索履歴（端末の localStorage のみ） |
| `docs/features.md` | UIの機能要件 |
| `docs/saitama-research.md`, `docs/chiba-research.md`, `docs/kanagawa-research.md`, `docs/tokyo-research.md`, `docs/kanto-north-research.md` | 市区町村ごとの調査結果と出典 |

## ロジックの使い方

画面からは `@/lib/roadmap` の `lookup` を呼ぶ。戻り値は `status` で3分岐する:

```ts
const r = await lookup("埼玉県越谷市越ヶ谷4-2-1");
if (r.status === "ok") {
  r.matchedAddress;          // 国土地理院が解釈した住所
  r.municipality.coverage;   // "full" | "partial" | "none"
  r.links;                   // [{ label, url, kind, pinpoint }]
  r.municipality.contact;    // { dept, phone, email, hours, note, noPhoneInquiry }
} else if (r.status === "unsupported") {
  // 未対応の市町村
} else {
  // not_found: 住所が見つからない
}
```

`/?q=住所` で開くと、その住所を検索した状態で表示される（ホーム画面に追加したショートカットや共有に使える）。

住所は国土地理院APIにブラウザから直接送る（自前サーバーなし）。
