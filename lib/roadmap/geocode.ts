// 国土地理院の無料API（APIキー不要・保存制限なし）で住所→座標→市区町村コードを引く。
// 住所をサーバーに送らないよう、ブラウザから直接呼ぶ想定。

export type GeocodeResult = {
  lat: number;
  lng: number;
  /** 国土地理院が解釈した住所（入力とズレていないか画面で確認する用） */
  matchedAddress: string;
};

export async function geocode(address: string): Promise<GeocodeResult | null> {
  const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`住所検索に失敗しました (${res.status})`);
  const items: Array<{ geometry: { coordinates: [number, number] }; properties: { title: string } }> =
    await res.json();
  const hit = items[0];
  if (!hit) return null;
  const [lng, lat] = hit.geometry.coordinates;
  return { lat, lng, matchedAddress: hit.properties.title };
}

export type ReverseResult = {
  /** 市区町村コード（例: 熊谷市 = "11202"、さいたま市大宮区 = "11103"） */
  muniCd: string;
  /** 町丁目名（例: "宮町二丁目"） */
  town: string;
};

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseResult | null> {
  const url = `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`市区町村の判定に失敗しました (${res.status})`);
  const body: { results?: { muniCd: string; lv01Nm: string } } = await res.json();
  if (!body.results) return null;
  return { muniCd: body.results.muniCd, town: body.results.lv01Nm };
}
