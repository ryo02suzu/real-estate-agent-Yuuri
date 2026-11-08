// Google の実写 3D（Map Tiles API の Photorealistic 3D Tiles）を「月 999 回まで・1 日の上限なし」で使うための見張り役。
// .github/workflows/google-3d-quota.yml が定期的に動かす。
//
// Google Cloud には月の割り当て（上限）が無く、確実に止められるのは 1 日の割り当てだけ（料金と回数の説明：
// https://developers.google.com/maps/billing-and-pricing/manage-costs 。1 日の割り当ては太平洋時間の 0 時に戻る）。
// そこで、その日の「ルートの要求」の 1 日の割り当てを、今月の残り（月の上限 − 今月の前の日までに使った数）に毎回入れ直す。
// 1 日に使える数は今月の残り全部なので、日ごとの上限は付かず、月の合計は上限を超えない。
// 23:30（太平洋時間）を過ぎたら、次の日の分（今日使った数も引いた残り）を先に入れておく（GitHub の定期実行は遅れることがあるため）。
//
// 数え方：Cloud Monitoring の serviceruntime.googleapis.com/quota/rate/net_usage（割り当てを使った数。1 分ごと、4 分ほど遅れて見える）。
// 割り当ての書き換え：Cloud Quotas API の quotaPreferences（減らすのはすぐ反映される）。
// 必要な設定（リポジトリの Settings → Secrets and variables → Actions）。無ければ何もしないで終わる：
//   Secrets:   GOOGLE_3D_SA_KEY（サービスアカウントの鍵の JSON。役割は Cloud Quotas 管理者と Monitoring 閲覧者）
//   Variables: GOOGLE_3D_PROJECT（プロジェクト ID。省略時は鍵の project_id）、GOOGLE_3D_MONTHLY_CAP（省略時 999）、
//              GOOGLE_3D_QUOTA_ID（1 日のルートの要求の割り当ての ID。省略時は割り当ての一覧から探す）
import { createSign } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SERVICE = "tile.googleapis.com";
export const PREFERENCE_ID = "michilu-3d-root-daily";
const TZ = "America/Los_Angeles";

/** 太平洋時間の年・月・日・時・分 */
export function pacificParts(date) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute };
}

/** 太平洋時間のその日の 0 時（夏時間は UTC−7、冬は UTC−8） */
export function pacificMidnight(y, m, d) {
  for (const off of [7, 8]) {
    const t = new Date(Date.UTC(y, m - 1, d, off));
    const p = pacificParts(t);
    if (p.y === y && p.m === m && p.d === d && p.hh === 0 && p.mm === 0) return t;
  }
  throw new Error(`太平洋時間の 0 時が決まりません: ${y}-${m}-${d}`);
}

/** 今日・今月の始まり（太平洋時間の 0 時）と、明日が同じ月か */
export function pacificWindow(now) {
  const p = pacificParts(now);
  const today = pacificMidnight(p.y, p.m, p.d);
  const month = pacificMidnight(p.y, p.m, 1);
  // 明日（太平洋時間）。26 時間後の日付で見る（夏時間の切り替えの日も 1 日進む）
  const t = pacificParts(new Date(today.getTime() + 26 * 3600_000));
  return { today, month, sameMonthTomorrow: t.m === p.m, late: p.hh * 60 + p.mm >= 23 * 60 + 30 };
}

/**
 * その日の割り当てに入れる数。ふだんは「月の上限 − 今月の前の日までに使った数」。
 * 23:30 を過ぎたら（明日も同じ月なら）、今日使った数も引いた明日の分を先に入れる（今日の残りの 30 分は止まることがある）。
 * 月の最後の日の 23:30 以降は、今日の分のまま（新しい月の 0 時のあとの実行で、月の上限に戻す）
 */
export function planLimit({ cap, usedBeforeToday, usedToday, now }) {
  const w = pacificWindow(now);
  if (w.late && w.sameMonthTomorrow) return { limit: Math.max(0, cap - usedBeforeToday - usedToday), mode: "tomorrow" };
  return { limit: Math.max(0, cap - usedBeforeToday), mode: "today" };
}

/** 1 日のルートの要求の割り当てを、割り当ての一覧から選ぶ（ID の指定があればそれ） */
export function pickQuota(infos, quotaId) {
  if (quotaId) {
    const q = infos.find((i) => i.quotaId === quotaId);
    if (!q) throw new Error(`割り当て ${quotaId} がありません。あるもの: ${infos.map((i) => i.quotaId).join(", ")}`);
    return q;
  }
  const daily = infos.filter((i) => i.refreshInterval === "day" && /root/i.test(`${i.quotaId} ${i.metric} ${i.quotaDisplayName} ${i.metricDisplayName}`));
  if (daily.length !== 1) {
    const list = infos.map((i) => `${i.quotaId}（${i.quotaDisplayName ?? ""}・${i.refreshInterval ?? ""}）`).join("\n  ");
    throw new Error(`1 日のルートの要求の割り当てが ${daily.length} 個です。変数 GOOGLE_3D_QUOTA_ID で選んでください:\n  ${list}`);
  }
  return daily[0];
}

