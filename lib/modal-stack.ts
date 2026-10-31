// 一時的に重なる画面（下から出るシート・全画面の地図・地図で選ぶ画面）の重なり順。
// いちばん上の画面だけが Esc・Tab の閉じ込め・端末の「戻る」を受け持ち、その外（背景）はキーボード・読み上げで触れないようにする
// （components/use-modal.ts）。常に出ている結果パネルはここに入れない（一時的な画面だけ）。

export type ModalEntry<T> = { id: number; el: T; close: () => void };

export type ModalStack<T> = {
  /** 画面が開いた。いちばん上に積む */
  push: (el: T, close: () => void) => number;
  /** 画面が閉じた（いちばん上でなくても外す） */
  remove: (id: number) => void;
  top: () => ModalEntry<T> | undefined;
  isTop: (id: number) => boolean;
  size: () => number;
  /** 積み方が変わったら呼ぶ */
  subscribe: (fn: () => void) => () => void;
};

export function createModalStack<T>(): ModalStack<T> {
  let entries: ModalEntry<T>[] = [];
  let next = 0;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const fn of listeners) fn();
  };
  return {
    push: (el, close) => {
      const id = ++next;
      entries = [...entries, { id, el, close }];
      emit();
      return id;
    },
    remove: (id) => {
      const before = entries.length;
      entries = entries.filter((e) => e.id !== id);
      if (entries.length !== before) emit();
    },
    top: () => entries[entries.length - 1],
    isTop: (id) => entries[entries.length - 1]?.id === id,
    size: () => entries.length,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

type TreeNode<T> = { parentElement: T | null; children: ArrayLike<T> };

/**
 * el の外（背景）にあたる要素：el から root までの、それぞれの祖先の「ほかの子」。これらを触れなくすれば、el の中だけを操作できる。
 * el の祖先そのものは含めない（含めると el も触れなくなる）。el が root の中に無ければ、たどれたところまで
 */
export function backgroundOf<T extends TreeNode<T>>(el: T, root: T): T[] {
  const out: T[] = [];
  let cur = el;
  while (cur !== root && cur.parentElement) {
    const parent: T = cur.parentElement;
    for (const c of Array.from(parent.children)) if (c !== cur) out.push(c);
    cur = parent;
  }
  return out;
}

/**
 * Tab・Shift+Tab で、画面の中の操作できる部品をひと回りさせる（外へ出さない）。
 * items：画面の中で操作できる部品（表示順）、active：いまフォーカスのある部品（画面そのもの・外なら -1）。
 * 戻り値は次にフォーカスする部品の番号。null ならブラウザに任せる（画面の中を普通に移る）
 */
export function trapStep(count: number, active: number, shift: boolean): number | null {
  if (count === 0) return -1; // 操作できる部品が無い：画面そのものに留める
  if (active < 0) return shift ? count - 1 : 0;
  if (shift && active === 0) return count - 1;
  if (!shift && active === count - 1) return 0;
  return null;
}
