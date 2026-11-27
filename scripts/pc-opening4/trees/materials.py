"""カラマツの材質（bpy）：樹皮・小枝・針（と焼いたカード）。

樹皮：UV は 1 単位＝0.5m（円周は整数枚）。大きな板状のはがれ（ボロノイの縁）と深い割れ目を凹凸（バンプ）にして、
      2m まで寄っても持つ大きさ（板 約 10cm × 30cm）にしてある。細い枝（半径 1.2〜3cm 未満）はなめらかな小枝の色に切り替わる。
      頂点の属性 radius（半径）・dead（枯れ枝）で切り替える。
針：薄く、すこしつやがあり、逆光でうっすら透ける（拡散＋透過）。頂点の属性
      tone（木ごとの色。0=緑がかった金 … 1=さび色）と tint（針 1 本ごとのずれ）で色が決まる。
カード：焼いた小枝の束の絵（atlas）を貼る。色は tone で針と同じ色に寄せる。
"""
import bpy
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ATLAS = os.path.join(HERE, "atlas", "larch-cards.png")

# tone の色の段（線形色）：緑がかった金 → 金黄 → 深い金 → 橙がかった金 → さび色
TONE_STOPS = [
    (0.00, (0.55, 0.55, 0.024)),    # 黄緑（色相 約 60 度）
    (0.25, (0.73, 0.56, 0.030)),    # 明るい金（52 度）
    (0.50, (0.75, 0.47, 0.028)),    # 金（45 度）。日なたの針の中心 sRGB 約 (225,185,48)。低い太陽の橙色の光と AgX で橙寄りに見えるぶん、黄色寄りに置く
    (0.75, (0.72, 0.36, 0.026)),    # こがね〜だいだい（38 度）
    (1.00, (0.58, 0.21, 0.020)),    # さび色（32 度）
]
# カード絵（atlas/larch-cards.png）を焼いたときの色の段。カードは「いまの色 ÷ 焼いた色」で寄せるので、段を変えても絵は焼き直さなくてよい
BAKED_STOPS = [
    (0.00, (0.60, 0.58, 0.022)),
    (0.25, (0.75, 0.51, 0.026)),
    (0.50, (0.75, 0.40, 0.026)),
    (0.75, (0.73, 0.30, 0.026)),
    (1.00, (0.58, 0.19, 0.020)),
]
BAKE_TONE = 0.5      # カードの絵を焼いたときの tone（材質側でこの色との比で寄せる）


def _new(nt, kind, loc=(0, 0), **kw):
    n = nt.nodes.new(kind)
    n.location = loc
    for k, v in kw.items():
        setattr(n, k, v)
    return n


def _ramp(nt, stops, loc):
    r = _new(nt, "ShaderNodeValToRGB", loc)
    cr = r.color_ramp
    while len(cr.elements) > len(stops):
        cr.elements.remove(cr.elements[-1])
    while len(cr.elements) < len(stops):
        cr.elements.new(0.5)
    for e, (p, c) in zip(cr.elements, stops):
        e.position = p
        e.color = (c[0], c[1], c[2], 1.0)
    cr.interpolation = "LINEAR"
    return r


def _math(nt, op, a=None, b=None, loc=(0, 0), clamp=False):
    m = _new(nt, "ShaderNodeMath", loc, operation=op, use_clamp=clamp)
    for i, v in ((0, a), (1, b)):
        if v is None:
            continue
        if hasattr(v, "outputs"):
            o = v.outputs["Fac"] if v.bl_idname == "ShaderNodeAttribute" else v.outputs[0]
            nt.links.new(o, m.inputs[i])
        else:
            m.inputs[i].default_value = v
    return m


def _attr(nt, name, loc):
    return _new(nt, "ShaderNodeAttribute", loc, attribute_type="GEOMETRY", attribute_name=name)


