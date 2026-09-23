"use client";

// 動作確認用の仮画面。デザインは後で差し替える前提で、機能要件（docs/features.md）の必須項目だけ満たす。
import { useState } from "react";
import { lookup, type LookupResult, type Municipality, type ResolvedLink } from "@/lib/roadmap";

const COVERAGE_TEXT: Record<Municipality["coverage"], { label: string; className: string }> = {
  full: { label: "ネットで全種別が分かります", className: "bg-green-100 text-green-900" },
  partial: { label: "一部だけ公開（位置指定道路など）。載っていなければ窓口で確認", className: "bg-yellow-100 text-yellow-900" },
  none: { label: "ネットでは分かりません。問い合わせてください", className: "bg-red-100 text-red-900" },
};

export default function Home() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await lookup(address.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "検索に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 p-4 space-y-4">
      <h1 className="text-xl font-bold">ROAD-SNAP</h1>

      <form onSubmit={onSearch} className="flex gap-2">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="例: 埼玉県越谷市越ヶ谷4-2-1"
          className="flex-1 rounded border px-3 py-2 text-base"
        />
        <button disabled={loading} className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">
          {loading ? "検索中…" : "検索"}
        </button>
      </form>

      {error && <p className="text-red-700">{error}</p>}
      {result && <Result result={result} />}

      <p className="pt-4 text-xs opacity-70">
        表示される地図は参考情報です。重要事項説明などの最終確認は、必ず役所の窓口で行ってください。
      </p>
    </main>
  );
}

function Result({ result }: { result: LookupResult }) {
  if (result.status === "not_found") {
    return <p>住所が見つかりませんでした。市区町村名から入力してください。</p>;
  }
  if (result.status === "unsupported") {
    const q = encodeURIComponent(`${result.matchedAddress.replace(/^埼玉県/, "").match(/^.+?[市町村]/)?.[0] ?? ""} 指定道路図`);
    return (
      <div className="space-y-2">
        <p>{result.matchedAddress} 付近</p>
        <p>この市町村はまだ未対応です。</p>
        <a className="underline" href={`https://www.google.com/search?q=${q}`} target="_blank" rel="noreferrer">
          Googleで指定道路図を探す
        </a>
      </div>
    );
  }

  const { municipality: m, links } = result;
  const contact = m.contact;
  const coverage = COVERAGE_TEXT[m.coverage];
  const primary = links.filter((l) => l.kind !== "public_road");
  const secondary = links.filter((l) => l.kind === "public_road");
  const contactBlock = contact && (
    <div className="rounded border p-3 space-y-1">
      <p className="font-bold">{contact.dept}</p>
      {contact.phone && <a className="block underline" href={`tel:${contact.phone.split(/[（(/]/)[0].trim()}`}>{contact.phone}</a>}
      {contact.email && <a className="block underline" href={`mailto:${contact.email}`}>{contact.email}</a>}
      {contact.hours && <p className="text-sm">{contact.hours}</p>}
      {contact.note && <p className="text-sm font-bold text-red-700">⚠ {contact.note}</p>}
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm">
        {result.matchedAddress} 付近（{result.town}）
      </p>
      <p className="font-bold">{m.name}</p>
      <p className={`rounded p-2 text-sm ${coverage.className}`}>{coverage.label}</p>
      {m.note && <p className="text-sm opacity-80">{m.note}</p>}

      {m.coverage === "none" && contactBlock}

      <div className="space-y-2">
        {primary.map((l) => (
          <LinkButton key={l.url} link={l} big />
        ))}
        {secondary.map((l) => (
          <LinkButton key={l.url} link={l} />
        ))}
      </div>
      {links.some((l) => l.pinpoint) && (
        <p className="text-xs opacity-70">最初に利用規約の同意画面が出ます。同意すると、該当地点が画面中央の十字の位置に表示されます。</p>
      )}

      {m.coverage !== "none" && contactBlock}
    </div>
  );
}

function LinkButton({ link, big }: { link: ResolvedLink; big?: boolean }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className={`block rounded border px-3 ${big ? "bg-foreground py-3 text-background font-bold" : "py-2"}`}
    >
      {link.label}
      <span className="block text-xs font-normal opacity-80">
        {link.pinpoint ? "該当地点が開きます" : "地図の入口が開きます（地図内で住所を検索してください）"}
      </span>
    </a>
  );
}
