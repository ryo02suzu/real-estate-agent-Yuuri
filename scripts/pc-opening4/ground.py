#!/usr/bin/env python3
"""地面の材質（岩・雪・ガレ）と素材の取得・空と光。第4版 PLAN 3 章。bpy は使う関数の中で読む。

  python ground.py assets     # Poly Haven（CC0）の岩の素材を WORK/ground4/ に取る
素材の出所とライセンス（https://polyhaven.com/license ・CC0 1.0）は ASSETS.md に書く。
"""
from __future__ import annotations

import json
import math
import os
import sys
import time
import urllib.request

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import config  # noqa: E402

GDIR = os.path.join(str(config.WORK), "ground4")
UA = "Mozilla/5.0 (compatible; asset-fetch/1.0)"

# 岩の面の素材。穂高の岩は灰色〜茶灰色の安山岩・溶結凝灰岩（さびの色と暗い地衣類の斑）
TEXTURES = {
    "rock_a": "rock_face_04",   # 暗い茶灰色。割れ目が多い
    "rock_b": "quarry_wall",    # 茶灰色。ざらざら
    "rock_c": "dark_rock_02",   # 暗い灰色。層のような筋
    "scree": "gray_rocks",      # 角ばった灰色の石ころ（ガレ）
}
# 置く岩（立体）。細かい割れ目のある灰色〜茶色のもの
MODELS = ["boulder_01", "rock_07", "rock_09", "moon_rock_01", "moon_rock_03", "moon_rock_05", "moon_rock_07",
          "namaqualand_cliff_02", "namaqualand_boulder_03", "namaqualand_boulder_04", "namaqualand_boulder_06",
          "rock_face_01", "rock_face_02", "mountainside", "stone_01"]


