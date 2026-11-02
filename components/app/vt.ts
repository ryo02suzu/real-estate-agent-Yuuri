// つながる動き（View Transitions）の名前の扱い（スマホの画面だけ）。
// 名前（view-transition-name）の付いた要素は、動きの間だけ画面のいちばん手前に描かれる。スクロールする所で隠れていた部分も切られずに
// 見えてしまい、下のメニューや上の細いバーの上を行が通ったり、画面の外から飛んできたりする。そこで、動きを始める前と、切り替えたあとの
// 画面で、いま見えている範囲に収まっている要素にだけ名前を残す（はみ出す要素は名前を外し、ほかの画面と一緒にふつうに重ねて入れ替える）。
// 縦に長い板（clip に入れた名前）は、上の端が見えていれば、見えている所の下の端で切って名前を残す（板ごと滑らせたいので）。

/** 見えている範囲（画面の px） */
export type Area = { top: number; bottom: number };

/**
 * スクロールする所（data-scroller）の見えている範囲。上に重なっている細いバー（data-vt-cover。少しでも見えているときだけ）の分は除く
 */
export function scrollArea(scroller: HTMLElement): Area {
  const r = scroller.getBoundingClientRect();
  let top = r.top;
  scroller.querySelectorAll<HTMLElement>("[data-vt-cover]").forEach((bar) => {
    // バーはスクロールに合わせて少しずつ出るので、少しでも見えていれば、その下から
    if (parseFloat(getComputedStyle(bar).opacity) < 0.05) return;
    const b = bar.getBoundingClientRect();
    if (b.height > 0) top = Math.max(top, b.bottom);
  });
  return { top, bottom: r.bottom };
}

const inside = (r: DOMRect, a: Area) => r.height > 0 && r.top >= a.top - 0.5 && r.bottom <= a.bottom + 0.5;

/**
 * root の中の名前の付いた要素（style に書いた名前）のうち、area に収まっていないものの名前を外す。
 * clip に入れた名前の要素は、上の端が area に入っていれば、area の下の端で切って（max-height）名前を残す。
 * 切った分を戻す関数を返す（名前は戻さない：画面が描き直すときに外すので。戻すと、あとの動きで名前が重なって動きが止まる）
 */
export function fitNames(root: ParentNode | null, area: Area, clip: readonly string[] = []): () => void {
  const undo: (() => void)[] = [];
  root?.querySelectorAll<HTMLElement>('[style*="view-transition-name"]').forEach((el) => {
    const name = el.style.viewTransitionName;
    if (!name || name === "none") return;
    const r = el.getBoundingClientRect();
    if (inside(r, area)) return;
    if (clip.includes(name) && r.top >= area.top - 0.5 && r.top < area.bottom - 24 && el.offsetHeight > 0) {
      // 画面の px を、その要素の大きさ（拡大・縮小する枠の中の px）に直す
      const scale = r.height / el.offsetHeight || 1;
      const prev = el.style.maxHeight;
      el.style.maxHeight = `${(area.bottom - r.top) / scale}px`;
      undo.push(() => {
        el.style.maxHeight = prev;
      });
      return;
    }
    el.style.viewTransitionName = "none";
  });
  return () => undo.forEach((f) => f());
}

/**
 * data-vt（付ける名前）を持つ要素のうち、area に収まっているものにだけ名前を付け、ほかは外す（動きの前と、切り替えたあとに呼ぶ）
 */
export function nameVisible(root: ParentNode | null, area: Area): void {
  root?.querySelectorAll<HTMLElement>("[data-vt]").forEach((el) => {
    el.style.viewTransitionName = inside(el.getBoundingClientRect(), area) ? (el.dataset.vt ?? "") : "";
  });
}

/** nameVisible で付けた名前を外す（動きが終わったら） */
export function clearNames(root: ParentNode | null): void {
  root?.querySelectorAll<HTMLElement>("[data-vt]").forEach((el) => {
    el.style.viewTransitionName = "";
  });
}
