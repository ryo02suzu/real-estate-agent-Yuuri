// 焼き込み用のシーン：PLATEAU の建物（glb）・地面と山（地理院）・東京タワーの模型・木を ENU（カメラ原点、z が上）に並べる
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
export const TYPE = { building2: 1, building1: 2, ground: 3, tower: 4, tree: 5 };
const VS_COMMON = `
attribute float gid; attribute vec3 tcol; attribute vec3 tattr;
varying vec3 vW; varying vec2 vUv; varying float vGid; varying vec3 vTcol; varying vec3 vTattr;
uniform float u_lift;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  // 大気の屈折で遠くが少し持ち上がる（k=0.13）
  w.z += u_lift * 0.13 * dot(w.xy, w.xy) / (2.0 * 6371000.0);
  vW = w.xyz; vUv = uv; vGid = gid; vTcol = tcol; vTattr = tattr;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
export function makeMaterial(pass, mesh, extra = {}) {
  const u = mesh.userData;
  const uniforms = {
    u_map: { value: u.map || null }, u_hasMap: { value: u.map ? 1 : 0 }, u_color: { value: new THREE.Color(u.color ?? 0xb0aca6) },
    u_type: { value: u.type }, u_lift: { value: 1 }, u_sun: { value: extra.sun || new THREE.Vector3(0, 0, 1) },
    u_lightVP: { value: extra.lightVP || new THREE.Matrix4() }, u_shadow: { value: extra.shadowTex || null }, u_texel: { value: extra.texel || 1 / 4096 },
    u_base: { value: u.baseTex || null },
  };
  const FS = {
    preview: `uniform sampler2D u_map; uniform float u_hasMap; uniform vec3 u_color; uniform vec3 u_sun; uniform float u_type;
      varying vec3 vW; varying vec2 vUv; varying vec3 vTcol;
      void main(){ vec3 n = normalize(cross(dFdx(vW), dFdy(vW))); if (dot(n, vW) > 0.0) n = -n;
        vec3 a = u_type == 4.0 ? vTcol : (u_hasMap > 0.5 ? texture2D(u_map, vUv).rgb : u_color);
        float l = 0.42 + 0.58 * max(dot(n, normalize(u_sun)), 0.0) + 0.12 * n.z;
        float d = length(vW); vec3 c = a * l; c = mix(c, vec3(0.62, 0.72, 0.84), 1.0 - exp(-d / 26000.0));
        gl_FragColor = vec4(c, 1.0); }`,
    albedo: `uniform sampler2D u_map; uniform float u_hasMap; uniform vec3 u_color; uniform float u_type; varying vec2 vUv; varying vec3 vW; varying vec3 vTcol;
      void main(){ vec3 a = u_type == 4.0 ? vTcol : (u_hasMap > 0.5 ? texture2D(u_map, vUv).rgb : u_color); gl_FragColor = vec4(a, 1.0); }`,
    tower: `uniform float u_type; varying vec3 vTattr;
      void main(){ if (u_type != 4.0) { gl_FragColor = vec4(0.0); return; } gl_FragColor = vec4((vTattr.x + 1.0) / 255.0, vTattr.y, vTattr.z / 255.0, 1.0); }`,
    normal: `uniform float u_type; varying vec3 vW;
      void main(){ vec3 n = normalize(cross(dFdx(vW), dFdy(vW))); if (dot(n, vW) > 0.0) n = -n; gl_FragColor = vec4(n * 0.5 + 0.5, u_type / 255.0); }`,
    geo: `uniform float u_type; varying vec3 vW; varying float vGid;
      void main(){ vec3 n = normalize(cross(dFdx(vW), dFdy(vW))); if (dot(n, vW) > 0.0) n = -n;
        // 壁の水平方向の座標（窓の列）：壁の向きに直交する水平の軸に沿った位置
        vec2 t = normalize(vec2(-n.y, n.x) + 1e-6); float wallU = dot(vW.xy, t);
        gl_FragColor = vec4(length(vW), vGid, vW.z, wallU); }`,
    depth: `varying vec3 vW; void main(){ gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }`,
    shadow: `uniform mat4 u_lightVP; uniform sampler2D u_shadow; uniform float u_texel; varying vec3 vW;
      void main(){ vec3 n = normalize(cross(dFdx(vW), dFdy(vW))); if (dot(n, vW) > 0.0) n = -n;
        vec4 lp = u_lightVP * vec4(vW + n * 0.6, 1.0); vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
        float lit = 1.0;
        if (p.x > 0.0 && p.x < 1.0 && p.y > 0.0 && p.y < 1.0) {
          float s = 0.0;
          for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
            float dz = texture2D(u_shadow, p.xy + vec2(float(i), float(j)) * u_texel).r;
            s += (p.z - 0.0008 > dz) ? 0.0 : 1.0; }
          lit = s / 9.0; }
        gl_FragColor = vec4(lit, lit, lit, 1.0); }`,
  };
  return new THREE.ShaderMaterial({ uniforms, vertexShader: VS_COMMON, fragmentShader: FS[pass], side: THREE.DoubleSide, extensions: { derivatives: true } });
}
export async function loadScene(man, opts = {}) {
  const scene = new THREE.Scene();
  const draco = new DRACOLoader(); draco.setDecoderPath('./node_modules/three/examples/jsm/libs/draco/'); draco.setWorkerLimit(4);
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  const R = man.enu, o = man.camEcef;
  const Ry = new THREE.Matrix4().set(1,0,0,0, 0,0,-1,0, 0,1,0,0, 0,0,0,1);
  const Renu = new THREE.Matrix4().set(R[0][0],R[0][1],R[0][2],0, R[1][0],R[1][1],R[1][2],0, R[2][0],R[2][1],R[2][2],0, 0,0,0,1);
  const meshes = []; let tris = 0, texBytes = 0, loadedTiles = 0;
  const limit = opts.limit ?? 1e9;
  const tiles = man.tiles.slice(0, limit);
  let i = 0;
  async function worker() {
    while (i < tiles.length) {
      const t = tiles[i++];
      const buf = await (await fetch(`${t.path}.glb`)).arrayBuffer();
      let g; try { g = await loader.parseAsync(buf, ''); } catch (e) { console.warn('parse', t.path, e); continue; }
      const d = [t.center[0] - o[0], t.center[1] - o[1], t.center[2] - o[2]];
      const tr = [0, 1, 2].map((r) => R[r][0] * d[0] + R[r][1] * d[1] + R[r][2] * d[2]);
      const M = new THREE.Matrix4().multiplyMatrices(Renu, Ry); M.setPosition(tr[0], tr[1], tr[2]);
      g.scene.updateMatrixWorld(true);
      const dist = Math.hypot(tr[0], tr[1]);
      const parts = [];
      g.scene.traverse((m) => { if (m.isMesh) parts.push(m); });
      for (const m of parts) {
        const geo = m.geometry;
        const bid = geo.attributes._batchid;
        const pos = geo.attributes.position, uvA = geo.attributes.uv;
        const n = pos.count;
        const idx = geo.index ? geo.index.array : null;
        const cnt = idx ? idx.length : n;
        // 描く建物の三角形だけを残し、使う頂点だけに詰める
        const remap = new Int32Array(n).fill(-1);
        const P = [], U = [], G = [], I = [];
        for (let k = 0; k < cnt; k += 3) {
          const tri = idx ? [idx[k], idx[k + 1], idx[k + 2]] : [k, k + 1, k + 2];
          const gids = tri.map((v) => (bid ? (t.gmap[Math.round(bid.getX(v))] || 0) : 0));
          if (!(gids[0] > 0 && gids[1] > 0 && gids[2] > 0)) continue;
          for (let q = 0; q < 3; q++) {
            const v = tri[q];
            if (remap[v] < 0) {
              remap[v] = G.length;
              P.push(pos.getX(v), pos.getY(v), pos.getZ(v));
              U.push(uvA ? uvA.getX(v) : 0, uvA ? uvA.getY(v) : 0);
              G.push(gids[q]);
            }
            I.push(remap[v]);
          }
        }
        let map = m.material.map || null;
        if (I.length) {
          const g2 = new THREE.BufferGeometry();
          g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
          g2.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(U), 2));
          g2.setAttribute('gid', new THREE.BufferAttribute(new Float32Array(G), 1));
          g2.setIndex(new THREE.BufferAttribute(G.length > 65535 ? new Uint32Array(I) : new Uint16Array(I), 1));
          tris += I.length / 3;
          // 質感の画像を距離に応じて縮める（遠いほど小さく。画面の 1 画素に 2 texel ほど）
          let tex = null;
          if (map && map.image) {
            const im = map.image;
            const sc = Math.min(1, Math.max(1 / 32, 1 / (1.53e-3 * Math.max(dist, 300))));
            const w2 = Math.max(32, 2 ** Math.round(Math.log2(im.width * sc))), h2 = Math.max(32, 2 ** Math.round(Math.log2(im.height * sc)));
            const cv = document.createElement('canvas'); cv.width = Math.min(w2, im.width); cv.height = Math.min(h2, im.height);
            cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
            tex = new THREE.CanvasTexture(cv); tex.flipY = false; tex.colorSpace = THREE.NoColorSpace;
            tex.wrapS = map.wrapS; tex.wrapT = map.wrapT; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 8;
            texBytes += cv.width * cv.height * 4;
          }
          const mesh = new THREE.Mesh(g2);
          mesh.matrixAutoUpdate = false; mesh.matrix.multiplyMatrices(M, m.matrixWorld); mesh.matrixWorld.copy(mesh.matrix);
          mesh.userData = { type: t.kind === 'veg' ? TYPE.tree : (tex ? (t.kind === 'lod2' ? TYPE.building2 : TYPE.building1) : TYPE.building1), map: t.kind === 'veg' ? null : tex, color: t.kind === 'veg' ? 0x4a6b3a : 0xb4b0aa };
          mesh.frustumCulled = false;
          scene.add(mesh); meshes.push(mesh);
        }
        if (map) { if (map.image && map.image.close) map.image.close(); map.dispose(); }
        geo.dispose(); m.material.dispose();
      }
      loadedTiles++;
      if (loadedTiles % 100 === 0) console.log('tiles', loadedTiles, 'tris', tris, 'texMB', Math.round(texBytes / 1048576), 'heapMB', Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576));
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  // 地面と山
  const texLoader = new THREE.TextureLoader();
  if (!opts.noGround) {
    let gi = 0;
    const gl = man.ground;
    async function gworker() {
      while (gi < gl.length) {
        const t = gl[gi++];
        const ab = await (await fetch(`ground/${t.name}.bin`)).arrayBuffer();
        const [nv, ni] = new Uint32Array(ab, 0, 2);
        const P = new Float32Array(ab, 12, nv * 3), U = new Float32Array(ab, 12 + nv * 12, nv * 2), I = new Uint32Array(ab, 12 + nv * 20, ni);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
        geo.setAttribute('gid', new THREE.BufferAttribute(new Float32Array(nv), 1)); geo.setIndex(new THREE.BufferAttribute(I, 1));
        const map = await texLoader.loadAsync(t.img); map.anisotropy = 8; map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter;
        const mesh = new THREE.Mesh(geo); mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;
        mesh.userData = { type: TYPE.ground, map, z: t.z };
        scene.add(mesh); meshes.push(mesh); tris += ni / 3;
      }
    }
    await Promise.all(Array.from({ length: 8 }, gworker));
  }
  if (!opts.noTower) {
    const ab = await (await fetch('tower.bin')).arrayBuffer();
    const [nv, ni, na] = new Uint32Array(ab, 0, 3);
    const Pp = new Float32Array(ab, 12, nv * 3), A = new Float32Array(ab, 12 + nv * 12, nv * na), I = new Uint32Array(ab, 12 + nv * 12 + nv * na * 4, ni);
    const col = new Float32Array(nv * 3), att = new Float32Array(nv * 3);
    for (let k = 0; k < nv; k++) { col[k * 3] = A[k * na]; col[k * 3 + 1] = A[k * na + 1]; col[k * 3 + 2] = A[k * na + 2]; att[k * 3] = A[k * na + 3]; att[k * 3 + 1] = A[k * na + 4]; att[k * 3 + 2] = A[k * na + 5]; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(Pp, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2));
    geo.setAttribute('gid', new THREE.BufferAttribute(new Float32Array(nv), 1));
    geo.setAttribute('tcol', new THREE.BufferAttribute(col, 3)); geo.setAttribute('tattr', new THREE.BufferAttribute(att, 3));
    geo.setIndex(new THREE.BufferAttribute(I, 1));
    const mesh = new THREE.Mesh(geo); mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;
    mesh.userData = { type: TYPE.tower };
    scene.add(mesh); meshes.push(mesh); tris += ni / 3;
  }
  return { scene, meshes, tris, texMB: Math.round(texBytes / 1048576) };
}
export function makeCamera(man, W, H) {
  const cam = man.cam;
  const vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.hfov / 2)) / cam.aspect));
  const camera = new THREE.PerspectiveCamera(vfov, W / H, 3, 400000);
  camera.up.set(0, 0, 1);
  const h = THREE.MathUtils.degToRad(cam.heading), p = THREE.MathUtils.degToRad(cam.pitch);
  camera.position.set(0, 0, 0);
  camera.lookAt(Math.sin(h) * Math.cos(p), Math.cos(h) * Math.cos(p), Math.sin(p));
  camera.updateMatrixWorld(true);
  return camera;
}
export function setPass(meshes, pass, extra) {
  for (const m of meshes) {
    if (m.userData.mats?.[pass] && !extra) { m.material = m.userData.mats[pass]; continue; }
    const mat = makeMaterial(pass, m, extra);
    m.userData.mats = m.userData.mats || {}; m.userData.mats[pass] = mat; m.material = mat;
  }
}
