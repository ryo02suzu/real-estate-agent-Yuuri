import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SIDE_GAP_PX, SIDE_HEADER_PX, SIDE_PANEL_TOP, SIDE_QUERY, sidePanelWidth } from "./mobile-layout";

const shell = readFileSync(join(__dirname, "..", "components/mobile-shell.tsx"), "utf8");
const header = readFileSync(join(__dirname, "..", "components/header.tsx"), "utf8");

describe("横向きの背の低い画面（パネルを左、地図を右）", () => {
  it("横向きで高さ 500px 以下だけ（iPhone の横向きの高さは 320〜440px。縦向き・PC は対象外）", () => {
    expect(SIDE_QUERY).toContain("orientation: landscape");
    expect(SIDE_QUERY).toContain("max-height: 500px");
  });

  it("左のパネルの幅は 300〜380px。iPhone の横向きでは、地図の側に画面の半分以上を残す", () => {
    for (const vw of [667, 844, 874, 932]) {
      const w = sidePanelWidth(vw);
      expect(w).toBeGreaterThanOrEqual(300);
      expect(w).toBeLessThanOrEqual(380);
      expect(vw - 8 - w).toBeGreaterThanOrEqual(vw / 2);
    }
    expect(sidePanelWidth(500)).toBe(300);
    expect(sidePanelWidth(1000)).toBe(380);
  });

  it("パネルの上端は、ロゴの帯（ロゴ 42px＋上下 6px）の下", () => {
    // ロゴの高さ（components/header.tsx の compact）と、帯の上下の余白（py-1.5 = 6px）
    expect(header).toMatch(/height=\{42\}/);
    expect(SIDE_HEADER_PX).toBe(42 + 6 * 2);
    expect(SIDE_GAP_PX).toBeGreaterThan(0);
    expect(SIDE_PANEL_TOP).toContain(`${SIDE_HEADER_PX + SIDE_GAP_PX}px`);
  });

  it("横向きでは段階（小・中・大）のボタン・つまみ・ドラッグを使わない（列の高さいっぱいで、中をスクロール）", () => {
    expect(shell).toMatch(/if \(side \|\| !e\.isPrimary/);
    // 段階のボタンは {!side && (...)} の中
    const btn = shell.indexOf('aria-label="パネルを広げる"');
    expect(btn).toBeGreaterThan(-1);
    expect(shell.slice(Math.max(0, btn - 400), btn)).toContain("{!side && (");
    expect(shell).toMatch(/\{!side && <div className="mx-auto h-1 w-10/);
  });

  it("横向きでは、出典の持ち上げ（--mui-panel-h）を 0 にし、地図の左端（--mui-map-left）をパネルの右に", () => {
    expect(shell).toContain('side ? "0px" : `${h}px`');
    expect(shell).toContain('"--mui-map-left": `${mapLeft}px`');
  });
});
