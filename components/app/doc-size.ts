// 書類のシートの大きさ（スマホ）。どの書類のシートも同じ高さ（DOC_BODY）で開き、中身は真ん中の枠（DOC_PANE）の中で動かす
// （押す・選ぶ・開くで、シートの大きさが変わらない）。components/app/doc-sheets.tsx・app-sheets.tsx・template-editor.tsx で使う

/** 書類のシートの中身の高さ（どの書類も同じ。画面の高さに合わせ、上限 640px） */
export const DOC_BODY = "flex h-[min(74dvh,640px)] flex-col";
/** 書類の中身を見せる枠（残りの高さをぜんぶ使い、中で縦に動かす） */
export const DOC_PANE = "min-h-0 flex-1 overflow-y-auto overscroll-y-contain rounded-[16px] bg-[#f4f7fb] p-2.5";
