#!/usr/bin/env python3
"""日本の外の夜の明かりに使う人口：欧州委員会 共同研究センター（JRC）の GHSL の人口の格子（GHS-POP）。night_lights.py が読む。

  python3 ghsl.py          # 取る（work/ghsl/ に置き、2回目からは読まない）と、範囲の人口の合計を見る

使うもの：GHS-POP R2023A（GHS population grid multitemporal (1975-2030)）の 2020 年（E2020）、緯度・経度の格子（WGS84・
30 秒角＝赤道で約 1km）。国勢調査（night_lights.py）と同じ 2020 年に合わせた。値は1マスに住む人の数（小数）。
JRC の配布サーバーから、10 度×10 度のタイル（zip。中は 64 ビットの小数の GeoTIFF・LZW 圧縮）を、範囲にかかるものだけ取る。
どのタイルがあるか（海だけのタイルは無い）は、GHSL のタイルの区切りの表（GHSL_data_4326_shapefile.zip の .dbf）で決める。
1回ずつ WAIT 秒あけ、取ったものは work/ghsl/ に置いて、2回目からは読み直さない。User-Agent は一般的な名前（個人の情報は入れない）。

ライセンス（配布サーバーの copyright.txt。データの全部のフォルダに同じものがある。2026-11-21 に確かめた）：
  "(c) European Union, 1995-2026 ... Any copyright and/or sui generis right on the dataset is licensed under the
   Creative Commons Attribution 4.0 International (CC BY 4.0) licence. Reuse is allowed provided appropriate credit is
   given and any changes are indicated."
JRC のデータカタログの「How to cite」は CITATION。出典の書き方（日本語。加工したことも書く）は ATTRIBUTION。
"""

from __future__ import annotations

import io
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
import zipfile
import zlib

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
CACHE = os.path.join(WORK, "ghsl")

UA = {"User-Agent": "map-build-script/1.0 (static map background; cached; one request at a time)"}
WAIT = 2.0  # 1回ずつ、少なくともこれだけ間をあける（秒）

RELEASE, EPOCH = "R2023A", 2020
NAME = f"GHS_POP_E{EPOCH}_GLOBE_{RELEASE}_4326_30ss"
FTP = "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL"
TILE_URL = f"{FTP}/GHS_POP_GLOBE_{RELEASE}/{NAME}/V1-0/tiles/{NAME}_V1_0_{{tile}}.zip"
SCHEMA_URL = "https://ghsl.jrc.ec.europa.eu/download/GHSL_data_4326_shapefile.zip"  # GHSL の直接ダウンロードのページの「tiling schema」
LICENSE_URL = f"{FTP}/copyright.txt"
DOI = "https://doi.org/10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE"
CITATION = (
    "Schiavina, Marcello; Freire, Sergio; Alessandra Carioli; MacManus, Kytt (2026): GHS-POP R2023A - GHS population grid "
    "multitemporal (1975-2030). European Commission, Joint Research Centre [Dataset] doi: 10.2905/JRC.CXKEDRR; "
    "10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE PID: http://data.europa.eu/89h/2ff68a52-5b5b-4a22-8f40-c41da8332cfe"
)
# アプリの地図の出典（lib/app/desk-cinema.ts の NIGHT_LIGHTS_ATTRIBUTION。e-Stat の出典に続けて書く）と同じ中身
ATTRIBUTION = (
    "国勢調査の範囲の外（日本のまわりの国など）は欧州委員会 共同研究センター（JRC）の「GHS-POP R2023A」"
    f"（© European Union, 1995-2026、CC BY 4.0（https://creativecommons.org/licenses/by/4.0/）、{DOI}）の2020年の人口を加工して作成"
)

_last = 0.0


