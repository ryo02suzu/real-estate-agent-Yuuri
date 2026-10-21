"use client";

// 「地図アプリで開く」と「レポートを作成」の選択（下から出る）。地図アプリには物件の座標だけを渡す（押したときだけ。自前のサーバーは通さない）
import { ChevronRight, ClipboardCopy, Compass, Crosshair, ExternalLink, FileText, Map as MapIcon, Navigation, Printer, Route, ScrollText } from "lucide-react";
import type { ReactNode } from "react";
import { Sheet } from "../sheet";
import type { Ok } from "./use-property";

function Item({ icon, title, sub, href, onClick }: { icon: ReactNode; title: string; sub?: string; href?: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint text-brand">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold text-ink">{title}</span>
        {sub && <span className="mt-0.5 block text-[12px] leading-[1.5] text-muted">{sub}</span>}
      </span>
      {href ? <ExternalLink className="h-4 w-4 shrink-0 text-muted" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted" />}
    </>
  );
  const cls = "flex w-full items-center gap-3 py-3 text-left active:bg-mint/50";
  return (
    <li>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className={cls}>
          {body}
        </a>
      ) : (
        <button onClick={onClick} className={cls}>
          {body}
        </button>
      )}
    </li>
  );
}

export function MapAppsSheet({ result, open, onClose, onMichilu, onFix }: { result: Ok; open: boolean; onClose: () => void; onMichilu: () => void; onFix: () => void }) {
  if (!open) return null;
  const { lat, lng } = result;
  const ll = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const road = result.links.find((l) => l.kind !== "public_road") ?? result.links[0];
  return (
    <div className="theme-navy">
      <Sheet title="地図アプリで開く" open onClose={onClose}>
        <ul className="divide-y divide-line">
          <Item
            icon={<MapIcon className="h-[18px] w-[18px]" />}
            title="MICHILUの地図"
            sub="筆・用途地域・道路種別・ハザードを重ねて見る"
            onClick={() => {
              onClose();
              onMichilu();
            }}
          />
          <Item
            icon={<Crosshair className="h-[18px] w-[18px]" />}
            title="場所を直す"
            sub="ピンの場所が違うときは、地図で物件の場所を選び直す"
            onClick={() => {
              onClose();
              onFix();
            }}
          />
          {road && <Item icon={<Route className="h-[18px] w-[18px]" />} title={`${result.municipality.name}の道路の地図`} sub={road.label} href={road.url} />}
          <Item icon={<Compass className="h-[18px] w-[18px]" />} title="Googleマップ" sub="写真・口コミ・まわりのお店" href={`https://www.google.com/maps/search/?api=1&query=${ll}`} />
          <Item icon={<Navigation className="h-[18px] w-[18px]" />} title="ここまでの道順（Googleマップ）" sub="現在地から物件までの経路" href={`https://www.google.com/maps/dir/?api=1&destination=${ll}`} />
          <Item icon={<MapIcon className="h-[18px] w-[18px]" />} title="ストリートビュー" sub="前面道路の様子（撮影時点の写真）" href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}`} />
          <Item icon={<MapIcon className="h-[18px] w-[18px]" />} title="Appleマップ（iPhone）" href={`https://maps.apple.com/?ll=${ll}&q=${encodeURIComponent(result.matchedAddress)}`} />
          <Item icon={<MapIcon className="h-[18px] w-[18px]" />} title="地理院地図（国土地理院）" sub="標高・地形・古い航空写真" href={`https://maps.gsi.go.jp/#18/${lat.toFixed(6)}/${lng.toFixed(6)}/`} />
        </ul>
        <p className="mt-2 text-[11.5px] leading-[1.6] text-muted">押した地図アプリに、物件の座標だけを渡して開きます。</p>
      </Sheet>
    </div>
  );
}

export function ReportSheet({ open, onClose, onMemo, onDraft, onGuide, onCopy, copied }: { open: boolean; onClose: () => void; onMemo: () => void; onDraft: () => void; onGuide: () => void; onCopy: () => void; copied: boolean }) {
  if (!open) return null;
  return (
    <div className="theme-navy">
      <Sheet title="レポートを作成" open onClose={onClose}>
        <ul className="divide-y divide-line">
          <Item icon={<Printer className="h-[18px] w-[18px]" />} title="調査メモを印刷・PDF保存" sub="道路・法令・ハザード・地価・周辺環境をA4にまとめる（iPhoneはプリントの画面からPDFにできます）" onClick={onMemo} />
          <Item icon={<ScrollText className="h-[18px] w-[18px]" />} title="重説・物件概要の下書き" sub="重要事項説明書・販売図面の欄の順に、コピーして使える下書き" onClick={onDraft} />
          <Item icon={<FileText className="h-[18px] w-[18px]" />} title="案内図を印刷・PDF保存" sub="物件の場所の地図（A4）" onClick={onGuide} />
          <Item icon={<ClipboardCopy className="h-[18px] w-[18px]" />} title={copied ? "コピーしました" : "結果の文面をコピー"} sub="メール・チャット・社内の報告にそのまま貼れる文" onClick={onCopy} />
        </ul>
        <p className="mt-2 text-[11.5px] leading-[1.6] text-muted">どれも参考の資料です。重要事項説明などの最終確認は、役所の窓口・公的な資料で行ってください。</p>
      </Sheet>
    </div>
  );
}
