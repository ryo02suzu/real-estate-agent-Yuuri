import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultView } from "../result-view";
import { NotOkPage } from "./pages";

const noop = () => {};

/**
 * 入れた町名が見つからないとき（2026-11-16）：市の中心や別の町を物件の場所として出さず、見つからなかった町名を出す。
 * 別の町に当たったときは、同じ市区町村の町を候補として選んでもらい、地図で選ぶこともできる
 */
describe("町名が見つからないときの画面", () => {
  it("スマホ：見つからない画面に、見つからなかった町名と地図で選ぶボタン", () => {
    const html = renderToStaticMarkup(
      <NotOkPage query="茨城県つくば市さくらの森15番10" result={{ status: "not_found", miss: { typed: "さくらの森", found: "つくば市", kind: "city" } }} onPick={noop} onMap={noop} onBack={noop} />,
    );
    expect(html).toContain("町名「さくらの森」が見つかりませんでした");
    expect(html).toContain("新しい町名や字の名前は、まだ入っていないことがあります");
    expect(html).toContain("地図で場所を選ぶ");
  });

  it("スマホ：別の町に当たったときは候補から選ぶ（候補・地図で選ぶ・同じ場所とは限らないこと）", () => {
    const html = renderToStaticMarkup(
      <NotOkPage
        query="高知県南国市大ソネ字永道甲1519番13"
        result={{
          status: "choose",
          near: true,
          miss: { typed: "大ソネ", found: "大改野", kind: "town" },
          candidates: [
            { lat: 33.66, lng: 133.57, matchedAddress: "高知県南国市大改野字永道甲1519番13" },
            { lat: 33.57, lng: 133.65, matchedAddress: "高知県南国市大埆字永道甲1519番13" },
          ],
        }}
        onPick={noop}
        onMap={noop}
        onBack={noop}
      />,
    );
    expect(html).toContain("町名「大ソネ」が見つかりませんでした");
    expect(html).toContain("高知県南国市大埆字永道甲1519番13");
    expect(html).toContain("地図で場所を選ぶ");
    expect(html).toContain("入れた町と同じ場所とは限りません");
  });

  it("スマホ：今までの「見つからない」「複数ある」は今までどおり（地図で選ぶボタンは見つからない画面だけ）", () => {
    const nf = renderToStaticMarkup(<NotOkPage query="存在しない住所" result={{ status: "not_found" }} onPick={noop} onMap={noop} onBack={noop} />);
    expect(nf).toContain("入れ方を変えると見つかることがあります");
    const ch = renderToStaticMarkup(
      <NotOkPage query="本町1-1" result={{ status: "choose", candidates: [{ lat: 35.45, lng: 139.63, matchedAddress: "神奈川県横浜市中区本町一丁目１番" }] }} onPick={noop} onMap={noop} onBack={noop} />,
    );
    expect(ch).toContain("当てはまる場所が複数あります");
    expect(ch).not.toContain("地図で場所を選ぶ");
  });

  it("PC：パネルにも見つからなかった町名を出す", () => {
    const nf = renderToStaticMarkup(<ResultView query="茨城県つくば市さくらの森15番10" result={{ status: "not_found", miss: { typed: "さくらの森", found: "つくば市", kind: "city" } }} onPick={noop} desktop />);
    expect(nf).toContain("町名「さくらの森」が見つかりませんでした");
    expect(nf).toContain("ここで調べる");
    const ch = renderToStaticMarkup(
      <ResultView
        query="高知県南国市大ソネ字永道甲1519番13"
        result={{ status: "choose", near: true, miss: { typed: "大ソネ", found: "大改野", kind: "town" }, candidates: [{ lat: 33.57, lng: 133.65, matchedAddress: "高知県南国市大埆字永道甲1519番13" }] }}
        onPick={noop}
        desktop
      />,
    );
    expect(ch).toContain("町名「大ソネ」が見つかりませんでした");
    expect(ch).toContain("高知県南国市大埆字永道甲1519番13");
  });
});