def get(url: str, timeout: int = 300, tries: int = 5) -> bytes:
    """1回ずつ、WAIT 秒あけて読む（だめなら待って読み直す。404 はそのまま返さない）"""
    global _last
    for i in range(tries):
        time.sleep(max(0.0, _last + WAIT - time.time()))
        _last = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404 or i == tries - 1:
                raise
        except Exception:
            if i == tries - 1:
                raise
        time.sleep(5 * 2**i)
    raise RuntimeError(url)


def cached(name: str, url: str, check=None) -> str:
    """work/ghsl/name に無ければ取って置く（途中で切れたものは .part のまま残り、使わない）"""
    path = os.path.join(CACHE, name)
    if os.path.exists(path) and (check is None or check(path)):
        return path
    os.makedirs(CACHE, exist_ok=True)
    data = get(url)
    tmp = path + ".part"
    with open(tmp, "wb") as f:
        f.write(data)
    if check is not None and not check(tmp):
        raise RuntimeError(f"{name}: 思っていたものと違うものが返った（{data[:80]!r}）")
    os.replace(tmp, path)
    return path


# ---- タイルの区切りの表（.dbf だけ読む。列は tile_id・left・top・right・bottom）


def tile_schema() -> list[dict]:
    path = cached("GHSL_data_4326_shapefile.zip", SCHEMA_URL, zipfile.is_zipfile)
    with zipfile.ZipFile(path) as z:
        dbf = z.read(next(n for n in z.namelist() if n.lower().endswith(".dbf")))
    nrec, hlen, rlen = struct.unpack("<IHH", dbf[4:12])
    fields, pos = [], 32
    while dbf[pos] != 0x0D:
        fields.append((dbf[pos : pos + 11].split(b"\0")[0].decode(), dbf[pos + 16]))
        pos += 32
    out = []
    for i in range(nrec):
        rec = dbf[hlen + i * rlen : hlen + (i + 1) * rlen]
        if rec[:1] == b"*":  # 消された行
            continue
        o, row = 1, {}
        for name, n in fields:
            row[name] = rec[o : o + n].decode("latin1").strip()
            o += n
        out.append({"tile": row["tile_id"], **{k: float(row[k]) for k in ("left", "top", "right", "bottom")}})
    return out


def tiles_for(bbox: tuple[float, float, float, float]) -> list[str]:
    """範囲（西・南・東・北の経度・緯度）にかかるタイル（海だけのタイルは表に無いので、取らない）"""
    w, s, e, n = bbox
    return [t["tile"] for t in tile_schema() if t["left"] < e and t["right"] > w and t["bottom"] < n and t["top"] > s]


def fetch(tile: str) -> str:
    return cached(f"{NAME}_V1_0_{tile}.zip", TILE_URL.format(tile=tile), zipfile.is_zipfile)


# ---- GeoTIFF（BigTIFF も）を読む。GHSL のタイルの形（1 枚・小数・LZW か Deflate か無圧縮・予測なし）だけ


def lzw_decode(data: bytes) -> bytes:
    """TIFF の LZW（上の桁から読む。表が 511・1023・2047 になったら符号を 1 ビット長くする）"""
    data = bytes(data) + b"\0\0\0\0"
    end = (len(data) - 4) * 8
    base = [bytes((i,)) for i in range(256)] + [b"", b""]
    table = base[:]
    out: list[bytes] = []
    width, mask = 9, 511
    bit = 0
    prev = b""
    frombytes = int.from_bytes
    while bit + width <= end:
        code = (frombytes(data[bit >> 3 : (bit >> 3) + 4], "big") >> (32 - width - (bit & 7))) & mask
        bit += width
        if code == 256:  # 表を初めに戻す
            table = base[:]
            width, mask = 9, 511
            prev = b""
            continue
        if code == 257:  # 終わり
            break
        if code < len(table):
            entry = table[code]
            if prev:
                table.append(prev + entry[:1])
        else:
            entry = prev + prev[:1]
            table.append(entry)
        out.append(entry)
        prev = entry
        n = len(table)
        if n >= 2047:
            width, mask = 12, 4095
        elif n >= 1023:
            width, mask = 11, 2047
        elif n >= 511:
            width, mask = 10, 1023
    return b"".join(out)


