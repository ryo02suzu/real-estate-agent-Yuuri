#!/usr/bin/env python3
"""
国土交通省「都市計画決定GISデータ」（全国都市計画決定情報GIS）から、関東1都6県の用途地域・建ぺい率・容積率・防火地域などを
1つのベクトルタイル（PMTiles）にする。アプリ（lib/roadmap/zoning.ts）はブラウザから物件の位置のタイルだけを読み、
その地点にかかる都市計画を文字で出す（動く地図にも色で重ねる）。

あわせて、市区町村ごとに「どの都市計画のデータがあるか」と「データの時点」を lib/roadmap/data/zoning-status.json に書く。
データが無い（×）のか、その都市計画が決まっていない（－）のかを区別して画面に出すため。

  python3 scripts/zoning-tiles/build.py --check          # G空間の全国データが data/zoning-source.json の版から更新されたか（changed=true/false）
  python3 scripts/zoning-tiles/build.py --install        # 最新版を読んでタイルを作り、public/data/ に置いて zoning-source.json を書き換える
  python3 scripts/zoning-tiles/build.py --zip geojson.zip --list list.xlsx --out work/zoning.pmtiles   # 手元のファイルから作るだけ

必要なもの: tippecanoe（2.79 以上）、openpyxl（pip install openpyxl）
"""
import argparse
import datetime
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
import urllib.request
import zipfile

import openpyxl

CKAN = "https://www.geospatial.jp/ckan/api/3/action/package_show?id=ckan-dataset"
# 公表自治体及び掲載データ一覧（データの有無と時点）。G空間のデータセットの説明文にある Excel
LIST_RE = re.compile(r"https://www\.mlit\.go\.jp/toshi/tosiko/content/\d+\.xlsx")
UA = {"User-Agent": "michilu-zoning-tiles (+https://github.com/ryo02suzu/real-estate-agent-Yuuri)"}
PREFS = ("08", "09", "10", "11", "12", "13", "14")
ATTRIBUTION = '<a href="https://www.mlit.go.jp/toshi/tosiko/toshi_tosiko_tk_000087.html">都市計画決定GISデータ（国土交通省）</a>を加工して作成'

# タイルに入れるレイヤ（データのファイル名の末尾）と、名前に使う属性
LAYERS = {
    "youto": "YoutoName",  # 用途地域（建ぺい率・容積率も持つ）
    "senbiki": "AreaType",  # 市街化区域・市街化調整区域
    "tokei": "TokeiName",  # 都市計画区域
    "jyuntoshi": "AreaName",  # 準都市計画区域
    "bouka": "AreaType",  # 防火地域・準防火地域
    "koudoti": None,  # 高度地区（種類・高さはデータに無い）
    "koudori": "DistName",  # 高度利用地区
    "chikukei": "DistName",  # 地区計画
    "tkbt": "YoutoName",  # 特別用途地区
    "fuuchichiku": "DistName",  # 風致地区
    "tochiku": "DistName",  # 土地区画整理事業
    "douro": None,  # 都市計画道路（中心線）
    "kouen": "ParkName",  # 都市計画公園
    "ritteki": "AreaType",  # 立地適正化計画（居住誘導区域など）
    "tokuteiyouto": "DistName",  # 特定用途制限地域
    "tokuryoku": "DistName",  # 特別緑地保全地区
    "tokureiyouseki": "DistName",  # 特例容積率適用地区
    "kousoujyukyo": "DistName",  # 高層住居誘導地区
    "tokuteibou": "DistName",  # 特定防災街区整備地区
    "toshisaisei": "DistName",  # 都市再生特別地区
    "rekifuu": "DistName",  # 歴史的風土保存地区
    "ryokukachiiki": "DistName",  # 緑化地域
    "soubou": "DistName",  # 航空機騒音障害防止地区
}

# 一覧の列名 → レイヤ（データの有無を見る）
LIST_COLUMNS = {
    "都市計画区域": "tokei",
    "区域区分": "senbiki",
    "用途地域": "youto",
    "特別用途地区": "tkbt",
    "高度地区": "koudoti",
    "高度利用地区": "koudori",
    "防火準防火": "bouka",
    "土地区画整理事業": "tochiku",
    "地区計画": "chikukei",
    "都市計画道路": "douro",
    "公園": "kouen",
    "立地適正化計画": "ritteki",
    "準都市計画区域": "jyuntoshi",
    "特定用途制限地域": "tokuteiyouto",
    "風致地区": "fuuchichiku",
    "特別緑地保全地区": "tokuryoku",
}