def api(path):
    req = urllib.request.Request("https://api.polyhaven.com/" + path, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def get(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=300) as r, open(path + ".part", "wb") as f:
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    f.write(b)
            os.replace(path + ".part", path)
            return
        except Exception as e:
            print("  もう一度", e, flush=True)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("取れなかった " + url)


def fetch_texture(name, res="2k"):
    files = api(f"files/{name}")
    out = os.path.join(GDIR, "tex", name)
    for m in ("Diffuse", "Rough", "Displacement"):
        if m in files and res in files[m]:
            f = files[m][res].get("jpg") or files[m][res].get("png")
            get(f["url"], os.path.join(out, m + os.path.splitext(f["url"])[1]))
    _info(name, out)


def fetch_model(name, res="1k"):
    files = api(f"files/{name}")
    out = os.path.join(GDIR, "models", name)
    b = files["blend"][res]["blend"]
    get(b["url"], os.path.join(out, f"{name}.blend"))
    for rel, inc in b.get("include", {}).items():
        get(inc["url"], os.path.join(out, rel))
    _info(name, out)


def _info(name, out):
    info = api(f"info/{name}")
    json.dump({"name": info.get("name"), "authors": info.get("authors"), "license": "CC0 1.0 (https://polyhaven.com/license)",
               "source": f"https://polyhaven.com/a/{name}"}, open(os.path.join(out, "info.json"), "w"), ensure_ascii=False)
    print(name, flush=True)




# ---------------------------------------------------------------------------------------------
# ここから Blender（bpy）
# ---------------------------------------------------------------------------------------------
def _tex_file(name, kind):
    d = os.path.join(GDIR, "tex", name)
    for f in sorted(os.listdir(d)):
        if f.startswith(kind):
            return os.path.join(d, f)
    raise FileNotFoundError(f"{name} {kind}")


def _mean_linear(path):
    from PIL import Image
    im = Image.open(path).convert("RGB")
    im.thumbnail((128, 128))
    a = (np.asarray(im).astype(np.float64) / 255.0) ** 2.2
    return a.reshape(-1, 3).mean(0)


class NB:
    """ノードを足す小さな道具"""

    def __init__(self, nt):
        self.nt = nt
        self.x = 0

    def n(self, kind, label=None, **props):
        node = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(node, k, v)
        if label:
            node.label = label
        return node

    def link(self, out, inp):
        self.nt.links.new(out, inp)

    def val(self, v, name=None):
        node = self.n("ShaderNodeValue")
        node.outputs[0].default_value = v
        return node.outputs[0]

    def math(self, op, a, b=None, clamp=False, c=None):
        node = self.n("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                node.inputs[i].default_value = v
            else:
                self.link(v, node.inputs[i])
        return node.outputs[0]

    def vmath(self, op, a, b=None):
        node = self.n("ShaderNodeVectorMath", operation=op)
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (tuple, list)):
                node.inputs[i].default_value = v
            else:
                self.link(v, node.inputs[i])
        return node.outputs[0] if op not in ("DOT_PRODUCT", "LENGTH", "DISTANCE") else node.outputs["Value"]

    def mix(self, blend, fac, a, b):
        node = self.n("ShaderNodeMix", data_type="RGBA", blend_type=blend)
        if isinstance(fac, (int, float)):
            node.inputs[0].default_value = fac
        else:
            self.link(fac, node.inputs[0])
        for idx, v in ((6, a), (7, b)):
            if isinstance(v, (tuple, list)):
                node.inputs[idx].default_value = tuple(v) + (1.0,) * (4 - len(v))
            else:
                self.link(v, node.inputs[idx])
        return node.outputs[2]

    def smooth(self, x, lo, hi):
        """smoothstep（Map Range の滑らかなほう）"""
        node = self.n("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP", clamp=True)
        for i, v in ((0, x), (1, lo), (2, hi)):
            if isinstance(v, (int, float)):
                node.inputs[i].default_value = v
            else:
                self.link(v, node.inputs[i])
        return node.outputs[0]

    def noise(self, vec, scale, detail=3.0, rough=0.55, distortion=0.0):
        node = self.n("ShaderNodeTexNoise", noise_dimensions="3D")
        node.inputs["Scale"].default_value = scale
        node.inputs["Detail"].default_value = detail
        node.inputs["Roughness"].default_value = rough
        node.inputs["Distortion"].default_value = distortion
        self.link(vec, node.inputs["Vector"])
        return node.outputs["Fac"]

    def attr(self, name, col=False):
        node = self.n("ShaderNodeAttribute", attribute_name=name, attribute_type="GEOMETRY")
        return node.outputs["Color"] if col else node.outputs["Fac"]


def _load_image(path, noncolor):
    import bpy
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = "Non-Color" if noncolor else "sRGB"
    return img


def block_height(b, vec, L, rot, aniso, amp, edge=True):
    """割れ目で区切られた岩のかたまりの高さ（m）。ボロノイの「縁までの距離」で溝、細胞ごとの乱数で段差"""
    mp = b.n("ShaderNodeMapping", vector_type="POINT")
    mp.inputs["Scale"].default_value = (1.0 / (L * aniso), 1.0 / L, 1.0 / L)
    mp.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(rot))
    b.link(vec, mp.inputs["Vector"])
    vc = b.n("ShaderNodeTexVoronoi", voronoi_dimensions="3D", feature="F1")
    b.link(mp.outputs["Vector"], vc.inputs["Vector"])
    sep = b.n("ShaderNodeSeparateXYZ")
    b.link(vc.outputs["Color"], sep.inputs["Vector"])
    h = b.math("MULTIPLY", sep.outputs["X"], 0.7)
    if edge:
        ve = b.n("ShaderNodeTexVoronoi", voronoi_dimensions="3D", feature="DISTANCE_TO_EDGE")
        b.link(mp.outputs["Vector"], ve.inputs["Vector"])
        h = b.math("ADD", h, b.math("MULTIPLY", b.smooth(ve.outputs["Distance"], 0.0, 0.13), 0.5))
    return b.math("MULTIPLY", h, amp)


