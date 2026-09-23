// "048-242-6344（第1係）/ 048-258-1199（第2係）" のような表記を、発信できる番号ごとに分ける

export type PhoneEntry = { number: string; label?: string };

export function parsePhones(text: string): PhoneEntry[] {
  const re = /(\d{2,5}-\d{1,4}-\d{3,4})\s*(?:[（(]([^）)]+)[）)])?/g;
  return [...text.matchAll(re)].map((m) => ({ number: m[1], label: m[2] }));
}
