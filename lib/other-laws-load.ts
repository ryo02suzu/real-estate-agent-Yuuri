import type { Hourei } from "./roadmap/hourei";
import type { Morido } from "./roadmap/morido";
import type { Tochi } from "./roadmap/tochi";
import { withRetry } from "./retry";

export type LawKey = "morido" | "hourei" | "tochi";
type LawData = { morido: Morido; hourei: Hourei; tochi: Tochi };
type Loaders = { [K in LawKey]: () => Promise<LawData[K] | null> };
export type OtherLaws = Partial<LawData> & { lawErrors: LawKey[] };

/** 対象外の null と通信失敗を分ける。読み直すときは、失敗した種類だけを返す。 */
export async function loadOtherLaws(loaders: Loaders, keys: LawKey[] = ["morido", "hourei", "tochi"]): Promise<OtherLaws> {
  async function read<T>(key: LawKey, loader: () => Promise<T | null>) {
    if (!keys.includes(key)) return undefined;
    try {
      return { value: (await withRetry(loader)) ?? undefined, failed: false };
    } catch {
      return { value: undefined, failed: true };
    }
  }
  const [morido, hourei, tochi] = await Promise.all([read("morido", loaders.morido), read("hourei", loaders.hourei), read("tochi", loaders.tochi)]);
  const lawErrors: LawKey[] = [];
  if (morido?.failed) lawErrors.push("morido");
  if (hourei?.failed) lawErrors.push("hourei");
  if (tochi?.failed) lawErrors.push("tochi");
  return {
    ...(morido && { morido: morido.value }),
    ...(hourei && { hourei: hourei.value }),
    ...(tochi && { tochi: tochi.value }),
    lawErrors,
  };
}
