#!/usr/bin/env python3
"""
道路種別の地図の凡例（線の色 → 種別）を集めて lib/roadmap/data/legends.json を作り直す。

wagmap 系の地図（www2.wagmap.jp・マッピングぐんま・横浜市 iマッピー）は、地図の利用条件に同意したうえで
レイヤ一覧（GetLayerTree）を読み、表示されるレイヤの凡例の名前と色を取る（色が画像のときは画像の色を数える）。
茨城県の共同の地図はレイヤが「５号道路_水戸市」のように市町村ごとなので、市町村ごとに分ける。
Sonicweb・ICBA・川崎市（GeoCloud）の凡例は画像や凡例欄を読んで書き写したもの（scripts/legends/manual.json、出典の URL つき）をそのまま入れる。

  npm run legends        # 地図の一覧を書き出して、このスクリプトを実行する

必要なもの: Pillow（pip install pillow）
"""
import http.cookiejar
import io
import json
import random
import re
import ssl
import sys
import unicodedata
import urllib.parse
import urllib.request

from PIL import Image

OUT = "lib/roadmap/data/legends.json"
MANUAL = "scripts/legends/manual.json"
UA = {"User-Agent": "Mozilla/5.0 (michilu-legends; +https://github.com/ryo02suzu/real-estate-agent-Yuuri)"}
# 群馬県・横浜市のサーバは古い DH 鍵なので、セキュリティレベルを下げた接続を使う
CTX = ssl.create_default_context()
CTX.set_ciphers("DEFAULT@SECLEVEL=1")

ROADISH = re.compile(r"(42条|号道路|項道路|指定道路|道路種別|位置指定|基準法|[12]項|[1-5]号|非道路|該当しない|通路|未判定|調査中|保留|道路状空地|43条)")
NOT_ROAD = re.compile(r"(用途地域|防火|都市施設|地区計画|景観|宅地造成|駐車場|再生可能|まちづくり|大規模土地|図郭|事業認可|ハザード|都市計画)")


def norm(s: str) -> str:
    return re.sub(r"<[^>]+>", "", unicodedata.normalize("NFKC", s or "")).strip()


def opener():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()), urllib.request.HTTPSHandler(context=CTX))


def layer_tree(host: str, slug: str, mid: str) -> dict:
    op = opener()
    op.addheaders = list(UA.items())
    base = f"https://{host}/{slug}"
    op.open(f"{base}/Map?mid={mid}", timeout=60).read()
    op.open(urllib.request.Request(f"{base}/Agreement/Agree", data=urllib.parse.urlencode({"MapId": mid}).encode(), headers={"X-Requested-With": "XMLHttpRequest"}), timeout=60).read()
    body = urllib.parse.urlencode({"mid": mid, "tmtl": ";;", "tmul": "-1;;", "dmy": random.randint(1, 9999), "langmode": 0, "tmcl": "", "tmucl": "", "fmnm": 1, "mtl": ""}).encode()
    res = op.open(urllib.request.Request(f"{base}/Map/GetLayerTree", data=body, headers={"X-Requested-With": "XMLHttpRequest"}), timeout=60).read()
    return json.loads(res)["JsonResult"]["tree"]


_icons: dict[str, str | None] = {}


def icon_color(host: str, slug: str, icon: str) -> str | None:
    """凡例の色。URL の lcl= か、凡例の画像でいちばん多い（白・透明以外の）色"""
    if not icon:
        return None
    # 相対パスは「/地図名/地図名/Content/…」に置かれている
    url = icon if icon.startswith("http") else f"https://{host}/{slug}/{slug}/{icon.lstrip('./')}"
    if url not in _icons:
        q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get("lcl", [""])[0]
        if q:
            _icons[url] = f"#{q.lower()}"
        else:
            try:
                data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30, context=CTX).read()
                counts: dict[tuple[int, int, int], int] = {}
                for r, g, b, a in Image.open(io.BytesIO(data)).convert("RGBA").get_flattened_data():
                    if a >= 128 and not (r > 235 and g > 235 and b > 235):
                        counts[(r, g, b)] = counts.get((r, g, b), 0) + 1
                _icons[url] = "#%02x%02x%02x" % max(counts, key=counts.get) if counts else None
            except Exception as e:  # 画像が無い凡例は色なし（その項目は出さない）
                print("  icon", url, e, file=sys.stderr)
                _icons[url] = None
    return _icons[url]


