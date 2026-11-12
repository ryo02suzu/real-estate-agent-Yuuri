import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MUNICIPALITIES } from "@/lib/roadmap/municipalities";
import { contentSecurityPolicy, DATA_HOSTS, hostAllowed } from "./csp";

const VERCEL = "vercel.json";
type Header = { key: string; value: string };
const readHeaders = () => JSON.parse(readFileSync(VERCEL, "utf8")) as { headers: { source: string; headers: Header[] }[] };

describe("通信先の制限（Content-Security-Policy）", () => {
  it("vercel.json のヘッダーは lib/security/csp.ts から作った値と同じ（直すときは UPDATE_CSP=1 で書き込む）", () => {
    const conf = readHeaders();
    const all = conf.headers.find((h) => h.source === "/(.*)");
    expect(all).toBeDefined();
    const csp = all!.headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp).toBeDefined();
    if (process.env.UPDATE_CSP === "1") {
      csp!.value = contentSecurityPolicy();
      writeFileSync(VERCEL, `${JSON.stringify(conf, null, 2)}\n`);
    }
    expect(csp!.value).toBe(contentSecurityPolicy());
  });

  it("ほかの守りのヘッダーも付いている（種類のすり替え・リファラー・枠・ほかの窓・端末の機能）", () => {
    const all = readHeaders().headers.find((h) => h.source === "/(.*)")!.headers;
    const get = (k: string) => all.find((h) => h.key === k)?.value;
    expect(get("X-Content-Type-Options")).toBe("nosniff");
    // 外のサイトへは、ページの場所（オリジン）だけを伝える（住所は URL の # の後ろなので、もともと送られない）
    expect(get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(get("X-Frame-Options")).toBe("DENY");
    expect(get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    // 位置情報は自分のサイトだけ（現在地で調べる）。カメラ・マイク・支払いなどは使わない
    expect(get("Permissions-Policy")).toMatch(/geolocation=\(self\)/);
    for (const f of ["camera", "microphone", "payment", "usb"]) expect(get("Permissions-Policy")).toContain(`${f}=()`);
  });

  it("よそのスクリプト・枠・プラグイン・eval を許さず、枠に入れられない", () => {
    const csp = contentSecurityPolicy();
    const get = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `))?.slice(name.length + 1) ?? "";
    expect(get("default-src")).toBe("'self'");
    expect(get("script-src")).not.toMatch(/https?:|\*|'unsafe-eval'/);
    expect(get("object-src")).toBe("'none'");
    expect(get("frame-src")).toBe("'none'");
    expect(get("frame-ancestors")).toBe("'none'");
    expect(get("base-uri")).toBe("'self'");
    expect(get("form-action")).toBe("'self'");
    // 通信先は https の決まった相手だけ（http・全部許す * は無い）
    for (const name of ["connect-src", "img-src"]) {
      expect(get(name)).not.toMatch(/http:|(^| )\*( |$)|https:( |$)/);
      for (const h of DATA_HOSTS) expect(get(name)).toContain(h.host);
    }
  });

  it("市の道路種別のデータを読む相手（地図の read）は、どれも許した通信先に入っている", () => {
    const origins = new Set<string>();
    for (const m of MUNICIPALITIES) for (const l of m.maps) for (const layer of l.read?.layers ?? []) origins.add(new URL(layer.url).origin);
    expect(origins.size).toBeGreaterThan(0);
    for (const o of origins) expect(hostAllowed(o), o).toBe(true);
  });

  it("データの置き場（*-source.json の url・index）は、自分のサイトか許した通信先", () => {
    // 出典（sources の中の url・page・terms）は開くだけのリンクなので見ない。読みに行くのは url・index（地方ごと・種類ごとの入れ子も）
    const urls: [string, string][] = [];
    const walk = (file: string, o: unknown) => {
      if (!o || typeof o !== "object") return;
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        if (k === "sources") continue;
        if ((k === "url" || k === "index") && typeof v === "string" && v) urls.push([file, v]);
        else walk(file, v);
      }
    };
    for (const f of readdirSync("lib/roadmap/data").filter((n) => n.endsWith("-source.json"))) walk(f, JSON.parse(readFileSync(`lib/roadmap/data/${f}`, "utf8")));
    expect(urls.length).toBeGreaterThan(10);
    for (const [f, v] of urls) {
      if (v.startsWith("/")) continue;
      expect(hostAllowed(new URL(v).origin), `${f}: ${v}`).toBe(true);
    }
  });

  it("許す相手の判定：https の決まったホストだけ（似た名前・http は通さない）", () => {
    expect(hostAllowed("https://cyberjapandata.gsi.go.jp")).toBe(true);
    expect(hostAllowed("https://msearch.gsi.go.jp")).toBe(true);
    expect(hostAllowed("https://pub-2be6c197b42d4c0f9c3c7f1915ec5cff.r2.dev")).toBe(true);
    expect(hostAllowed("https://services9.arcgis.com")).toBe(true);
    expect(hostAllowed("http://cyberjapandata.gsi.go.jp")).toBe(false);
    expect(hostAllowed("https://gsi.go.jp.example.com")).toBe(false);
    expect(hostAllowed("https://evilgsi.go.jp")).toBe(false);
    expect(hostAllowed("https://example.com")).toBe(false);
    expect(hostAllowed("not a url")).toBe(false);
  });
});