def read_geotiff(data: bytes) -> tuple[np.ndarray, float, float, float, float]:
    """→ 値（行は北→南）、左上の角の経度・緯度、1 マスの幅・高さ（度）"""
    bo = "<" if data[:2] == b"II" else ">"
    big = struct.unpack(bo + "H", data[2:4])[0] == 43
    size = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8, 18: 8}
    fmt = {1: "B", 2: "B", 3: "H", 4: "I", 6: "b", 7: "B", 8: "h", 9: "i", 11: "f", 12: "d", 16: "Q", 17: "q", 18: "Q"}
    if big:
        off = struct.unpack(bo + "Q", data[8:16])[0]
        count, p, esz, cfmt, inline = struct.unpack(bo + "Q", data[off : off + 8])[0], off + 8, 20, "Q", 8
    else:
        off = struct.unpack(bo + "I", data[4:8])[0]
        count, p, esz, cfmt, inline = struct.unpack(bo + "H", data[off : off + 2])[0], off + 2, 12, "I", 4
    tags: dict[int, tuple] = {}
    for i in range(count):
        e = data[p + i * esz : p + (i + 1) * esz]
        tag, typ = struct.unpack(bo + "HH", e[:4])
        n = struct.unpack(bo + cfmt, e[4 : 4 + inline])[0]
        raw = e[4 + inline :]
        total = size.get(typ, 1) * n
        if total > inline:
            raw = data[struct.unpack(bo + cfmt, raw[:inline])[0] :][:total]
        if typ in fmt:
            tags[tag] = struct.unpack(bo + fmt[typ] * n, raw[:total])
    W, H = tags[256][0], tags[257][0]
    bits, comp = tags[258][0], tags.get(259, (1,))[0]
    sfmt, pred = tags.get(339, (1,))[0], tags.get(317, (1,))[0]
    if sfmt != 3 or bits not in (32, 64) or pred != 1 or tags.get(277, (1,))[0] != 1:
        raise ValueError(f"読めない形（SampleFormat {sfmt}・{bits} ビット・予測 {pred}）")
    dt = np.dtype(bo + ("f8" if bits == 64 else "f4"))

    def decode(chunk: bytes) -> bytes:
        if comp == 1:
            return chunk
        if comp == 5:
            return lzw_decode(chunk)
        if comp in (8, 32946):
            return zlib.decompress(chunk)
        raise ValueError(f"読めない圧縮（{comp}）")

    out = np.zeros((H, W), np.float64)
    if 322 in tags:  # タイル
        tw, th = tags[322][0], tags[323][0]
        offs, cnts = tags[324], tags[325]
        across = -(-W // tw)
        for k, (o, c) in enumerate(zip(offs, cnts)):
            r0, c0 = (k // across) * th, (k % across) * tw
            block = np.frombuffer(decode(data[o : o + c]), dt)[: tw * th].reshape(th, tw)
            h, w = min(th, H - r0), min(tw, W - c0)
            out[r0 : r0 + h, c0 : c0 + w] = block[:h, :w]
    else:  # 帯
        rps = tags.get(278, (H,))[0]
        for k, (o, c) in enumerate(zip(tags[273], tags[279])):
            r0 = k * rps
            h = min(rps, H - r0)
            out[r0 : r0 + h] = np.frombuffer(decode(data[o : o + c]), dt)[: h * W].reshape(h, W)
    sx, sy = tags[33550][0], tags[33550][1]
    tie = tags[33922]  # (i, j, k, x, y, z)：画素 (i, j) の左上の角が経度 x・緯度 y
    left, top = tie[3] - tie[0] * sx, tie[4] + tie[1] * sy
    return out, left, top, sx, sy


def read_tile(tile: str) -> tuple[np.ndarray, float, float, float, float]:
    """タイルの人口（負の値＝データなしは 0 に）。読んだものは work/ghsl/ に .npz で覚える"""
    npz = os.path.join(CACHE, f"{NAME}_{tile}.npz")
    if os.path.exists(npz):
        z = np.load(npz)
        return z["pop"].astype(np.float64), *(float(v) for v in z["geo"])
    with zipfile.ZipFile(fetch(tile)) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".tif"))
        pop, left, top, sx, sy = read_geotiff(z.read(name))
    pop = np.where(np.isfinite(pop) & (pop > 0), pop, 0.0)
    np.savez_compressed(npz, pop=pop.astype(np.float32), geo=np.array([left, top, sx, sy]))
    return pop, left, top, sx, sy


