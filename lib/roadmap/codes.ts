// 市区町村コード（国土地理院の逆ジオコーダの muniCd）の扱い

// 政令市（さいたま・千葉・横浜・川崎・相模原）の市のコード。区のコードの頭3桁が同じで、区のコード以下のうち最も大きいもの
const DESIGNATED = ["11100", "12100", "14100", "14130", "14150"];

/** 政令市の区のコード（14131 など）→ 市のコード（14130）。政令市でなければそのまま。国の一覧の多くは政令市を市で1つにしている */
export function cityCode(muniCd: string): string {
  return DESIGNATED.filter((d) => d.slice(0, 3) === muniCd.slice(0, 3) && d <= muniCd).pop() ?? muniCd;
}
