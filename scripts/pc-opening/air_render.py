"""PC のホームの「空気の層」の雲を、Blender（Cycles の体積）で描く。光は背景の日本の絵（home.py --tod）と同じ。

  python air_render.py --tod all                                   # 本番 → work/air/render/（air_clouds.py webp でアプリの絵に）
  python air_render.py --tod dusk --scale 0.25 --spp 16 --threads 2 --out 試し   # 小さく試す（1 周期を 1/4 の大きさで）
  python air_render.py --tod morning --kinds cumulus --window 900,700,320 --out 試し   # 一部を 1 画素＝1 単位で（細部を見る）

python は bpy（Blender 5.3）を入れたもの。雲の形は、先に python3 air_clouds.py fields で作る work/air/fields.npz。
- 1 単位 = ズーム 5 の地図の 1 画素 = 雲の絵の 1 画素。1 周期（TILE）は 2048 単位。真上から、ゆがみの無いカメラで描く。
- 積雲：雲の濃さと雲の頭の高さの地図から作った体積（底はほぼ平ら、頭はもくもく。小さい雲ほど薄く低い）。光は雲の中で
  何度も散る（Cycles の体積の散乱）ので、朝夕は日の当たる側が明るく、反対は空の青い光だけの影になり、薄いふちは光が透ける。
- 巻雲：高い所の薄い体積（風の向きに長い筋）。
- 光：home.py の tod_lights（TOD の太陽か月と、空の光）と同じもの。露出と色の曲線（AgX - Medium High Contrast）も home.py と同じ。
- 描くもの（時刻ごと）：cumulus（積雲だけ。透明つき）・cirrus（巻雲だけ）・shadow（地面に落ちる積雲の影だけ。地面は影を受ける
  だけで写らない）・deck-a・deck-b（オープニングの白い雲から晴れていくところの厚い雲）。影と厚い雲はぼけているので半分の細かさ。
- 体積は ray marching（--step。既定の null scattering より、雲の無い所の多い大きな箱でずっと速い。0.02 で null scattering と
  ほぼ同じ見え方）。朝夕の雲は露出を少し下げ（CLOUD_EV）、夕の雲には地面より赤い光を当てる（CLOUD_TINT。茜）。
- くり返し：雲の形は周期的なので、1 周期の外にも同じ雲を置き（影・光がつながる）、1 周期のまわりに余り（MARGIN）を足して
  描く（ノイズ除去も端をまたいでつながる）。air_clouds.py webp が余りを切り落として WebP にする。
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import home  # noqa: E402  （光は home.py と同じものを使う）

WORK = os.environ.get("PC_OPENING_WORK", os.path.join(HERE, "work"))
AIR_WORK = os.path.join(WORK, "air")
TODS = ["morning", "day", "dusk", "night"]

KINDS = ["cumulus", "cirrus", "shadow", "deck-a", "deck-b"]
MARGIN = 32  # 1 周期のまわりに足して描く余り（単位）
REACH = 160  # 1 周期の外に置く雲・地面の広さ（夕方の低い日の影が届く長さより広く）
Z_BASE = 2.5  # 積雲の底の高さ（単位。見やすさのため本物より高い：影が太陽と反対へずれる長さ）
H_SCALE = 0.85  # 雲の頭の高さ（air_clouds の高さ）の倍率
CU_DENSITY = 1.5  # 積雲の濃さ（1 単位あたり）
CI_Z, CI_HALF, CI_DENSITY = 17.0, 1.3, 0.32  # 巻雲の高さ・厚さの半分・濃さ
# 雲の露出（home.py の露出からの段）。雲は地面よりずっと明るいので、低い日の朝夕に地面に合わせた露出のままだと、AgX が明るい所の
# 色を抜いて白っぽくなる。朝は金、夕は茜が残るように少し下げる
CLOUD_EV = {"morning": -0.35, "day": 0.0, "dusk": -0.9, "night": 0.0}
# 雲に当たる光の色に使う太陽の高さ（home.py の tint の代わり。夕の雲は、地面より赤い最後の光で茜に染まる）
CLOUD_TINT = {"morning": 5.0, "dusk": 1.7}
SOFT = ("shadow", "deck-a", "deck-b")  # ぼけているので半分の細かさで描くもの（アプリでのばす）


def node(nt, kind: str, **values):
    n = nt.nodes.new(kind)
    for k, v in values.items():
        if k in n.inputs:
            n.inputs[k].default_value = v
        else:
            setattr(n, k, v)
    return n


def link(nt, a, b) -> None:
    nt.links.new(a, b)


def math_node(nt, op: str, a, b=None, clamp: bool = False):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    n.use_clamp = clamp
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            link(nt, v, n.inputs[i])
    return n.outputs[0]


def smooth(nt, x, lo, hi):
    """lo〜hi で 0→1 になめらかに（Map Range の smoothstep）"""
    n = nt.nodes.new("ShaderNodeMapRange")
    n.interpolation_type = "SMOOTHSTEP"
    link(nt, x, n.inputs["Value"])
    for name, v in (("From Min", lo), ("From Max", hi)):
        if isinstance(v, (int, float)):
            n.inputs[name].default_value = v
        else:
            link(nt, v, n.inputs[name])
    return n.outputs["Result"]


def data_image(name: str, chans: list[np.ndarray]):
    """形の地図（float）を Blender の画像にする（行 0 が北。Blender の画像は下の行からなので上下を返す）"""
    n = chans[0].shape[0]
    rgba = np.zeros((n, n, 4), np.float32)
    rgba[..., 3] = 1.0
    for i, a in enumerate(chans):
        rgba[..., i] = a[::-1]
    img = bpy.data.images.new(name, n, n, alpha=True, float_buffer=True, is_data=True)
    img.pixels.foreach_set(rgba.ravel())
    return img


def map_lookup(nt, img, tile: float):
    """体積の中の点 → 形の地図の色（周期でくり返す）。返す：(色の出力, z)"""
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    link(nt, tc.outputs["Object"], sep.inputs["Vector"])
    uv = nt.nodes.new("ShaderNodeCombineXYZ")
    link(nt, math_node(nt, "DIVIDE", sep.outputs["X"], tile), uv.inputs["X"])
    link(nt, math_node(nt, "DIVIDE", sep.outputs["Y"], tile), uv.inputs["Y"])
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Cubic"
    tex.extension = "REPEAT"
    link(nt, uv.outputs["Vector"], tex.inputs["Vector"])
    col = nt.nodes.new("ShaderNodeSeparateColor")
    link(nt, tex.outputs["Color"], col.inputs["Color"])
    return col, sep.outputs["Z"]


def volume_material(name: str, density, color=(0.97, 0.97, 0.97), aniso: float = 0.45):
    m = bpy.data.materials.new(name)
    nt = m.node_tree if m.node_tree else None
    if nt is None:
        m.use_nodes = True
        nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    vol = node(nt, "ShaderNodeVolumePrincipled", Color=(*color, 1.0), Anisotropy=aniso)
    link(nt, density(nt), vol.inputs["Density"])
    link(nt, vol.outputs[0], out.inputs["Volume"])
    return m


def cumulus_material(name: str, img, tile: float):
    """積雲：底はほぼ平ら（少し下へも厚くなる）、頭は高さの地図のとおり。薄い所ほど淡い"""

    def density(nt):
        col, z = map_lookup(nt, img, tile)
        d = col.outputs["Red"]
        hs = math_node(nt, "MULTIPLY", col.outputs["Green"], H_SCALE)
        top = math_node(nt, "ADD", hs, Z_BASE + 0.5)
        bot = math_node(nt, "SUBTRACT", Z_BASE, math_node(nt, "MULTIPLY", hs, 0.2))
        # 頭の面はくっきり（もくもくの凹凸が光と影で見える）、厚い雲ほど少しやわらかい
        soft = math_node(nt, "ADD", math_node(nt, "MULTIPLY", hs, 0.06), 0.3)
        below = smooth(nt, z, math_node(nt, "SUBTRACT", bot, 0.35), math_node(nt, "ADD", bot, 0.5))
        above = math_node(nt, "SUBTRACT", 1.0, smooth(nt, z, math_node(nt, "SUBTRACT", top, soft), top))
        dd = math_node(nt, "POWER", math_node(nt, "MAXIMUM", d, 0.0), 1.25)
        return math_node(nt, "MULTIPLY", math_node(nt, "MULTIPLY", math_node(nt, "MULTIPLY", dd, below), above), CU_DENSITY)

    return volume_material(name, density)


def box(name: str, x0: float, x1: float, y0: float, y1: float, z0: float, z1: float, mat):
    me = bpy.data.meshes.new(name)
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    me.from_pydata(v, [], f)
    me.update()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def ground(tile: float):
    """影を受けるだけの地面（写らない。影の濃さが透明度になる）"""
    me = bpy.data.meshes.new("ground")
    a, b = -REACH, tile + REACH
    me.from_pydata([(a, a, 0), (b, a, 0), (b, b, 0), (a, b, 0)], [], [(0, 1, 2, 3)])
    me.update()
    m = bpy.data.materials.new("ground")
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.8, 0.8, 0.8, 1.0)
        bsdf.inputs["Roughness"].default_value = 1.0
    me.materials.append(m)
    ob = bpy.data.objects.new("ground", me)
    bpy.context.scene.collection.objects.link(ob)
    ob.is_shadow_catcher = True
    return ob


def setup(a, tile: int, f: dict[str, np.ndarray], tod: str):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    p = home.TOD[tod]
    home.tod_lights(p)
    tint = a.tint if a.tint is not None else CLOUD_TINT.get(tod)
    if tint is not None and "moon" not in p:
        bpy.data.lights["sun"].color = home.sun_color(tint)
    lo, hi = -REACH, tile + REACH
    cu_img = data_image("cu", [f["cu_d"], f["cu_h"], f["ci_d"]])
    objs = {
        "cumulus": box("cumulus", lo, hi, lo, hi, 0.8, 14.5, cumulus_material("cumulus", cu_img, tile)),
        "cirrus": box("cirrus", lo, hi, lo, hi, CI_Z - CI_HALF - 0.2, CI_Z + CI_HALF + 0.2, cirrus_material_from(cu_img, tile)),
        "ground": ground(tile),
    }
    for k in ("deck-a", "deck-b"):
        key = k.replace("-", "_")
        img = data_image(k, [f[f"{key}_d"], f[f"{key}_h"]])
        objs[k] = box(k, lo, hi, lo, hi, 0.8, 15.0, cumulus_material(k, img, tile))
    # カメラ：真上から（北が上）。1 周期と余り、または一部（--window）
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    cam.clip_start, cam.clip_end = 1.0, 1000.0
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    sc.camera = co
    if a.window:
        cx, cy, w = (float(v) for v in a.window.split(","))
        cam.ortho_scale = w
        co.location = (cx, tile - cy, 200.0)
        res = int(round(w))
    else:
        cam.ortho_scale = tile + 2 * MARGIN
        co.location = (tile / 2, tile / 2, 200.0)
        res = int(round((tile + 2 * MARGIN) * a.scale))
    sc["air_res"] = res
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.render.threads_mode = "FIXED"
    sc.render.threads = a.threads
    sc.cycles.samples = a.spp
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.max_bounces = 12
    sc.cycles.volume_bounces = a.bounces
    sc.cycles.transparent_max_bounces = 16
    # 体積は「ray marching」で（雲の無い所の多い大きな箱では、既定の null scattering よりずっと速い）
    sc.cycles.volume_biased = a.step > 0
    if a.step > 0:
        sc.cycles.volume_step_rate = a.step
        sc.cycles.volume_max_steps = 512
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.color_depth = "16"
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.view_settings.exposure = 0.3 - math.log2(home.tod_gain(p)) + p["stops"] + (a.ev if a.ev is not None else CLOUD_EV[tod])
    return sc, objs


def cirrus_material_from(img, tile: float):
    """巻雲の濃さは、積雲の地図の 3 つ目（青）に入れてある"""

    def density(nt):
        col, z = map_lookup(nt, img, tile)
        dz = math_node(nt, "ABSOLUTE", math_node(nt, "SUBTRACT", z, CI_Z))
        prof = math_node(nt, "SUBTRACT", 1.0, smooth(nt, dz, 0.0, CI_HALF))
        return math_node(nt, "MULTIPLY", math_node(nt, "MULTIPLY", col.outputs["Blue"], prof), CI_DENSITY)

    return volume_material("cirrus", density, color=(0.98, 0.98, 0.98), aniso=0.3)


def show(objs, kind: str) -> None:
    """描くものだけを出す。影は、積雲をカメラには写さず（影だけ落とす）、地面に影を受ける"""
    for k, ob in objs.items():
        ob.hide_render = True
        ob.visible_camera = True
    if kind == "shadow":
        objs["cumulus"].hide_render = False
        objs["cumulus"].visible_camera = False
        objs["ground"].hide_render = False
    else:
        objs[kind].hide_render = False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tod", default="all", help="morning・day・dusk・night（カンマで区切る）か all")
    ap.add_argument("--kinds", default=",".join(KINDS))
    ap.add_argument("--scale", type=float, default=1.0, help="1 単位あたりの画素（本番 1.0）")
    ap.add_argument("--spp", type=int, default=48)
    ap.add_argument("--threads", type=int, default=0, help="使う CPU の数（0 は全部）")
    ap.add_argument("--bounces", type=int, default=8, help="体積の中で光が散る回数の上限")
    ap.add_argument("--step", type=float, default=0.02, help="体積をたどる細かさ（小さいほど細かく遅い。0 は Cycles の既定の null scattering）")
    ap.add_argument("--tint", type=float, default=None, help="雲に当たる光の色の太陽の高さ（試す用。ふだんは CLOUD_TINT）")
    ap.add_argument("--ev", type=float, default=None, help="雲の露出の段（試す用。ふだんは CLOUD_EV）")
    ap.add_argument("--window", default="", help="一部だけ 1 画素＝1 単位で描く：中心の列,行,幅（雲の絵の画素）")
    ap.add_argument("--out", default=os.path.join(AIR_WORK, "render"))
    a = ap.parse_args()
    tods = TODS if a.tod == "all" else a.tod.split(",")
    kinds = a.kinds.split(",")
    src = os.path.join(AIR_WORK, "fields.npz")
    if not os.path.exists(src):
        raise SystemExit(f"雲の形が無い：先に python3 air_clouds.py fields（{src}）")
    z = np.load(src)
    f = {k: z[k] for k in z.files}
    tile = int(f["n"])
    os.makedirs(a.out, exist_ok=True)
    for t in tods:
        sc, objs = setup(a, tile, f, t)
        for k in kinds:
            show(objs, k)
            res = sc["air_res"] if a.window or k not in SOFT else sc["air_res"] // 2
            sc.render.resolution_x = sc.render.resolution_y = res
            sc.render.filepath = os.path.join(a.out, f"{k}-{t}.png")
            t0 = time.time()
            bpy.ops.render.render(write_still=True)
            print(f"{k}-{t}：{time.time() - t0:.0f} 秒", flush=True)
    with open(os.path.join(a.out, "render.json"), "w", encoding="utf-8") as fp:
        json.dump({"tile": tile, "margin": MARGIN, "scale": a.scale, "spp": a.spp, "window": a.window or None}, fp, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
