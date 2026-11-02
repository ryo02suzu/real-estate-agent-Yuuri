"use client";

// スマホの結果パネルの中に、項目の詳細を出す仕組み（一覧 → 詳細 → 戻る を同じパネルの中で行う）。
// 各項目の行（components/zoning-card.tsx など）は、これまでどおり <Sheet detail> で詳細を書く。Sheet は、この仕組みの中にあれば
// 下から出るシートの代わりに、パネルの詳細の場所へ中身を出す（行の状態はそのまま行が持つ）。
// PC・パネルの外では従来どおり下から出るシート。
import { createContext, useContext, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export type DetailEntry = { id: string; title: string; close: () => void };

export type PanelDetailApi = {
  /** 詳細を置く場所（パネルの中の要素）。まだ無ければ null */
  host: HTMLElement | null;
  /** 詳細が開いた */
  opened: (entry: DetailEntry) => void;
  /** 詳細が閉じた（外れたときも） */
  closed: (id: string) => void;
};

export const PanelDetailContext = createContext<PanelDetailApi | null>(null);

/** 結果パネルの中なら API。パネルの外（PC など）は null */
export const usePanelDetail = () => useContext(PanelDetailContext);

/** 端末の「戻る」で詳細を閉じるとき（app/page.tsx）に、パネルへ知らせるイベント */
export const DETAIL_CLOSE_EVENT = "michilu:detail-close";

export function PanelDetail({
  api,
  title,
  open,
  onClose,
  children,
}: {
  api: PanelDetailApi;
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const id = useId();
  const { host, opened, closed } = api;
  // 最新の onClose と open を、閉じるときの処理から読めるようにする
  const latest = useRef({ onClose, open });
  useEffect(() => {
    latest.current = { onClose, open };
  });

  useEffect(() => {
    if (!open) return;
    opened({ id, title, close: () => latest.current.onClose() });
    return () => closed(id);
  }, [open, id, title, opened, closed]);

  // 開いたまま外れたとき（別の結果・読み込み直し）は、行の「開いている」状態も閉じる。あとで勝手に開き直さない
  useEffect(
    () => () => {
      if (latest.current.open) latest.current.onClose();
    },
    [],
  );

  if (!open || !host) return null;
  return createPortal(
    <div data-testid="panel-detail-body" className="mui-detail-in">
      {children}
    </div>,
    host,
  );
}