def snow_bsdf(b, pos, sparkle=True, base_color=None):
    """新雪の面：白に近い拡散＋ごく浅い内部散乱。きめと、風でできたゆるいうねりの凹凸。きらめきは細かい粒だけ"""
    pr = b.n("ShaderNodeBsdfPrincipled")
    if base_color is None:
        pr.inputs["Base Color"].default_value = (0.86, 0.89, 0.95, 1.0)
    else:
        b.link(base_color, pr.inputs["Base Color"])
    pr.inputs["Roughness"].default_value = 0.62
    pr.inputs["Specular IOR Level"].default_value = 0.35
    pr.inputs["Subsurface Weight"].default_value = 0.45
    pr.inputs["Subsurface Radius"].default_value = (0.045, 0.022, 0.012)
    pr.inputs["Subsurface Scale"].default_value = 1.0
    # 凹凸：うねり（0.5〜3m）と粒（1cm）
    n1 = b.noise(pos, 0.8, 4, 0.5)
    n2 = b.noise(pos, 70.0, 2, 0.6)
    bp1 = b.n("ShaderNodeBump")
    bp1.inputs["Distance"].default_value = 0.11
    bp1.inputs["Strength"].default_value = 0.75
    b.link(n1, bp1.inputs["Height"])
    bp2 = b.n("ShaderNodeBump")
    bp2.inputs["Distance"].default_value = 0.004
    bp2.inputs["Strength"].default_value = 0.35
    b.link(n2, bp2.inputs["Height"])
    b.link(bp1.outputs["Normal"], bp2.inputs["Normal"])
    b.link(bp2.outputs["Normal"], pr.inputs["Normal"])
    if not sparkle:
        return pr.outputs["BSDF"]
    # きらめき：粒ごとにランダムな向きの小さな鏡面。太陽の向きに合った粒だけ光る
    q = b.vmath("SNAP", b.vmath("MULTIPLY", pos, (140.0, 140.0, 140.0)), (1.0, 1.0, 1.0))
    wn = b.n("ShaderNodeTexWhiteNoise", noise_dimensions="3D")
    b.link(q, wn.inputs["Vector"])
    nrm = b.n("ShaderNodeNewGeometry").outputs["Normal"]
    rnd = b.vmath("ADD", nrm, b.vmath("MULTIPLY", b.vmath("SUBTRACT", wn.outputs["Color"], (0.5, 0.5, 0.5)), (1.1, 1.1, 1.1)))
    gl = b.n("ShaderNodeBsdfGlossy")
    gl.inputs["Roughness"].default_value = 0.08
    gl.inputs["Color"].default_value = (1, 1, 1, 1)
    b.link(b.vmath("NORMALIZE", rnd), gl.inputs["Normal"])
    mx = b.n("ShaderNodeMixShader")
    mx.inputs[0].default_value = 0.07
    b.link(pr.outputs["BSDF"], mx.inputs[1])
    b.link(gl.outputs["BSDF"], mx.inputs[2])
    return mx.outputs["Shader"]