def log(*a):
    print(*a, flush=True)


def fetch(url: str, path: str) -> None:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=1800) as r, open(path, "wb") as f:
        shutil.copyfileobj(r, f, 1 << 20)


def latest() -> dict:
    """G空間情報センターの全国データ（GeoJSON）の URL・更新日時と、版の名前、データの有無の一覧（Excel）の URL"""
    with urllib.request.urlopen(urllib.request.Request(CKAN, headers=UA), timeout=120) as r:
        pkg = json.load(r)["result"]
    res = next(res for res in pkg["resources"] if res["name"].lower().startswith("geojson"))
    notes = pkg.get("notes") or ""
    m = LIST_RE.search(notes)
    if not m:
        sys.exit("データの有無の一覧（Excel）の URL が見つかりません")
    modified = res.get("last_modified") or res.get("metadata_modified") or ""
    # 版の名前：説明文の更新履歴の最後の「令和7年度版」と、ファイルの更新年月
    fy = re.findall(r"(令和\d+年度版)", notes)
    ym = f"{int(modified[:4])}年{int(modified[5:7])}月更新" if re.match(r"\d{4}-\d{2}", modified) else ""
    edition = f"{fy[-1]}・{ym}" if fy and ym else (fy[-1] if fy else ym)
    return {"zip": res["url"], "list": m.group(0), "modified": modified, "edition": edition}


def sources(work: str, meta: dict) -> tuple[str, str]:
    """全国データの GeoJSON の zip と、データの有無の一覧（Excel）を読む"""
    zp, lp = os.path.join(work, "geojson.zip"), os.path.join(work, "list.xlsx")
    log("download", meta["zip"])
    fetch(meta["zip"], zp)
    log("download", meta["list"])
    fetch(meta["list"], lp)
    return zp, lp


def to_int(v) -> int | None:
    try:
        n = int(float(v))
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def props(layer: str, p: dict) -> dict:
    out = {}
    key = LAYERS[layer]
    name = (p.get(key) if key else None) or None
    if isinstance(name, str):
        name = name.strip() or None
    if layer == "fuuchichiku" and name and name.isdigit():
        name = f"第{name}種風致地区"  # 種別を数字だけで持つ市がある
    if name:
        out["name"] = name
    if layer == "youto":
        out["code"] = to_int(p.get("YoutoCode")) or 0
        far, bcr = to_int(p.get("FAR")), to_int(p.get("BCR"))
        # 建ぺい率と容積率を入れ違えている市がある（建ぺい率は容積率より大きくならない）
        if far and bcr and bcr > far:
            far, bcr = bcr, far
        if far:
            out["far"] = far
        if bcr:
            out["bcr"] = bcr
    return out


def features(zip_path: str, out) -> dict[str, int]:
    counts: dict[str, int] = {}
    outer = zipfile.ZipFile(zip_path)
    for name in outer.namelist():
        base = name.rsplit("/", 1)[-1]
        if not base.endswith(".zip") or base[:2] not in PREFS:
            continue
        inner = zipfile.ZipFile(io.BytesIO(outer.read(name)))
        for n in inner.namelist():
            m = re.search(r"/(\d{5})_([a-z]+)\.geojson$", n)
            if not m or m.group(2) not in LAYERS:
                continue
            layer = m.group(2)
            data = json.loads(inner.read(n))
            for f in data["features"]:
                if not f.get("geometry"):
                    continue
                feat = {"type": "Feature", "tippecanoe": {"layer": layer}, "properties": props(layer, f["properties"]), "geometry": f["geometry"]}
                out.write(json.dumps(feat, ensure_ascii=False, separators=(",", ":")) + "\n")
                counts[layer] = counts.get(layer, 0) + 1
        log(f"{base[:2]}: {sum(counts.values())} features so far")
    return counts


