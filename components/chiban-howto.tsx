"use client";
// 地番が確定しないときの「地番の確かめ方」（PC のカルテの「筆・隣地」）。中身は lib/app/chiban-howto.ts（公式の手段だけ）
import { ExternalLink } from "lucide-react";
import { chibanHowto } from "@/lib/app/chiban-howto";
import type { ChibanzuLink } from "@/lib/roadmap/chibanzu";

export function ChibanHowto({ chibanzu, lead }: { chibanzu?: ChibanzuLink; lead: string }) {
  const steps = chibanHowto(chibanzu);
  return (
    <div className="paper mt-2">
      <p className="desk-subhead">地番の確かめ方</p>
      <p className="desk-small">{lead}</p>
      <ol className="mt-2 flex flex-col gap-2.5">
        {steps.map((s, i) => (
          <li key={s.title} className="text-[13px] leading-relaxed">
            <b>
              {i + 1}. {s.title}
            </b>
            <span className="block text-[12.5px] text-[#5f5547]">{s.text}</span>
            {s.link && (
              <a className="btn small mt-1 inline-flex" href={s.link.url} target="_blank" rel="noreferrer">
                <ExternalLink size={14} aria-hidden />
                {s.link.label}
              </a>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 「地番の確かめ方」を出すときの、最初の一言（出さないときは undefined） */
export function chibanHowtoLead(p: { status: string; kind?: string; approximate?: boolean }): string | undefined {
  if (p.status === "error") return "地番の地図データを読み込めませんでした。開き直すか、次の方法で確かめてください。";
  if (p.status === "none")
    return p.approximate
      ? "番地まで見つからず町の中心を表示しているので、筆は探していません。次の方法で地番を確かめられます。"
      : "この場所の筆は、地番の地図データの中に見つかりませんでした（公図しか無い地域など）。次の方法で地番を確かめられます。";
  if (p.status === "ok" && p.kind === "address")
    return "上の地番は、住所の地点にある筆です（参考）。住居表示の住所と地番は別のものなので、次の方法で確かめてください。";
  return undefined;
}