def legend_of(host: str, slug: str, mid: str, extra: str) -> dict | None:
    tree = layer_tree(host, slug, mid)
    # 表示するレイヤ：URL の mcl で切り替えている地図はそのレイヤ、それ以外は最初から表示されているレイヤ
    mcl = urllib.parse.unquote(urllib.parse.parse_qs(extra.lstrip("&")).get("mcl", [""])[0])
    want = {int(x) for x in re.findall(r"(\d+),\d+,\d+,\d+", mcl)} if mcl else None
    per_city: dict[str | None, list[dict]] = {}

    def walk(items):
        for it in items or []:
            if it.get("classname") == "lyr":
                take = (it.get("id") in want) if want is not None else bool(it.get("inputtypechecked"))
                lname = norm(it.get("lname"))
                if take and not (NOT_ROAD.search(lname) and not ROADISH.search(lname)):
                    m = re.match(r"(.+?)_(.+[市町村区])$", lname)
                    city = m.group(2) if m else None
                    for h in it.get("items") or []:
                        if h.get("classname") != "hcode":
                            continue
                        label = norm(h.get("lname"))
                        if city:
                            label = re.sub(rf"_{re.escape(city)}$", "", label)
                        if not label or "図郭" in label or not (ROADISH.search(label) or ROADISH.search(lname)):
                            continue
                        color = icon_color(host, slug, h.get("icon") or "")
                        lst = per_city.setdefault(city, [])
                        if color and not any(x["label"] == label for x in lst):
                            lst.append({"label": label, "color": color.lower()})
            walk(it.get("items"))

    walk(tree.get("items"))
    per_city = {k: v for k, v in per_city.items() if v}
    if not per_city:
        return None
    if list(per_city) == [None]:
        legend = per_city[None]
        # 「指定道路」1つだけのような、種別の分からない凡例は出さない（画像で配る地図）
        if len(legend) == 1 and legend[0]["label"] in ("建築基準法道路", "指定道路", "指定道路図"):
            return None
        return {"map": norm(tree.get("lname")), "legend": legend}
    return {"map": norm(tree.get("lname")), "byCity": {k: v for k, v in per_city.items() if k}}


def main() -> None:
    maps_file = sys.argv[1]
    rows = json.load(open(maps_file, encoding="utf-8"))
    current = json.load(open(OUT, encoding="utf-8"))
    # 書き写した凡例（出典は manual.json に残し、アプリには地図名と凡例だけ入れる）
    out = {k: {"map": v["map"], "legend": v["legend"]} for k, v in json.load(open(MANUAL, encoding="utf-8")).items()}
    seen = set()
    for r in rows:
        m = re.match(r"https://([^/]+)/([^/]+)/Map\?mid=(\d+)(.*)", r["url"])
        if not m:
            continue
        key = f"{m.group(1)}/{m.group(2)}/{m.group(3)}"
        if key in seen:
            continue
        seen.add(key)
        try:
            v = legend_of(m.group(1), m.group(2), m.group(3), m.group(4))
        except Exception as e:  # 読めなかった地図は前回の凡例を残す
            print("ERR", key, e, file=sys.stderr)
            v = current.get(key)
        if v:
            out[key] = v
            n = len(v["legend"]) if "legend" in v else f"{len(v['byCity'])} 市町村"
            print(f"{key} {v['map']}: {n}")
    with open(OUT, "w", encoding="utf-8") as f:
        rows = [f" {json.dumps(k)}: {json.dumps(v, ensure_ascii=False, separators=(',', ':'))}" for k, v in sorted(out.items())]
        f.write("{\n" + ",\n".join(rows) + "\n}\n")
    print(f"{len(out)} 地図 → {OUT}")


if __name__ == "__main__":
    main()