ERA = {"令和": 2018, "R": 2018, "平成": 1988, "H": 1988}
DATE_RES = [
    re.compile(r"(?P<y>\d{4})[/.\-年](?P<m>\d{1,2})(?:[/.\-月](?P<d>\d{1,2})日?|月)?"),
    re.compile(r"(?P<era>令和|平成|R|H)\s*(?P<y>\d{1,2}|元)[年.](?:\s*(?P<m>\d{1,2})[月.]?(?:\s*(?P<d>\d{1,2})日?)?)?"),
]


def when_text(v) -> str | None:
    """データの時点を「2024年5月29日」の形にする。日付が読めなければ None"""
    if isinstance(v, datetime.datetime):
        return f"{v.year}年{v.month}月{v.day}日"
    text = unicodedata.normalize("NFKC", str(v or "")).strip()
    if text in ("", "－", "-", "None", "ー"):
        return None
    found = []
    for rx in DATE_RES:
        for m in rx.finditer(text):
            y = m.group("y")
            year = (ERA[m.group("era")] + (1 if y == "元" else int(y))) if "era" in rx.groupindex and m.group("era") else int(y)
            month = int(m.group("m")) if m.group("m") else None
            day = int(m.group("d")) if m.group("d") else None
            if day is not None and not 1 <= day <= 31:
                day = None  # 「7月33日」のような書き誤りは月まで
            if 1950 <= year <= 2100 and (month is None or 1 <= month <= 12):
                found.append((year, month or 0, day or 0))
    # 同じ年月の「2024年4月」と「2024年4月26日」は、細かいほうだけ
    found = [t for t in found if not (t[2] == 0 and any(u[:2] == t[:2] and u[2] for u in found)) and not (t[1] == 0 and any(u[0] == t[0] and u[1] for u in found))]
    if not found:
        return None
    fmt = lambda t: f"{t[0]}年" + (f"{t[1]}月" if t[1] else "") + (f"{t[2]}日" if t[2] else "")
    lo, hi = min(found), max(found)
    # 都市計画の種類ごとに時点が違う市は、いちばん古い日付からいちばん新しい日付まで
    return fmt(lo) if lo == hi else f"{fmt(lo)}〜{fmt(hi)}（項目により異なる）"