def build_terrain_material(offset=(0.0, 0.0), rock_gain=0.8, haze=5.0e-5, sun_az=115.0, sun_el=5.0, altitude=3000.0):
    """地面の材質：岩の素材（3 方向から貼り、3 つの大きさを重ねる）＋ガレ＋新雪＋木のある所の色。
    offset：メッシュの原点の本当の東・北（m）。見る場所が変わっても柄が動かないように足す"""
    import bpy
    mat = bpy.data.materials.new("terrain_rock_snow")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    b = NB(nt)
    out = b.n("ShaderNodeOutputMaterial")
    geo = b.n("ShaderNodeNewGeometry")
    tc = b.n("ShaderNodeTexCoord")
    base = b.vmath("ADD", tc.outputs["Object"], (offset[0], offset[1], 0.0))
    pos = geo.outputs["Position"]
    nrm = geo.outputs["Normal"]

    def tri(name, kind, size, rotz, off, noncolor):
        img = _load_image(_tex_file(name, kind), noncolor)
        mp = b.n("ShaderNodeMapping", vector_type="POINT")
        mp.inputs["Scale"].default_value = (1.0 / size,) * 3
        mp.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(rotz))
        mp.inputs["Location"].default_value = (off[0] / size, off[1] / size, off[2] / size)
        b.link(base, mp.inputs["Vector"])
        t = b.n("ShaderNodeTexImage", image=img, projection="BOX", projection_blend=0.22, interpolation="Linear")
        b.link(mp.outputs["Vector"], t.inputs["Vector"])
        return t.outputs["Color"]

    def rel(name, size, rotz, off):
        """色 ÷ 平均（平均 1 の変化分）"""
        c = tri(name, "Diffuse", size, rotz, off, False)
        m = _mean_linear(_tex_file(name, "Diffuse"))
        return b.vmath("MULTIPLY", c, tuple(float(1.0 / max(x, 1e-3)) for x in m)), m

    def hgt(name, size, rotz, off):
        c = tri(name, "Displacement", size, rotz, off, True)
        return b.math("ADD", b.vmath("SEPARATE_XYZ", c) if False else c, 0.0) if False else _bw(b, c)

    def _bw(bb, c):
        n = bb.n("ShaderNodeRGBToBW")
        bb.link(c, n.inputs["Color"])
        return n.outputs["Val"]

    A, B, C, D = TEXTURES["rock_a"], TEXTURES["rock_b"], TEXTURES["rock_c"], TEXTURES["scree"]
    sizes = (2.3, 6.9, 19.7)            # 互いに割り切れない 3 つの大きさ
    # --- 色（岩 A：3 段、B・C：2 段）
    def rock_color(name, szs, rots, offs, gains):
        f_big, m = rel(name, szs[0], rots[0], offs[0])
        col = b.vmath("MULTIPLY", f_big, tuple(float(x) for x in m))
        for sz, rt, of, gn in zip(szs[1:], rots[1:], offs[1:], gains):
            f, _ = rel(name, sz, rt, of)
            col = b.mix("MULTIPLY", gn, col, f)
        return col
    cA = rock_color(A, (19.7, 6.9, 2.3), (71, 37, 0), ((3, 17, 5), (11, 2, 9), (0, 0, 0)), (0.8, 0.65))
    cB = rock_color(B, (23.3, 7.7), (13, 53), ((7, 1, 3), (2, 9, 4)), (0.75,))
    cC = rock_color(C, (17.3, 5.3), (91, 22), ((1, 5, 8), (6, 3, 2)), (0.75,))
    cD = rock_color(D, (11.0, 3.7), (47, 9), ((4, 2, 0), (1, 3, 6)), (0.55,))
    # 大きな色むら：A（暗い茶灰）・B（茶灰）・C（暗い灰の層）を雑音で混ぜる
    nb = b.noise(base, 1.0 / 75.0, 3, 0.55, 0.35)
    nc = b.noise(base, 1.0 / 31.0, 3, 0.55, 0.6)
    wB = b.smooth(nb, 0.42, 0.60)
    wC = b.smooth(nc, 0.52, 0.66)
    col = b.mix("MIX", wB, cA, cB)
    col = b.mix("MIX", wC, col, cC)
    # ガレ：中くらいの傾きの岩の地面に、まだらに
    nz = b.n("ShaderNodeSeparateXYZ")
    b.link(nrm, nz.inputs["Vector"])
    nzz = nz.outputs["Z"]
    nd = b.noise(base, 1.0 / 23.0, 2, 0.5, 0.4)
    wD = b.math("MULTIPLY", b.smooth(nzz, 0.78, 0.96), b.smooth(nd, 0.58, 0.72))
    wD = b.math("MULTIPLY", wD, b.math("SUBTRACT", 1.0, b.smooth(nzz, 0.965, 0.995)))
    col = b.mix("MIX", b.math("MULTIPLY", wD, 0.6), col, cD)
    # 地衣類（暗い斑）とさび色（鉄分）・日焼け
    nl = b.noise(base, 1.0 / 5.0, 5, 0.6, 0.5)
    lich = b.math("MULTIPLY", b.smooth(nl, 0.60, 0.72), 0.6)
    col = b.mix("MIX", lich, col, (0.05, 0.05, 0.045))
    nr = b.noise(base, 1.0 / 13.0, 4, 0.6, 0.5)
    rust = b.math("MULTIPLY", b.smooth(nr, 0.57, 0.70), 0.5)
    col = b.mix("MULTIPLY", rust, col, (1.55, 0.95, 0.60))
    # 色合い：写真の大きな色むら（頂点の色）・割れ目の暗さ
    tint = b.attr("tint", col=True)
    col = b.mix("MULTIPLY", 1.0, col, tint)
    crack = b.attr("crack")
    col = b.mix("MULTIPLY", b.math("MULTIPLY", crack, 0.62), col, (0.30, 0.28, 0.27))
    hs = b.n("ShaderNodeHueSaturation")
    hs.inputs["Saturation"].default_value = 0.36
    hs.inputs["Value"].default_value = rock_gain
    b.link(col, hs.inputs["Color"])
    rock_col = b.mix("MULTIPLY", 1.0, hs.outputs["Color"], (1.0, 0.92, 0.86))
    # --- 凹凸（岩 A の高さ 3 段＋ガレ）。近くで細かく、遠くでは細かい凹凸を弱める
    cam = b.n("ShaderNodeCameraData")
    dist = cam.outputs["View Distance"]
    hA3 = hgt(A, 19.7, 71, (3, 17, 5))
    hA2 = hgt(A, 6.9, 37, (11, 2, 9))
    hA1 = hgt(A, 2.3, 0, (0, 0, 0))
    f_near = b.math("SUBTRACT", 1.0, b.smooth(dist, 60.0, 400.0))
    f_mid = b.math("SUBTRACT", 1.0, b.smooth(dist, 400.0, 2600.0))
    # 割れ目のかたまりの凹凸（遠くでも岩の割れ方が見えるように大きめ）。細かい 2 段は重いので省く
    jb = base
    hb_ = b.math("ADD", block_height(b, jb, 24.0, 38.0, 1.5, 5.0, edge=False), block_height(b, jb, 8.7, 118.0, 1.6, 1.8))
    bpb = b.n("ShaderNodeBump")
    bpb.inputs["Distance"].default_value = 1.0
    bpb.inputs["Strength"].default_value = 1.0
    b.link(hb_, bpb.inputs["Height"])
    b.link(nrm, bpb.inputs["Normal"])
    nrm_b = bpb.outputs["Normal"]
    for h, d, s, f in ((hA3, 1.0, 0.9, None), (hA2, 0.3, 0.8, f_mid), (hA1, 0.04, 0.45, f_near)):
        bp = b.n("ShaderNodeBump")
        bp.inputs["Distance"].default_value = d
        bp.inputs["Strength"].default_value = s
        b.link(h, bp.inputs["Height"])
        b.link(nrm_b, bp.inputs["Normal"])
        nrm_b = bp.outputs["Normal"]
    # --- 岩の BSDF
    rk = b.n("ShaderNodeBsdfPrincipled")
    b.link(rock_col, rk.inputs["Base Color"])
    rk.inputs["Roughness"].default_value = 0.86
    rk.inputs["Specular IOR Level"].default_value = 0.3
    b.link(nrm_b, rk.inputs["Normal"])
    # --- 木のある所（頂点の veg）：標高で色を変える（上：ハイマツ＝暗い緑、下：カラマツの金と針葉樹の暗緑）
    veg = b.attr("veg")
    z = b.n("ShaderNodeSeparateXYZ")
    b.link(pos, z.inputs["Vector"])
    zz = z.outputs["Z"]
    nf = b.noise(base, 1.0 / 0.9, 4, 0.6)
    n3 = b.noise(base, 1.0 / 6.0, 3, 0.5, 0.3)
    nl2 = b.noise(base, 1.0 / 38.0, 3, 0.5, 0.5)
    gold = b.smooth(nl2, 0.56, 0.70)
    low = b.math("SUBTRACT", 1.0, b.smooth(zz, 2000.0, 2330.0))
    larch = b.math("MULTIPLY", b.math("MULTIPLY", gold, low), 0.5)
    veg_dark = b.mix("MIX", b.smooth(n3, 0.3, 0.7), (0.010, 0.017, 0.010), (0.030, 0.040, 0.021))
    veg_col = b.mix("MIX", larch, veg_dark, (0.085, 0.055, 0.018))
    veg_col = b.mix("MULTIPLY", 1.0, veg_col, b.mix("MIX", b.smooth(nf, 0.2, 0.8), (0.45, 0.45, 0.45), (1.5, 1.5, 1.5)))
    vg = b.n("ShaderNodeBsdfPrincipled")
    b.link(veg_col, vg.inputs["Base Color"])
    vg.inputs["Roughness"].default_value = 0.95
    vg.inputs["Specular IOR Level"].default_value = 0.15
    vg.inputs["Normal"].default_value = (0, 0, 0)
    b.link(nrm, vg.inputs["Normal"])
    mv = b.n("ShaderNodeMixShader")
    b.link(b.smooth(veg, 0.25, 0.65), mv.inputs[0])
    b.link(rk.outputs["BSDF"], mv.inputs[1])
    b.link(vg.outputs["BSDF"], mv.inputs[2])
    # --- 雪：頂点の snow に、細かい雑音・岩の凹凸の高さ・凹凸後の上向きの度合いで縁をほぐす
    snow_v = b.attr("snow")
    ns1 = b.noise(base, 1.0 / 0.045, 4, 0.6)
    ns2 = b.noise(base, 1.0 / 1.6, 4, 0.55, 0.3)
    hcomb = b.math("ADD", b.math("MULTIPLY", hA1, 0.45), b.math("MULTIPLY", hA2, 0.55))
    nzb = b.n("ShaderNodeSeparateXYZ")
    b.link(nrm_b, nzb.inputs["Vector"])
    up = b.smooth(nzb.outputs["Z"], 0.50, 0.86)
    s = b.math("ADD", snow_v, b.math("MULTIPLY", b.math("SUBTRACT", ns1, 0.5), 0.55))
    ns3 = b.noise(base, 1.0 / 9.0, 4, 0.6, 0.4)
    s = b.math("ADD", s, b.math("MULTIPLY", b.math("SUBTRACT", ns3, 0.5), 0.45))
    s = b.math("ADD", s, b.math("MULTIPLY", b.math("SUBTRACT", ns2, 0.5), 0.30))
    s = b.math("ADD", s, b.math("MULTIPLY", b.math("SUBTRACT", 0.5, hcomb), 0.55))
    s_raw = s
    s = b.math("MULTIPLY", b.smooth(s, 0.18, 0.44), up)
    s = b.math("MULTIPLY", s, b.smooth(zz, 2400.0, 2600.0))
    thin = b.mix("MIX", b.smooth(s_raw, 0.30, 0.70), b.vmath("MULTIPLY", rock_col, (3.0, 3.0, 3.0)), (0.86, 0.89, 0.95))
    sn = snow_bsdf(b, base, base_color=thin)
    ms = b.n("ShaderNodeMixShader")
    b.link(s, ms.inputs[0])
    b.link(mv.outputs["Shader"], ms.inputs[1])
    b.link(sn, ms.inputs[2])
    # 空気のかすみ：距離 d で T=exp(-σd)。見えなくなった分は、その向きの空の色に置き換える（遠くが青く柔らかくなる）
    final = ms.outputs["Shader"]
    if haze > 0:
        inc = b.n("ShaderNodeNewGeometry").outputs["Incoming"]
        sk = b.n("ShaderNodeTexSky", sky_type="MULTIPLE_SCATTERING", sun_disc=False)
        sk.sun_elevation = math.radians(sun_el)
        sk.sun_rotation = math.radians(sun_az)
        sk.altitude = altitude
        sk.air_density = 1.0
        sk.aerosol_density = 0.7
        b.link(b.vmath("SCALE", inc, -1.0) if False else b.vmath("MULTIPLY", inc, (-1.0, -1.0, -1.0)), sk.inputs["Vector"])
        em = b.n("ShaderNodeEmission")
        em.inputs["Strength"].default_value = 1.0
        b.link(sk.outputs["Color"], em.inputs["Color"])
        tr = b.math("EXPONENT", 2.718281828, b.math("MULTIPLY", dist, -haze))
        mh = b.n("ShaderNodeMixShader")
        b.link(b.math("SUBTRACT", 1.0, tr), mh.inputs[0])
        b.link(final, mh.inputs[1])
        b.link(em.outputs["Emission"], mh.inputs[2])
        final = mh.outputs["Shader"]
    b.link(final, out.inputs["Surface"])
    return mat


