# ROAD-SNAP

住所を入れると、その市の公式「建築基準法上の道路」図を該当地点で開くツール（埼玉県・人口上位22市に対応）。

## 動かす

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # ロジックのユニットテスト
npm run build    # 静的サイトを out/ に書き出す（Vercel 等にそのまま置ける）
```

## 構成

| パス | 中身 |
|---|---|
| `lib/roadmap/` | コアロジック。`lookup(address)` を呼ぶだけで、地図URL・公開レベル・問い合わせ先が返る |
| `lib/roadmap/municipalities.ts` | 市ごとのデータ。市を増やすときはここに追記 |
| `app/page.tsx` | 動作確認用の仮画面。本番UIに差し替える |
| `docs/features.md` | UIの機能要件 |
| `docs/saitama-research.md` | 市ごとの調査結果と出典 |

## UIを差し替えるとき

`app/page.tsx` を置き換え、`@/lib/roadmap` の `lookup` を呼ぶ。戻り値は `status` で3分岐する:

```ts
const r = await lookup("埼玉県越谷市越ヶ谷4-2-1");
if (r.status === "ok") {
  r.matchedAddress;          // 国土地理院が解釈した住所
  r.municipality.coverage;   // "full" | "partial" | "none"
  r.links;                   // [{ label, url, kind, pinpoint }]
  r.municipality.contact;    // { dept, phone, email, hours, note }
} else if (r.status === "unsupported") {
  // 未対応の市町村
} else {
  // not_found: 住所が見つからない
}
```

住所は国土地理院APIにブラウザから直接送る（自前サーバーなし）。