def bark_material():
    """樹皮：縦に長いうろこ状の板（幅 約 5cm・長さ 約 20cm）。灰褐色。割れ目と はがれた跡だけ赤褐色。
    遠く（40m〜）では模様がとけて平均色になる。木ごとに明るさ ±15%、上のほうに地衣類（灰緑）、根元に苔。"""
    name = "larch_bark"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = _new(nt, "ShaderNodeOutputMaterial", (2400, 0))
    bsdf = _new(nt, "ShaderNodeBsdfPrincipled", (2100, 0))
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    uv = _new(nt, "ShaderNodeTexCoord", (-1600, 0))
    sepuv = _new(nt, "ShaderNodeSeparateXYZ", (-1400, -600))
    nt.links.new(uv.outputs["UV"], sepuv.inputs[0])
    hm = _math(nt, "MULTIPLY", None, 0.5, (-1200, -600))          # UV の v 1 = 0.5m → 根元からの高さ(m)
    nt.links.new(sepuv.outputs[1], hm.inputs[0])
    warp = _new(nt, "ShaderNodeTexNoise", (-1400, 200), noise_dimensions="3D")
    warp.inputs["Scale"].default_value = 3.0
    warp.inputs["Detail"].default_value = 3.0
    nt.links.new(uv.outputs["UV"], warp.inputs["Vector"])
    wsc = _new(nt, "ShaderNodeVectorMath", (-1200, 150), operation="SCALE")
    wsc.inputs["Scale"].default_value = 0.06
    nt.links.new(warp.outputs["Color"], wsc.inputs[0])
    add = _new(nt, "ShaderNodeVectorMath", (-1000, 0), operation="ADD")
    nt.links.new(uv.outputs["UV"], add.inputs[0])
    nt.links.new(wsc.outputs[0], add.inputs[1])
    sc = _new(nt, "ShaderNodeMapping", (-800, 0))
    sc.inputs["Scale"].default_value = (7.0, 1.5, 1.0)            # 板 幅 7cm × 長さ 33cm（細長いうろこ板）
    nt.links.new(add.outputs[0], sc.inputs["Vector"])
    vor = _new(nt, "ShaderNodeTexVoronoi", (-550, 150), voronoi_dimensions="3D", feature="DISTANCE_TO_EDGE")
    nt.links.new(sc.outputs[0], vor.inputs["Vector"])
    vor2 = _new(nt, "ShaderNodeTexVoronoi", (-550, -100), voronoi_dimensions="3D", feature="F1")
    nt.links.new(sc.outputs[0], vor2.inputs["Vector"])
    cellr = _new(nt, "ShaderNodeSeparateColor", (-350, -100))
    nt.links.new(vor2.outputs["Color"], cellr.inputs[0])
    plate = _new(nt, "ShaderNodeMapRange", (-350, 200))
    plate.inputs["From Min"].default_value = 0.012
    plate.inputs["From Max"].default_value = 0.11
    plate.clamp = True
    nt.links.new(vor.outputs["Distance"], plate.inputs["Value"])
    # はがれた跡の板（全体の約 13%）
    scar = _new(nt, "ShaderNodeMapRange", (-150, -100))
    scar.inputs["From Min"].default_value = 0.09
    scar.inputs["From Max"].default_value = 0.12
    scar.data_type = "FLOAT"
    scar.inputs["To Min"].default_value = 1.0
    scar.inputs["To Max"].default_value = 0.0
    scar.clamp = True
    nt.links.new(cellr.outputs[0], scar.inputs["Value"])
    # 1〜3mm のざらつき
    fine = _new(nt, "ShaderNodeTexNoise", (-550, -400), noise_dimensions="3D")
    fine.inputs["Scale"].default_value = 160.0
    fine.inputs["Detail"].default_value = 4.0
    stretch = _new(nt, "ShaderNodeMapping", (-800, -400))
    stretch.inputs["Scale"].default_value = (1.0, 0.3, 1.0)
    nt.links.new(uv.outputs["UV"], stretch.inputs["Vector"])
    nt.links.new(stretch.outputs[0], fine.inputs["Vector"])
    big = _new(nt, "ShaderNodeTexNoise", (-550, -650), noise_dimensions="3D")
    big.inputs["Scale"].default_value = 3.0
    big.inputs["Detail"].default_value = 3.0
    nt.links.new(uv.outputs["UV"], big.inputs["Vector"])
    # 遠くで模様をとかす：カメラからの距離 25m → 110m で 1 → 0.1
    lp = _new(nt, "ShaderNodeLightPath", (-550, -900))
    fade = _new(nt, "ShaderNodeMapRange", (-300, -900))
    fade.inputs["From Min"].default_value = 25.0
    fade.inputs["From Max"].default_value = 110.0
    fade.inputs["To Min"].default_value = 1.0
    fade.inputs["To Max"].default_value = 0.1
    fade.clamp = True
    nt.links.new(lp.outputs["Ray Length"], fade.inputs["Value"])
    # 太さ（半径 1cm 未満はなめらかな小枝色）
    rad = _attr(nt, "radius", (-800, -1100))
    thick = _new(nt, "ShaderNodeMapRange", (-550, -1100))
    thick.inputs["From Min"].default_value = 0.010
    thick.inputs["From Max"].default_value = 0.032
    thick.clamp = True
    nt.links.new(rad.outputs["Fac"], thick.inputs["Value"])
    dead = _attr(nt, "dead", (-800, -1250))
    # 高さ（うろこの凸）
    h1 = _math(nt, "MULTIPLY", plate, 0.75, (-100, 200))
    h2 = _math(nt, "MULTIPLY", fine, 0.25, (-100, 50))
    h = _math(nt, "ADD", h1, None, (100, 150))
    nt.links.new(h2.outputs[0], h.inputs[1])
    bump = _new(nt, "ShaderNodeBump", (400, -100))
    bump.inputs["Distance"].default_value = 0.014              # 縁の持ち上がり 3〜10mm＋割れ目の深さ
    st = _math(nt, "MULTIPLY", thick, 2.2, (200, -300))
    st2 = _math(nt, "MULTIPLY", st, None, (300, -300))
    nt.links.new(fade.outputs[0], st2.inputs[1])
    nt.links.new(st2.outputs[0], bump.inputs["Strength"])
    nt.links.new(h.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    # 木ごとの明るさ ±15%
    oi = _new(nt, "ShaderNodeObjectInfo", (-300, -1250))
    val = _math(nt, "MULTIPLY", oi.outputs["Random"] if False else None, 0.3, (-100, -1250))
    nt.links.new(oi.outputs["Random"], val.inputs[0])
    val2 = _math(nt, "ADD", val, 0.85, (50, -1250))
    # 色：板=灰褐色、割れ目=暗い赤褐色、はがれ跡=赤褐色
    plate_col = _new(nt, "ShaderNodeMix", (300, 300), data_type="RGBA", blend_type="MIX")
    plate_col.inputs[6].default_value = (0.014, 0.009, 0.007, 1.0)    # 割れ目の奥
    plate_col.inputs[7].default_value = (0.060, 0.051, 0.044, 1.0)    # 板（灰褐色）
    pv = _math(nt, "MULTIPLY", big, 0.5, (150, 450))
    pv2 = _math(nt, "ADD", plate, None, (300, 450), clamp=True)
    nt.links.new(pv.outputs[0], pv2.inputs[1])
    pv3 = _math(nt, "SUBTRACT", pv2, 0.2, (450, 450), clamp=True)
    nt.links.new(pv3.outputs[0], plate_col.inputs[0])
    red = _new(nt, "ShaderNodeMix", (550, 300), data_type="RGBA")
    red.inputs[7].default_value = (0.052, 0.025, 0.018, 1.0)          # 赤褐色（割れ目の中・はがれ跡）
    inv = _math(nt, "SUBTRACT", 1.0, plate, (400, 100), clamp=True)
    invs = _math(nt, "MULTIPLY", inv, 0.3, (450, 100))
    redf = _math(nt, "ADD", invs, scar, (550, 100), clamp=True)
    nt.links.new(redf.outputs[0], red.inputs[0])
    nt.links.new(plate_col.outputs[2], red.inputs[6])
    # 木ごとの明るさ
    vcol = _new(nt, "ShaderNodeMix", (750, 300), data_type="RGBA", blend_type="MULTIPLY")
    vcol.inputs[0].default_value = 1.0
    nt.links.new(red.outputs[2], vcol.inputs[6])
    nt.links.new(val2.outputs[0], vcol.inputs[7])      # スカラー→色に自動変換
    # 地衣類（上のほうの幹の 10〜30%）と苔（根元 1m）
    lich_n = _new(nt, "ShaderNodeTexNoise", (-550, -1400), noise_dimensions="3D")
    lich_n.inputs["Scale"].default_value = 4.0
    lich_n.inputs["Detail"].default_value = 5.0
    lsc = _new(nt, "ShaderNodeMapping", (-800, -1400))
    lsc.inputs["Scale"].default_value = (2.0, 0.7, 1.0)
    nt.links.new(uv.outputs["UV"], lsc.inputs["Vector"])
    nt.links.new(lsc.outputs[0], lich_n.inputs["Vector"])
    lthr = _math(nt, "MULTIPLY", oi.outputs["Random"] if False else None, 0.12, (-300, -1450))
    nt.links.new(oi.outputs["Random"], lthr.inputs[0])
    lthr2 = _math(nt, "ADD", lthr, 0.50, (-150, -1450))
    lmask = _new(nt, "ShaderNodeMapRange", (50, -1400))
    lmask.inputs["From Min"].default_value = 0.0
    lmask.inputs["From Max"].default_value = 0.1
    lmask.clamp = True
    ldiff = _math(nt, "SUBTRACT", lich_n, lthr2, (-50, -1400))
    nt.links.new(lich_n.outputs["Fac"], ldiff.inputs[0])
    nt.links.new(lthr2.outputs[0], ldiff.inputs[1])
    nt.links.new(ldiff.outputs[0], lmask.inputs["Value"])
    hup = _new(nt, "ShaderNodeMapRange", (-900, -700))
    hup.inputs["From Min"].default_value = 3.0
    hup.inputs["From Max"].default_value = 9.0
    hup.clamp = True
    nt.links.new(hm.outputs[0], hup.inputs["Value"])
    lf = _math(nt, "MULTIPLY", lmask, hup, (200, -1400))
    lf2 = _math(nt, "MULTIPLY", lf, thick, (350, -1400))
    lf3 = _math(nt, "MULTIPLY", lf2, 0.85, (500, -1400))
    lich = _new(nt, "ShaderNodeMix", (950, 300), data_type="RGBA")
    lich.inputs[7].default_value = (0.16, 0.18, 0.12, 1.0)
    nt.links.new(lf3.outputs[0], lich.inputs[0])
    nt.links.new(vcol.outputs[2], lich.inputs[6])
    mlow = _new(nt, "ShaderNodeMapRange", (-900, -800))
    mlow.inputs["From Min"].default_value = 0.35
    mlow.inputs["From Max"].default_value = 1.1
    mlow.inputs["To Min"].default_value = 1.0
    mlow.inputs["To Max"].default_value = 0.0
    mlow.clamp = True
    nt.links.new(hm.outputs[0], mlow.inputs["Value"])
    mm = _math(nt, "MULTIPLY", mlow, big, (200, -800))
    mm2 = _math(nt, "MULTIPLY", mm, thick, (350, -800))
    mm3 = _math(nt, "MULTIPLY", mm2, 1.4, (500, -800), clamp=True)
    moss = _new(nt, "ShaderNodeMix", (1150, 300), data_type="RGBA")
    moss.inputs[7].default_value = (0.040, 0.066, 0.016, 1.0)
    nt.links.new(mm3.outputs[0], moss.inputs[0])
    nt.links.new(lich.outputs[2], moss.inputs[6])
    # 遠くでは平均色へ
    far = _new(nt, "ShaderNodeMix", (1350, 300), data_type="RGBA")
    far.inputs[6].default_value = (0.041, 0.031, 0.026, 1.0)
    nt.links.new(fade.outputs[0], far.inputs[0])
    nt.links.new(moss.outputs[2], far.inputs[7])
    # 細い枝はなめらかな小枝色（赤褐色〜黄褐色）
    twig = _new(nt, "ShaderNodeMix", (1550, 300), data_type="RGBA")
    twig.inputs[6].default_value = (0.17, 0.092, 0.040, 1.0)
    nt.links.new(thick.outputs[0], twig.inputs[0])
    nt.links.new(far.outputs[2], twig.inputs[7])
    # 枯れ枝は灰褐色
    gr = _new(nt, "ShaderNodeMix", (1750, 300), data_type="RGBA")
    gr.inputs[7].default_value = (0.038, 0.032, 0.028, 1.0)
    nt.links.new(dead.outputs["Fac"], gr.inputs[0])
    nt.links.new(twig.outputs[2], gr.inputs[6])
    nt.links.new(gr.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.92
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.12
    return m


def _tone_color(nt, fac_socket, loc):
    r = _ramp(nt, TONE_STOPS, loc)
    nt.links.new(fac_socket, r.inputs["Fac"])
    return r


def needle_material(bake_tone=None):
    """針の材質。bake_tone を指定すると tone/tint の属性を使わず、その色で固定（カード焼き込み用）。"""
    name = "larch_needle" if bake_tone is None else "larch_needle_bake"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = _new(nt, "ShaderNodeOutputMaterial", (1200, 0))
    uv = _new(nt, "ShaderNodeTexCoord", (-900, -300))
    if bake_tone is None:
        tone = _attr(nt, "tone", (-900, 100))
        tint = _attr(nt, "tint", (-900, -100))
        sh = _math(nt, "SUBTRACT", tint, 0.5, (-700, -100))
        sh2 = _math(nt, "MULTIPLY", sh, 0.34, (-550, -100))
        f = _math(nt, "ADD", tone, None, (-400, 0), clamp=True)
        nt.links.new(sh2.outputs[0], f.inputs[1])
    else:
        tint = _attr(nt, "tint", (-900, -100))
        sh = _math(nt, "SUBTRACT", tint, 0.5, (-700, -100))
        sh2 = _math(nt, "MULTIPLY", sh, 0.34, (-550, -100))
        f = _math(nt, "ADD", bake_tone, None, (-400, 0), clamp=True)
        nt.links.new(sh2.outputs[0], f.inputs[1])
    col = _tone_color(nt, f.outputs[0], (-200, 0))
    # 針の根元はやや暗く緑がかり、先ほど明るい
    sep = _new(nt, "ShaderNodeSeparateXYZ", (-700, -350))
    nt.links.new(uv.outputs["UV"], sep.inputs[0])
    g = _math(nt, "MULTIPLY", None, 0.3, (-550, -350))
    nt.links.new(sep.outputs[1], g.inputs[0])
    g2 = _math(nt, "ADD", g, 0.72, (-400, -350))
    mul = _new(nt, "ShaderNodeMix", (50, -50), data_type="RGBA", blend_type="MULTIPLY")
    mul.inputs[0].default_value = 1.0
    nt.links.new(col.outputs[0], mul.inputs[6])
    nt.links.new(g2.outputs[0], mul.inputs[7])
    _finish_foliage(nt, mul.outputs[2], out, alpha=None)
    return m


def _finish_foliage(nt, color_socket, out, alpha=None):
    """針の仕上げ：薄い葉＝拡散 45% ＋ 透過 55%（金色）。ざらざら（つやなし）にして白い点を出さない。"""
    pr = _new(nt, "ShaderNodeBsdfPrincipled", (500, 100))
    pr.inputs["Roughness"].default_value = 0.6
    if "Specular IOR Level" in pr.inputs:
        pr.inputs["Specular IOR Level"].default_value = 0.08
    tr = _new(nt, "ShaderNodeBsdfTranslucent", (500, -150))
    boost = _new(nt, "ShaderNodeMix", (300, -250), data_type="RGBA", blend_type="MULTIPLY")
    boost.inputs[0].default_value = 1.0
    boost.inputs[7].default_value = (1.15, 1.25, 1.0, 1.0)      # 透過色＝彩度の高い金色（線形 約 0.85, 0.50, 0.03）
    nt.links.new(color_socket, boost.inputs[6])
    nt.links.new(color_socket, pr.inputs["Base Color"])
    nt.links.new(boost.outputs[2], tr.inputs["Color"])
    mix = _new(nt, "ShaderNodeMixShader", (800, 0))
    mix.inputs[0].default_value = 0.55
    nt.links.new(pr.outputs[0], mix.inputs[1])
    nt.links.new(tr.outputs[0], mix.inputs[2])
    # 内側が真っ黒にならないよう、ごく弱い暖色の底上げ（まわりの葉からの照り返しの代わり）
    em = _new(nt, "ShaderNodeEmission", (800, 200))
    em.inputs["Strength"].default_value = 0.035
    nt.links.new(color_socket, em.inputs["Color"])
    add = _new(nt, "ShaderNodeAddShader", (950, 0))
    nt.links.new(mix.outputs[0], add.inputs[0])
    nt.links.new(em.outputs[0], add.inputs[1])
    if alpha is None:
        nt.links.new(add.outputs[0], out.inputs[0])
    else:
        tp = _new(nt, "ShaderNodeBsdfTransparent", (950, -250))
        m2 = _new(nt, "ShaderNodeMixShader", (1150, 0))
        nt.links.new(alpha, m2.inputs[0])
        nt.links.new(tp.outputs[0], m2.inputs[1])
        nt.links.new(add.outputs[0], m2.inputs[2])
        nt.links.new(m2.outputs[0], out.inputs[0])


def card_material(atlas_path=None):
    name = "larch_card"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    atlas_path = atlas_path or ATLAS
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = _new(nt, "ShaderNodeOutputMaterial", (1500, 0))
    img = bpy.data.images.load(atlas_path, check_existing=True)
    img.alpha_mode = "STRAIGHT"
    tex = _new(nt, "ShaderNodeTexImage", (-600, 200), image=img, interpolation="Linear", extension="EXTEND")
    uv = _new(nt, "ShaderNodeTexCoord", (-900, 200))
    nt.links.new(uv.outputs["UV"], tex.inputs["Vector"])
    tone = _attr(nt, "tone", (-900, -100))
    cur = _tone_color(nt, tone.outputs["Fac"], (-600, -100))
    ref = _ramp(nt, BAKED_STOPS, (-600, -400))
    ref.inputs["Fac"].default_value = BAKE_TONE
    # 色 = 絵 × (いまの tone の色 ÷ 焼いたときの色)
    dv = _new(nt, "ShaderNodeMix", (-300, -200), data_type="RGBA", blend_type="DIVIDE")
    dv.inputs[0].default_value = 1.0
    nt.links.new(cur.outputs[0], dv.inputs[6])
    nt.links.new(ref.outputs[0], dv.inputs[7])
    mu = _new(nt, "ShaderNodeMix", (0, 100), data_type="RGBA", blend_type="MULTIPLY")
    mu.inputs[0].default_value = 1.0
    nt.links.new(tex.outputs["Color"], mu.inputs[6])
    nt.links.new(dv.outputs[2], mu.inputs[7])
    _finish_foliage(nt, mu.outputs[2], out, alpha=tex.outputs["Alpha"])
    return m