def add_snow_overlay(mat, tint_sat=0.6, gain=0.8):
    """置く岩の素材（Poly Haven のスキャン）に、灰色寄りの色合わせと新雪（上を向いた面・くぼみ）を足す"""
    import bpy
    nt = mat.node_tree
    out = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeOutputMaterial" and n.is_active_output)
    src = out.inputs["Surface"].links[0].from_node if out.inputs["Surface"].links else None
    if src is None or src.bl_idname != "ShaderNodeBsdfPrincipled":
        return
    b = NB(nt)
    # 色合わせ：彩度を落とし、岩ごとに明るさを変える
    bc = src.inputs["Base Color"]
    hs = b.n("ShaderNodeHueSaturation")
    hs.inputs["Saturation"].default_value = tint_sat
    oi = b.n("ShaderNodeObjectInfo")
    rnd = oi.outputs["Random"]
    hs.inputs["Value"].default_value = gain
    b.link(b.math("ADD", 0.78, b.math("MULTIPLY", rnd, 0.4)), hs.inputs["Value"])
    if bc.links:
        b.link(bc.links[0].from_socket, hs.inputs["Color"])
    else:
        hs.inputs["Color"].default_value = bc.default_value
    b.link(hs.outputs["Color"], bc)
    geo = b.n("ShaderNodeNewGeometry")
    pos = geo.outputs["Position"]
    nz = b.n("ShaderNodeSeparateXYZ")
    b.link(geo.outputs["Normal"], nz.inputs["Vector"])
    zz = b.n("ShaderNodeSeparateXYZ")
    b.link(pos, zz.inputs["Vector"])
    ao = b.n("ShaderNodeAmbientOcclusion", samples=4, inside=False)
    ao.inputs["Distance"].default_value = 0.6
    n1 = b.noise(pos, 6.0, 4, 0.55)
    n2 = b.noise(pos, 70.0, 3, 0.6)
    s = b.math("ADD", b.smooth(nz.outputs["Z"], 0.55, 0.9), b.math("MULTIPLY", b.math("SUBTRACT", n2, 0.5), 0.5))
    s = b.math("ADD", s, b.math("MULTIPLY", b.math("SUBTRACT", n1, 0.5), 0.35))
    s = b.math("ADD", s, b.math("MULTIPLY", b.math("SUBTRACT", 1.0, ao.outputs["AO"]), 0.35))
    s = b.math("MULTIPLY", b.smooth(s, 0.62, 0.8), b.smooth(zz.outputs["Z"], 2400.0, 2600.0))
    sn = snow_bsdf(b, pos, sparkle=False)
    ms = b.n("ShaderNodeMixShader")
    b.link(s, ms.inputs[0])
    b.link(src.outputs["BSDF"], ms.inputs[1])
    b.link(sn, ms.inputs[2])
    b.link(ms.outputs["Shader"], out.inputs["Surface"])