/** timeSeries.list の答えの点を全部足す */
export function sumSeries(json) {
  let n = 0;
  for (const s of json.timeSeries ?? []) for (const p of s.points ?? []) n += Number(p.value?.int64Value ?? p.value?.doubleValue ?? 0);
  return n;
}

const b64url = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** サービスアカウントの鍵で、Google の API を使う一時の許可（アクセストークン）をもらう */
async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sign = createSign("RSA-SHA256");
  sign.update(`${head}.${claim}`);
  const jwt = `${head}.${claim}.${b64url(sign.sign(sa.private_key))}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!r.ok) throw new Error(`許可をもらえません（${r.status}）: ${await r.text()}`);
  return (await r.json()).access_token;
}

async function api(token, url, init = {}) {
  const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${init.method ?? "GET"} ${url.split("?")[0]} → ${r.status}: ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : {};
}

async function quotaInfos(token, project) {
  const out = [];
  let page = "";
  do {
    const j = await api(token, `https://cloudquotas.googleapis.com/v1/projects/${project}/locations/global/services/${SERVICE}/quotaInfos?pageSize=100${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`);
    out.push(...(j.quotaInfos ?? []));
    page = j.nextPageToken ?? "";
  } while (page);
  return out;
}

/** start〜end に使った割り当ての数（その割り当ての指標） */
async function usage(token, project, metric, start, end) {
  if (end <= start) return 0;
  const secs = Math.max(60, Math.ceil((end.getTime() - start.getTime()) / 1000));
  const filter = `metric.type="serviceruntime.googleapis.com/quota/rate/net_usage" AND resource.type="consumer_quota" AND resource.labels.service="${SERVICE}" AND metric.labels.quota_metric="${metric}"`;
  const q = new URLSearchParams({
    filter,
    "interval.startTime": start.toISOString(),
    "interval.endTime": end.toISOString(),
    "aggregation.alignmentPeriod": `${secs}s`,
    "aggregation.perSeriesAligner": "ALIGN_SUM",
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
  });
  return sumSeries(await api(token, `https://monitoring.googleapis.com/v3/projects/${project}/timeSeries?${q}`));
}

async function main() {
  const raw = process.env.GOOGLE_3D_SA_KEY ?? "";
  if (!raw.trim()) {
    console.log("GOOGLE_3D_SA_KEY が無いので何もしません（Google の 3D を使い始めるときに設定する）");
    return;
  }
  const sa = JSON.parse(raw);
  const project = process.env.GOOGLE_3D_PROJECT || sa.project_id;
  const cap = Number(process.env.GOOGLE_3D_MONTHLY_CAP || 999);
  if (!project || !Number.isInteger(cap) || cap < 0) throw new Error("プロジェクトか月の上限の設定が正しくありません");
  const token = await accessToken(sa);

  const q = pickQuota(await quotaInfos(token, project), process.env.GOOGLE_3D_QUOTA_ID || "");
  const now = new Date();
  const w = pacificWindow(now);
  const usedBeforeToday = await usage(token, project, q.metric, w.month, w.today);
  const usedToday = await usage(token, project, q.metric, w.today, now);
  const { limit, mode } = planLimit({ cap, usedBeforeToday, usedToday, now });

  const name = `projects/${project}/locations/global/quotaPreferences/${PREFERENCE_ID}`;
  const params = new URLSearchParams({ allowMissing: "true" });
  // 使った数より下げる・1 割より大きく下げる、の安全確認は外す（月の残りに合わせて下げるのが目的）
  params.append("ignoreSafetyChecks", "QUOTA_DECREASE_BELOW_USAGE");
  params.append("ignoreSafetyChecks", "QUOTA_DECREASE_PERCENTAGE_TOO_HIGH");
  await api(token, `https://cloudquotas.googleapis.com/v1/${name}?${params}`, {
    method: "PATCH",
    body: JSON.stringify({ name, service: SERVICE, quotaId: q.quotaId, dimensions: {}, quotaConfig: { preferredValue: String(limit) }, justification: "MICHILU: keep Photorealistic 3D Tiles root requests within the monthly cap" }),
  });
  const now2 = await api(token, `https://cloudquotas.googleapis.com/v1/${name}`);
  const granted = now2.quotaConfig?.grantedValue;
  const lines = [
    `割り当て: ${q.quotaId}（${q.quotaDisplayName ?? ""}）`,
    `今月（太平洋時間 ${w.month.toISOString()} から）: 前の日まで ${usedBeforeToday} 回・今日 ${usedToday} 回 / 月の上限 ${cap} 回`,
    `入れた 1 日の割り当て: ${limit}（${mode === "tomorrow" ? "明日の分を先に" : "今日の分"}）・反映された値: ${granted ?? "不明"}`,
  ];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Google の実写 3D の回数\n\n${lines.map((l) => `- ${l}`).join("\n")}\n`);
  }
  if (granted !== undefined && String(granted) !== String(limit)) throw new Error(`割り当てがまだ反映されていません（希望 ${limit}・今 ${granted}）`);
}

// node scripts/google-3d/quota.mjs で動かしたときだけ（テストで読み込んだときは動かさない）
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
