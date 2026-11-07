"""国土数値情報（nlftp.mlit.go.jp）のファイルを読む。法令・地価・盛土・学区・駅・土地利用の作り直しで共通に使う。

    import ksj
    ksj.exists(url, UA)                        # ファイルがあるか（True / False。確かな返事が無ければ止める）
    ksj.newest(BASE, "A13", prefs, 2015, UA)   # 都道府県ごとの一番新しい年度
    ksj.get_zip(url, UA)                       # ZIP を読む（中身が ZIP でなければ待って読み直す）

国土数値情報のサーバーは不正アクセス対策（ZENEDGE）の後ろにあり、短い間にたくさん読むと、ファイルの代わりに
確認用のページを返すことがある。2026-11-07 の中部の土地利用の作り直しでは、
  1回目：無い 2026 年度の森林地域を「ある」とした（確認用のページを 200 で受けた）
  2回目：年度の判定の途中（山梨県のあと）から全部「無い」になり、読んだファイルが ZIP でなく止まった
ふだんは、無いファイルに 404、ある年度のフォルダーに 403（中の一覧は見せない）、無い年度のフォルダーに 404 を返す。
そこで、404 なら「無い」、先頭が ZIP の印（PK）なら「ある」とし、それ以外は待って読み直し、最後まで分からなければ止める
（間違った年度や壊れたファイルで作らない）。無い年度はフォルダーで1回だけ確かめて飛ばし、読む回数を減らす。
"""
from __future__ import annotations

import datetime
import http.client
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Iterable

# ZIP でない返事が続いたときに待つ秒数（合わせて約4分）
WAITS = (15, 30, 60, 120)
# 確かめるごとにあける間（秒）
PAUSE = 0.3


def _log(*a) -> None:
    print(*a, file=sys.stderr, flush=True)


def get(url: str, ua: dict, rng: str | None = None, timeout: int = 180) -> bytes:
    """読む。通信の失敗・429・5xx は少し待って4回まで読み直す（404・403 などはそのまま HTTPError）"""
    h = dict(ua)
    if rng:
        h["Range"] = rng
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if (e.code != 429 and e.code < 500) or i == 3:
                raise
        except (urllib.error.URLError, http.client.HTTPException, ConnectionError, TimeoutError):
            if i == 3:
                raise
        time.sleep(2 * 2**i)
    raise RuntimeError("unreachable")


def _retry(url: str, why: str, wait: int | None) -> None:
    if wait is None:
        raise RuntimeError(f"国土数値情報のサーバーから確かな返事が無い（{why}）: {url}")
    _log(f"  {why}。{wait}秒待って読み直す: {url}")
    time.sleep(wait)


def exists(url: str, ua: dict) -> bool:
    """ファイルがあるか。404 なら無い、先頭が ZIP の印（PK）ならある。それ以外（確認用のページ・403 など）は待って読み直す"""
    for wait in (*WAITS, None):
        time.sleep(PAUSE)
        try:
            head = get(url, ua, "bytes=0-15")
            if head[:2] == b"PK":
                return True
            why = f"ZIP でない返事 {head[:16]!r}"
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return False
            why = f"HTTP {e.code}"
        _retry(url, why, wait)
    raise RuntimeError("unreachable")


def folder(url: str, ua: dict) -> bool:
    """年度のフォルダー（…/A13/A13-15/）があるか。404 のときだけ「無い」とする（ほかの返事はファイルを1つずつ確かめる）"""
    time.sleep(PAUSE)
    try:
        get(url, ua, "bytes=0-15")
    except urllib.error.HTTPError as e:
        return e.code != 404
    return True


def newest(base: str, code: str, prefs: Iterable[str], first: int, ua: dict) -> dict[str, int]:
    """都道府県ごとの一番新しい年度（今年から first 年度まで。無い都道府県は入れない）。
    base は "…/{code}/{code}-{yy}/{code}-{yy}_{pref}_GML.zip" の形。年度のフォルダーが無い年度は飛ばす"""
    prefs = list(prefs)
    years: dict[str, int] = {}
    for year in range(datetime.date.today().year, first - 1, -1):
        rest = [p for p in prefs if p not in years]
        if not rest:
            break
        yy = f"{year % 100:02d}"
        if not folder(base.format(code=code, yy=yy, pref=rest[0]).rsplit("/", 1)[0] + "/", ua):
            continue
        for pref in rest:
            if exists(base.format(code=code, yy=yy, pref=pref), ua):
                years[pref] = year
    return dict(sorted(years.items()))


def get_zip(url: str, ua: dict, timeout: int = 180) -> bytes:
    """ZIP を読む。中身が ZIP でなければ（確認用のページなど）待って読み直し、最後まで ZIP でなければ止める"""
    for wait in (*WAITS, None):
        time.sleep(PAUSE)
        try:
            data = get(url, ua, timeout=timeout)
            if data[:2] == b"PK":
                return data
            why = f"ZIP でない返事（{len(data)}バイト）{data[:16]!r}"
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            why = f"HTTP {e.code}"
        _retry(url, why, wait)
    raise RuntimeError("unreachable")