def load_rock_models(log=print):
    """Poly Haven の岩（CC0）を読み、大きさ 1m（最大の辺）・原点は底の真ん中の少し上にそろえる。返す：[(名前, mesh, 種類)]"""
    import bpy
    from mathutils import Matrix
    out = []
    for name in MODELS:
        path = os.path.join(GDIR, "models", name, f"{name}.blend")
        with bpy.data.libraries.load(path, link=False) as (src, dst):
            dst.objects = list(src.objects)
        objs = [o for o in dst.objects if o is not None and o.type == "MESH"]
        # 同じ岩の細かさ違い（LOD0〜）をまとめ、面の多い順に並べる。大きさ・原点は最も細かいものでそろえる
        objs.sort(key=lambda o: -len(o.data.polygons))
        groups = {}
        for o in objs:
            key = o.name.split("_LOD")[0] if "_LOD" in o.name else o.name
            groups.setdefault(key, []).append(o)
        for key, lst in groups.items():
            ref = lst[0].data
            co = np.empty(len(ref.vertices) * 3, np.float32)
            ref.vertices.foreach_get("co", co)
            co = (np.array(lst[0].matrix_world.to_3x3()) @ co.reshape(-1, 3).T).T
            lo, hi = co.min(0), co.max(0)
            ctr = np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2] + 0.15 * (hi[2] - lo[2])])
            sc = 1.0 / float(max(hi - lo))
            meshes = []
            for o in lst:
                m = o.data
                m.transform(o.matrix_world)
                m.transform(Matrix.Translation(-ctr))
                m.transform(Matrix.Diagonal((sc, sc, sc, 1.0)))
                m.update()
                for mt in m.materials:
                    if mt is not None and mt.use_nodes:
                        add_snow_overlay(mt)
                meshes.append(m)
            kind = "cliff" if name in ("rock_face_01", "rock_face_02", "mountainside", "namaqualand_cliff_02") else "rock"
            out.append((f"{name}_{key}", meshes, kind))
            log(f"  岩 {name}/{key}: {[len(m.polygons) for m in meshes]} 面 / 高さ比 {(hi[2] - lo[2]) / max(hi - lo):.2f}")
    return out