def status(list_path: str) -> dict:
    """市区町村ごとのデータの有無（〇 あり、× なし、－ 都市計画決定なし）と時点"""
    ws = openpyxl.load_workbook(list_path, read_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    head_i = next(i for i, r in enumerate(rows) if r and "団体コード" in [str(c) for c in r if c])
    head = [str(c or "").replace("\n", "") for c in rows[head_i]]
    col = {h: i for i, h in enumerate(head)}
    code_i = next(i for i, h in enumerate(head) if h.startswith("団体コード"))
    city_i = next(i for i, h in enumerate(head) if h.startswith("市区町村名（漢字）"))
    when_i = next(i for i, h in enumerate(head) if h.startswith("データ時点"))
    made_i = next(i for i, h in enumerate(head) if h.startswith("データ作成"))
    note_i = next((i for i, h in enumerate(head) if h.startswith("留意事項")), None)
    out = {}
    for r in rows[head_i + 1 :]:
        code = str(r[code_i] or "")
        if len(code) != 6 or code[:2] not in PREFS or not r[city_i]:
            continue
        flags = {}
        for h, layer in LIST_COLUMNS.items():
            v = str(r[col[h]] or "").strip() if h in col else ""
            flags[layer] = {"〇": 1, "×": 0, "－": -1, "-": -1}.get(v, 0)
        # データの時点。日付のほか「平成29年3月」「㉝道路：R6.3.5」のような書き方もあるので、文字のまま出す。無ければ作成日
        when = when_text(r[when_i]) or when_text(r[made_i])
        entry = {"city": r[city_i], "asOf": when, "layers": flags}
        if note_i is not None and r[note_i]:
            entry["note"] = str(r[note_i]).strip()
        out[code[:5]] = entry
    return dict(sorted(out.items()))


def build_tiles(zip_path: str, out_path: str, work: str, minzoom: int) -> None:
    seq = os.path.join(work, "zoning.geojsons")
    with open(seq, "w", encoding="utf-8") as out:
        counts = features(zip_path, out)
    log("features:", counts)
    # 物件の地点の判定は z15 のタイルで行う（約 0.3m の精度）。地図に色を塗るのも z15 から（関東全体で 30MB ほどに収まる）。
    # 縁の外 8px（約 30m）まで入れて、タイルの端に近い地点でも近くの都市計画道路・用途地域の境目を拾えるようにする
    subprocess.run(
        [
            "tippecanoe",
            "-o", out_path,
            "--force",
            f"-Z{minzoom}", "-z15",
            "-P",
            "--buffer=8",
            "--no-tile-size-limit",
            "--no-feature-limit",
            "--simplify-only-low-zooms",
            "--detect-shared-borders",
            "--no-tiny-polygon-reduction-at-maximum-zoom",
            "-q",
            "-n", "MICHILU zoning",
            "-A", ATTRIBUTION,
            seq,
        ],
        check=True,
    )
    os.remove(seq)
    log(f"完成: {out_path} ({os.path.getsize(out_path) / 1e6:.0f} MB)")


def write_status(st: dict, path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        # 1市区町村1行（差分が読みやすいように）
        rows = [f" {json.dumps(k)}: {json.dumps(v, ensure_ascii=False, separators=(',', ':'))}" for k, v in st.items()]
        f.write("{\n" + ",\n".join(rows) + "\n}\n")
    log(f"status: {len(st)} 市区町村 → {path}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="全国データが更新されたかだけ調べる（GITHUB_OUTPUT があれば changed= を書く）")
    ap.add_argument("--install", action="store_true", help="最新版で作り、public/data/ に置いて zoning-source.json を書き換える")
    ap.add_argument("--zip", help="全国データの GeoJSON.zip（省略時はダウンロード）")
    ap.add_argument("--list", help="公表自治体及び掲載データ一覧.xlsx（省略時はダウンロード）")
    ap.add_argument("--out", help="出力する .pmtiles（--install のときは public/data/zoning-YYYYMMDD.pmtiles）")
    ap.add_argument("--status", default="lib/roadmap/data/zoning-status.json")
    ap.add_argument("--source", default="lib/roadmap/data/zoning-source.json")
    ap.add_argument("--public", default="public")
    ap.add_argument("--work", default=None)
    ap.add_argument("--minzoom", type=int, default=15, help="地図に色を塗り始めるズーム（小さくするとファイルが大きくなる）")
    a = ap.parse_args()

    if a.check or a.install:
        meta = latest()
        current = json.load(open(a.source, encoding="utf-8")) if os.path.exists(a.source) else {}
        changed = meta["modified"] != current.get("sourceModified")
        log(f"G空間: {meta['edition']}（{meta['modified']}） / アプリ: {current.get('edition')}（{current.get('sourceModified')}） → {'更新あり' if changed else '更新なし'}")
        if a.check:
            if os.environ.get("GITHUB_OUTPUT"):
                with open(os.environ["GITHUB_OUTPUT"], "a") as f:
                    f.write(f"changed={'true' if changed else 'false'}\n")
            return

    work = a.work or tempfile.mkdtemp(prefix="zoning-")
    os.makedirs(work, exist_ok=True)
    zip_path, list_path = a.zip, a.list
    if not zip_path or not list_path:
        zip_path, list_path = sources(work, meta if a.install else latest())

    write_status(status(list_path), a.status)

    if not a.install:
        if not a.out:
            sys.exit("--out を指定してください")
        build_tiles(zip_path, a.out, work, a.minzoom)
        return

    # 版ごとにファイル名を変える（ブラウザやCDNに古いタイルが残っても混ざらない）
    stamp = re.sub(r"\D", "", meta["modified"])[:8] or datetime.date.today().strftime("%Y%m%d")
    rel = f"data/zoning-{stamp}.pmtiles"
    out_path = os.path.join(a.public, rel)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    build_tiles(zip_path, out_path, work, a.minzoom)
    for old in os.listdir(os.path.dirname(out_path)):
        if old.startswith("zoning-") and old.endswith(".pmtiles") and old != os.path.basename(out_path):
            os.remove(os.path.join(os.path.dirname(out_path), old))
            log("removed", old)
    with open(a.source, "w", encoding="utf-8") as f:
        json.dump({"url": f"/{rel}", "edition": meta["edition"], "sourceModified": meta["modified"]}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    log(f"source: {a.source} → /{rel}（{meta['edition']}）")


if __name__ == "__main__":
    main()
