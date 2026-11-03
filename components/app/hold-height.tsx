"use client";

// 絞り込み・切り替えで中身が短くなっても、後ろの板（一覧の枠）の大きさが変わらない箱。いちど広がった高さより縮まない
// （はじめは「すべて」など長い一覧を見せるので、その高さを保つ）。物件が変わったとき（resetKey）だけ測り直す。
// 切り替えの数が少なく全部を作れるときは、全部を同じ枠に重ねる方法（components/app/info.tsx の都県の一覧）を使う
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export function HoldHeight({ children, className, style, resetKey }: { children: ReactNode; className?: string; style?: CSSProperties; resetKey?: string }) {
  const inner = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState<{ key: string | undefined; h: number }>({ key: resetKey, h: 0 });
  // 物件が変わったら測り直す（描いている間に前の値を捨てる）
  if (held.key !== resetKey) setHeld({ key: resetKey, h: 0 });
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      setHeld((cur) => (h > cur.h ? { key: cur.key, h } : cur));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [resetKey]);
  return (
    <div className={className} style={{ ...style, minHeight: held.h || undefined }}>
      <div ref={inner}>{children}</div>
    </div>
  );
}