def make_world(sun_az=115.0, sun_el=5.0, altitude=3000.0, haze=0.0, sky_strength=1.0):
    """空：Blender の空（多重散乱）。太陽の方位・高さ。体積のうすいかすみ（遠くが青く柔らかくなる）"""
    import bpy
    w = bpy.data.worlds.new("sky")
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_elevation = math.radians(sun_el)
    sky.sun_rotation = math.radians(sun_az)      # 北から時計まわり（試して確かめ済み：animatic.py と同じ）
    sky.altitude = altitude
    sky.air_density = 1.0
    sky.aerosol_density = 0.7
    sky.ozone_density = 1.0
    sky.sun_disc = True
    sky.sun_size = math.radians(0.545)
    sky.sun_intensity = 1.0
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = sky_strength
    ow = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], ow.inputs["Surface"])
    if haze > 0:
        sc = nt.nodes.new("ShaderNodeVolumeScatter")
        sc.inputs["Density"].default_value = haze
        sc.inputs["Color"].default_value = (0.78, 0.88, 1.0, 1.0)
        sc.inputs["Anisotropy"].default_value = 0.45
        nt.links.new(sc.outputs["Volume"], ow.inputs["Volume"])
    return w


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "assets":
    for n in TEXTURES.values():
        fetch_texture(n)
    for n in MODELS:
        fetch_model(n)