def overlap_matrix(edges: np.ndarray, n_out: int):
    """1 次元の、入力のマス（edges[k]〜edges[k+1]。出力の画素の単位、増える向き）→ 出力の画素（0〜n_out）への、
    重なる長さの割合の行列（scipy.sparse。行＝出力の画素、列＝入力のマス）"""
    from scipy import sparse

    a, b = edges[:-1], edges[1:]
    span = b - a
    rows, cols, vals = [], [], []
    k = np.arange(len(a))
    first = np.floor(a).astype(np.int64)
    for o in range(int(np.ceil(span.max())) + 1):
        p = first + o
        f = np.clip(np.minimum(b, p + 1) - np.maximum(a, p), 0.0, None) / span
        ok = (f > 0) & (p >= 0) & (p < n_out)
        rows.append(p[ok])
        cols.append(k[ok])
        vals.append(f[ok])
    return sparse.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(n_out, len(a)))


def people_on_grid(H: int, W: int, px, py, bbox) -> tuple[np.ndarray, float]:
    """GHSL の人口を、格子（px：経度 → 横の画素の位置、py：緯度 → 縦の画素の位置。どちらも左上の角が 0）に面積の割合で分ける。
    緯度・経度の四角は、メルカトルでも横・縦にまっすぐな四角なので、横と縦の重なりを別々に掛ければよい"""
    people = np.zeros((H, W), np.float64)
    total = 0.0
    tiles = tiles_for(bbox)
    for i, t in enumerate(tiles):
        pop, left, top, sx, sy = read_tile(t)
        h, w = pop.shape
        xe = px(left + sx * np.arange(w + 1))
        ye = py(top - sy * np.arange(h + 1))
        mx = overlap_matrix(xe, W)
        my = overlap_matrix(ye, H)
        # 格子にかかる出力の行・列だけ計算する
        rows = np.unique(my.nonzero()[0])
        cols = np.unique(mx.nonzero()[0])
        if len(rows) and len(cols):
            block = my[rows] @ pop @ mx[cols].T
            people[rows[0] : rows[-1] + 1, cols[0] : cols[-1] + 1] += np.asarray(block)
        total += float(pop.sum())
        print(f"\rGHSL {i + 1}/{len(tiles)} {t}", end="", flush=True)
    print()
    return people, total


def main() -> None:
    bbox = (109.0, 17.0, 167.0, 53.5)
    tiles = tiles_for(bbox)
    print(f"{NAME}：範囲 {bbox} にかかるタイル {len(tiles)} 枚")
    lic = cached("copyright.txt", LICENSE_URL)
    with open(lic, encoding="utf-8", errors="replace") as f:
        print(f.read().strip())
    s = 0.0
    for t in tiles:
        pop, *_ = read_tile(t)
        s += pop.sum()
        print(f"  {t}  {pop.sum():,.0f} 人")
    print(f"合計 {s:,.0f} 人")
    with open(os.path.join(CACHE, "source.json"), "w") as f:
        json.dump({"name": NAME, "tiles": tiles, "tile_url": TILE_URL, "license": LICENSE_URL, "doi": DOI, "citation": CITATION, "attribution": ATTRIBUTION}, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    sys.exit(main())
