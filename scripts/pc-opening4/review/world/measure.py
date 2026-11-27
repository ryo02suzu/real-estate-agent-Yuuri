#!/usr/bin/env python3
"""World critic targets (notes/world-critic-1.md) measured on a rendered reveal frame (python3 + Pillow + numpy).

  python3 measure.py frame_0600.png [frame_0600_marks.json] [--frame 600] [--cols 0.30,0.55]

marks.json is written by world.py (marks=1). The camera (pitch, lens) comes from ../../cameras.json for --frame.
Values are 8-bit display values (after the view transform). Linear contrasts use the sRGB curve as an approximation of the display transfer.
Targets are a tool, not the goal: a pass on a table does not make a picture look real.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
opts = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--") and "=" in a)
png = args[0]
marks_path = args[1] if len(args) > 1 else png.replace(".png", "_marks.json")
FRAME = int(opts.get("frame", "600"))
cam = json.load(open(os.path.join(HERE, "..", "..", "cameras.json")))["frames"][str(FRAME)]
im = np.asarray(Image.open(png).convert("RGB")).astype(np.float32)
H, W, _ = im.shape
LENS = float(opts.get("lens", cam["lens_mm"]))
FPX = LENS / 36.0 * W
PITCH = cam["pitch_deg"]
marks = {m["name"]: m for m in json.load(open(marks_path))}
luma = im @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def lin(v):
    v = np.asarray(v, dtype=np.float64) / 255.0
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def elev_of_row(y):
    return PITCH + math.degrees(math.atan((H / 2.0 - y) / FPX))


def row_of_elev(e):
    return H / 2.0 - FPX * math.tan(math.radians(e - PITCH))


def deck_distance_km(row, h=590.0, R=6371008.8):
    t = math.tan(math.radians(-elev_of_row(row)))
    s = t * t - 2 * h / R
    if t <= 0 or s < 0:
        return None
    return R * (t - math.sqrt(s)) / 1000.0


rows = []


def add(name, value, target, ok, note=""):
    rows.append((name, value, target, "PASS" if ok else "FAIL", note))


def rgb_s(v):
    return "(%d,%d,%d)" % tuple(int(round(x)) for x in v)


sun = marks["sun"]
sx, sy = sun["x"], sun["y"]
hor_elev = -math.degrees(math.sqrt(2 * 590.0 / 6371008.8))
hor_row = row_of_elev(hor_elev)
# --- sky at the top and at the horizon edges
top = im[: max(2, int(H * 0.03)), int(W * 0.3): int(W * 0.7)].reshape(-1, 3).mean(0)
add("sky top (3% rows, centre 40%)", rgb_s(top), "Y 150-175, B-R >= 45", 150 <= luma[: max(2, int(H * 0.03)), int(W * 0.3): int(W * 0.7)].mean() <= 175 and top[2] - top[0] >= 45,
    "Y=%.0f B-R=%.0f" % (luma[: max(2, int(H * 0.03)), int(W * 0.3): int(W * 0.7)].mean(), top[2] - top[0]))
hy = int(max(0, hor_row - max(3, H * 0.012)))
edge = np.concatenate([im[hy: hy + max(2, H // 60), : int(W * 0.08)].reshape(-1, 3), im[hy: hy + max(2, H // 60), int(W * 0.92):].reshape(-1, 3)]).mean(0)
ey = float(edge @ np.array([0.2126, 0.7152, 0.0722]))
add("sky at horizon edges (just above horizon)", rgb_s(edge), "Y 195-215, R-B >= 45", 195 <= ey <= 215 and edge[0] - edge[2] >= 45, "Y=%.0f R-B=%.0f" % (ey, edge[0] - edge[2]))
# --- deck column profile 5 km .. horizon
c0, c1 = (float(v) for v in opts.get("cols", "0.30,0.55").split(","))
xs = slice(int(W * c0), int(W * c1))
prof = []
for y in range(int(hor_row) + 1, H):
    d = deck_distance_km(y)
    if d is not None and 5.0 <= d <= 90.0:
        prof.append((y, d, float(np.median(luma[y, xs]))))
if len(prof) >= 6:
    ys_ = np.array([p[0] for p in prof])
    v = np.array([p[2] for p in prof])
    k = max(1, int(round(H / 180.0)))                     # window about 2 rows per 360 rows of height
    vs = np.array([v[max(0, i - k): i + k + 1].mean() for i in range(len(v))])
    steps = np.abs(np.diff(vs)) * (1.0)
    # normalise steps to per-1/180-of-height so 640 and 3840 frames can be compared
    worst = float(steps.max())
    i = int(steps.argmax())
    trend = float(vs[0] - vs[-1])                        # near minus far
    add("deck column: largest step 5 km -> horizon", "%.1f levels at %.0f km" % (worst, prof[i][1]), "<= 4 levels", worst <= 4.0, "median of columns %.2f-%.2f, %d-row window" % (c0, c1, 2 * k + 1))
    add("deck column: brighter toward the horizon", "near %.0f -> far %.0f" % (vs[0], vs[-1]), "far >= near", trend <= 0.0)
else:
    add("deck column profile", "not enough rows", "", False)
# --- sunlit / shadowed cloud colours (deck pixels within the central columns, 3 km .. 60 km)
sel = []
for y in range(int(hor_row) + 1, H):
    d = deck_distance_km(y)
    if d is not None and 3.0 <= d <= 60.0:
        sel.append(y)
if sel:
    blk = im[sel[0]: sel[-1] + 1, int(W * 0.2): int(W * 0.8)].reshape(-1, 3)
    bl = blk @ np.array([0.2126, 0.7152, 0.0722])
    # keep cloud-like pixels (not near ridges, which are much darker than any cloud in shade): shaded cloud is B > R
    cloudy = blk[(bl > 60)]
    cl = bl[(bl > 60)]
    if len(cloudy) > 50:
        hi = cloudy[cl >= np.percentile(cl, 90)].mean(0)
        lo = cloudy[cl <= np.percentile(cl, 10)].mean(0)
        add("sunlit faces (top decile of deck)", rgb_s(hi), "Y 215-245, R-B >= 35", 215 <= hi @ [0.2126, 0.7152, 0.0722] <= 245 and hi[0] - hi[2] >= 35, "R-B=%.0f" % (hi[0] - hi[2]))
        add("shadowed troughs (bottom decile of deck)", rgb_s(lo), "Y 90-130, B-R >= 25", 90 <= lo @ [0.2126, 0.7152, 0.0722] <= 130 and lo[2] - lo[0] >= 25, "B-R=%.0f" % (lo[2] - lo[0]))
# deck under the sun vs at the frame edges
band_rows = [y for y in range(int(hor_row) + 1, int(min(H, hor_row + H * 0.12)))]
if band_rows:
    under = luma[band_rows[0]: band_rows[-1] + 1, int(max(0, sx - W * 0.08)): int(min(W, sx + W * 0.08))].mean()
    edges = np.concatenate([luma[band_rows[0]: band_rows[-1] + 1, : int(W * 0.12)].ravel(), luma[band_rows[0]: band_rows[-1] + 1, int(W * 0.88):].ravel()]).mean()
    add("deck under the sun vs frame edges", "%.0f vs %.0f" % (under, edges), "under > edges", under > edges)
# --- near ridges: dark pixels in the lower half
low = luma[int(H * 0.55):]
dark = low[low < 70]
if dark.size > 100:
    add("near ridges mean (pixels < 70 in lower 45%)", "%.1f" % dark.mean(), "18-32", 18 <= dark.mean() <= 32, "%.1f%% of those rows" % (100.0 * dark.size / low.size))
    add("near ridges darkest 1%", "%.1f" % np.percentile(low, 1), "6-12", 6 <= np.percentile(low, 1) <= 12)
else:
    add("near ridges", "no dark pixels", "18-32", False)


# --- far ranges against the sky
def contrast_at(m):
    x, y = int(round(m["x"])), int(round(m["y"]))
    if not (4 <= x < W - 4 and 14 <= y < H - 30):
        return None
    sc = H / 360.0
    a, b = int(max(0, y - 18 * sc)), int(max(1, y - 9 * sc))
    sky = np.median(luma[a:b, x - 3: x + 4])
    c, d = int(y + 8 * sc), int(y + 18 * sc)
    rng = np.median(luma[c:d, x - 3: x + 4])
    return sky, rng


near_ref = float(np.percentile(low, 3)) if dark.size > 100 else 20.0
cands = [m for k, m in marks.items() if k != "sun" and m.get("depth_km")]
for want, tgt in ((20.0, "75-80 %"), (68.0, "35-45 %"), (135.0, "12-20 %")):
    m = min(cands, key=lambda q: abs(q["depth_km"] - want))
    r = contrast_at(m)
    lo_, hi_ = {20.0: (0.75, 0.80), 68.0: (0.35, 0.45), 135.0: (0.12, 0.20)}[want]
    if r is None:
        add("far range %s (%.0f km)" % (m["name"], m["depth_km"]), "off frame", tgt, False)
        continue
    sky, rng = r
    cc = (lin(sky) - lin(rng)) / max(1e-6, lin(sky) - lin(near_ref))
    add("far range %s (%.0f km): contrast left" % (m["name"], m["depth_km"]), "%.0f%% (sky %.0f, range %.0f, near ref %.0f)" % (100 * cc, sky, rng, near_ref), tgt, lo_ - 0.04 <= cc <= hi_ + 0.04)


# --- sun glow at 2 and 25 degrees (straight up from the sun)
def sky_at(theta):
    y = sy - FPX * math.tan(math.radians(theta))
    if y < 2 or y > H - 2:
        return None
    r = max(2, int(H / 180))
    return float(lin(luma[int(y) - r: int(y) + r + 1, int(sx) - r: int(sx) + r + 1].mean()))


g2, g25, g15 = sky_at(2.0), sky_at(25.0), sky_at(15.0)
if g2 and g25:
    stops = math.log2(g2 / g25)
    add("sun glow: sky at 2 deg vs 25 deg", "%.1f stops" % stops, ">= 2 stops", stops >= 2.0)
if g15 and g25:
    add("sun glow gone by ~15 deg (15 vs 25)", "%.2f stops" % math.log2(g15 / g25), "<= 0.5 stops", math.log2(g15 / g25) <= 0.5)
# --- clipped fraction outside 3.5 deg of the sun
yy, xx = np.mgrid[0:H, 0:W]
dd = np.degrees(np.hypot(xx - sx, yy - sy) / FPX)
clip = (luma > 245) & (dd > 3.5)
add("clipped pixels (Y > 245) outside 3.5 deg of the sun", "%.2f%%" % (100 * clip.mean()), "~0", clip.mean() < 0.003)
mx = float(luma.min())
add("darkest pixel / 1st percentile", "%.0f / %.0f" % (mx, np.percentile(luma, 1)), "min <= 12", mx <= 12)

w = max(len(r[0]) for r in rows)
print("%-*s  %-44s  %-24s  %s" % (w, "measure", "value", "target", "result"))
for r in rows:
    print("%-*s  %-44s  %-24s  %s %s" % (w, r[0], r[1], r[2], r[3], r[4]))
print("horizon row %.1f of %d, sun at (%.0f,%.0f), %d pass / %d" % (hor_row, H, sx, sy, sum(1 for r in rows if r[3] == "PASS"), len(rows)))
