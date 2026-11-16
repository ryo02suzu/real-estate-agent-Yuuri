// 読み込みの状態の決まった値。データを読むフック（駅・学校・用途地域・ハザードなど）が「読み込み中」「データなし」を返すとき、
// 描くたびに新しい値を作らず、いつも同じ 1 つの値を返す。
// 描くたびに新しい値を返すと、それを使う useMemo・useEffect が毎回動き直し、親の状態を変える処理と組み合わさると画面の更新が
// 止まらなくなる（PC の物件の画面で、駅・学校・周辺施設を読み込んでいる間に起きていた。lib/app/load-state.test.ts）
export const LOADING = { status: "loading" } as const;
export const NONE = { status: "none" } as const;
