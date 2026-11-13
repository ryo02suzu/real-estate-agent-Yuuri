// 日本時間の年月日・曜日（lib/app/city.ts と lib/app/air.ts が使う）
export function jstDate(at: Date): { y: number; m: number; d: number; dow: number } {
  const t = new Date(at.getTime() + 9 * 3600e3);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), dow: t.getUTCDay() };
}
