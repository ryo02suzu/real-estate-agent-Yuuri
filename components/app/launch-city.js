// MICHILU の壮大なオープニング（長い版・約4.5秒）の「光の道の街」。
// 夜の街の上を低く飛ぶ → 地平線の一点（ロゴの M の場所）から光が道を伝って広がり、街が光の道で描かれる → カメラが上がって真下を向くと、
// 道の中から金色の光が走って M の形になる（その M は、画面の真ん中のロゴのマークとぴったり重なり、ロゴに入れ替わる）。
// app/layout.tsx が <head> にそのまま入れる（components/app/launch-city-script.ts が読む）。React を待たずに、最初に描くときから動く。
// html の data-launch が "full"（components/app/launch-script.ts）のときだけ動き、描き始めたら html に data-grand を付ける
// （app/globals.css はこれを見て長い版の時間割にする。描けない端末では付けず、前の約1.8秒の版になる）。
// 描く先は components/app/launch.tsx の <canvas class="launch-canvas">（画面いっぱい・紺の幕の上・ロゴの下）。
// 画面に触れて飛ばした（html.launch-skip）・終わった（data-launch が done）ら止まる。描き終わり（約3.35秒）からは最後の形のまま、
// ロゴの後ろにうっすら残り、幕と一緒に上がる（app/globals.css の launch-lift-canvas）。
(function (root) {
  "use strict";

  /** 乱数（同じ種から同じ並び。mulberry32） */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 光が道を伝って広がる速さ（1秒あたり。地面の単位）と、広がり始める秒 */
  var SPREAD = 1250;
  var SPREAD_FROM = 0.12;

  /**
   * 街の道（地面 y=0 の上の線分。x は右、z は奥）。原点（ロゴの M の場所）のまわりに、少しずつ間隔のずれた碁盤の目の道
   * （ところどころ途切れる。4本に1本くらいは大通り）と、斜めの大通り。遠近で太さと明るさを変えるので、長い道は短く切る。
   * 返すのは [ax, az, bx, bz, kind, t0] の並び（kind：0 道・1 大通り。t0：光が届く秒。光は原点に近い端から伸びる）
   */
  function cityRoads(seed) {
    var rand = rng(seed);
    var out = [];
    var X0 = -760, X1 = 760, Z0 = -2100, Z1 = 2300;
    function piece(ax, az, bx, bz, kind) {
      var len = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
      var n = Math.max(1, Math.ceil(len / 120));
      for (var i = 0; i < n; i++) {
        var x1 = ax + ((bx - ax) * i) / n;
        var z1 = az + ((bz - az) * i) / n;
        var x2 = ax + ((bx - ax) * (i + 1)) / n;
        var z2 = az + ((bz - az) * (i + 1)) / n;
        var d1 = Math.sqrt(x1 * x1 + z1 * z1);
        var d2 = Math.sqrt(x2 * x2 + z2 * z2);
        if (d2 < d1) out.push(x2, z2, x1, z1, kind, SPREAD_FROM + d2 / SPREAD);
        else out.push(x1, z1, x2, z2, kind, SPREAD_FROM + d1 / SPREAD);
      }
    }
    /** 1本の道を、ところどころ途切れさせて置く（大通りは途切れない） */
    function road(ax, az, bx, bz, kind) {
      if (kind === 1) {
        piece(ax, az, bx, bz, 1);
        return;
      }
      var len = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
      var at = 0;
      while (at < len) {
        var run = 260 + rand() * 900;
        var end = Math.min(len, at + run);
        piece(ax + ((bx - ax) * at) / len, az + ((bz - az) * at) / len, ax + ((bx - ax) * end) / len, az + ((bz - az) * end) / len, 0);
        at = end + (rand() < 0.55 ? 70 + rand() * 160 : 0);
      }
    }
    var i = 0;
    for (var x = X0; x <= X1; x += 62 + rand() * 46) road(x, Z0, x, Z1, i++ % 4 === 1 ? 1 : 0);
    i = 0;
    for (var z = Z0; z <= Z1; z += 58 + rand() * 44) road(X0, z, X1, z, i++ % 5 === 2 ? 1 : 0);
    // 斜めの大通り（原点の近くを通る）
    road(-760, -1500, 760, 900, 1);
    road(760, -1800, -560, 2300, 1);
    return out;
  }

  /** 光の届く高い建物（遠くの街並みの光の柱）。[x, z, 高さ, t0] の並び */
  function towers(seed) {
    var rand = rng(seed);
    var out = [];
    for (var k = 0; k < 90; k++) {
      var x = -700 + rand() * 1400;
      var z = 150 + rand() * 2100;
      var h = 25 + Math.pow(rand(), 2.2) * 190;
      out.push(x, z, h, SPREAD_FROM + Math.sqrt(x * x + z * z) / SPREAD + 0.08);
    }
    return out;
  }

  /** ロゴのマーク（M）の中心線（ロゴの絵 802×159 の画素）。左の山（Λ）と、右の山（/ と右の縦） */
  var MARK = [
    [
      [12, 140],
      [104, 12],
      [168, 80],
    ],
    [
      [132, 114],
      [204, 18],
      [207, 150],
    ],
  ];
  /** ロゴの絵の中のマークの中心（画素）と幅 */
  var MARK_CX = 108;
  var MARK_CY = 79;
  var MARK_W = 212;

  /** 時間割（秒）：低く飛ぶ・上がって真下を向く・M へ寄る */
  var A0 = 0.15;
  var A1 = 1.9;
  var B1 = 2.75;
  var DIVE = 0.6;
  /** M から外へ広がる光の波（CSS の輪と同じとき）。描くのを止める秒（最後の形のまま、幕と一緒に上がる） */
  var WAVE_AT = 2.7;
  var WAVE_LEN = 0.6;
  var WAVE_SPEED = 1100;
  var END = B1 + DIVE;
  /** 地面の単位で、最後に M が占める幅 */
  var MARK_WORLD = 190;

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }
  function lerp(a, b, u) {
    return a + (b - a) * u;
  }
  function easeInOut(u) {
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  }
  function easeOut(u) {
    return 1 - (1 - u) * (1 - u);
  }

  /**
   * t 秒のカメラ。地面を、高さ h・下向きの角度 phi（0 は水平・π/2 は真下）・位置 z（x はいつも 0）から見る。
   * 画面の中心（光の軸が当たる所）は px・py。上がって真下を向くあいだは、光の軸がいつも原点（M の中心）を指す
   * （z = -h / tan(phi)）。最後は M の真上、画面の M の中心（mx・my）に原点が来る
   */
  function pose(t, W, H, hf, mx, my) {
    var DEG = Math.PI / 180;
    var hb = 72;
    var pb = 20 * DEG;
    var zb = (-hb * Math.cos(pb)) / Math.sin(pb);
    var phi, h, cz, v;
    var roll = 0;
    if (t < A1) {
      var u = clamp01((t - A0) / (A1 - A0));
      phi = lerp(12 * DEG, pb, easeInOut(u));
      h = lerp(40, hb, u);
      cz = lerp(-1750, zb, easeOut(u));
      v = 0;
      roll = -5.5 * DEG * Math.pow(1 - u, 2);
    } else if (t < B1) {
      v = easeInOut(clamp01((t - A1) / (B1 - A1)));
      phi = lerp(pb, 90 * DEG, v);
      h = hb * Math.pow(hf / hb, v);
      cz = (-h * Math.cos(phi)) / Math.max(1e-6, Math.sin(phi));
    } else {
      v = 1;
      phi = 90 * DEG;
      h = hf * (1 - 0.22 * (1 - Math.pow(1 - clamp01((t - B1) / DIVE), 3)));
      cz = 0;
    }
    return { phi: phi, c: Math.cos(phi), s: Math.sin(phi), h: h, cz: cz, v: v, roll: roll, px: lerp(W / 2, mx, v), py: lerp(H * 0.5, my, v) };
  }

  function run() {
    var d = document;
    var html = d.documentElement;
    if (html.getAttribute("data-launch") !== "full") return;
    if (!root.requestAnimationFrame || !d.createElement("canvas").getContext) return;

    var cv = null;
    var ctx = null;
    var t0 = -1;
    var W = 0;
    var H = 0;
    var dpr = 1;
    var F = 0;
    var hf = 0;
    var mx = 0;
    var my = 0;
    var roads = null;
    var tw = null;
    var mark = null;
    var stars = [];
    var sprite = null;
    var gold = null;
    var last = 0;
    var slow = 0;
    var lite = false;
    var NEAR = 6;
    // 遠近の4段（カメラからの奥行きの上限）と、段ごとの太さ（道・大通り）と明るさ
    var DEPTH = [240, 680, 1500, 3400];
    var WIDTH = [
      [2.1, 3.4],
      [1.35, 2.2],
      [0.9, 1.5],
      [0.6, 1.0],
    ];
    var ALPHA = [0.9, 0.82, 0.6, 0.34];
    var COLOR = ["150,190,255", "255,196,122"];
    var batch = [[], [], [], [], [], [], [], []];
    var heads = [];
    var cars = [];
    var trails = [];
    // 光の波：輪の幅（地面の単位）と、内側ほど明るい3段の帯（重ねて足す）
    var WAVE_W = 90;
    var wave = [[], [], []];
    var WAVE_A = [0.2, 0.3, 0.5];
    var SPAN = [0, 0];

    function glowSprite(rgb) {
      var c = d.createElement("canvas");
      c.width = c.height = 64;
      var g = c.getContext("2d");
      var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.18, "rgba(" + rgb + ",0.9)");
      gr.addColorStop(0.45, "rgba(" + rgb + ",0.28)");
      gr.addColorStop(1, "rgba(" + rgb + ",0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      return c;
    }

    function setup() {
      var r = cv.getBoundingClientRect();
      W = r.width;
      H = r.height;
      if (W < 50 || H < 50) return false;
      var lg = d.querySelector(".launch-logo");
      if (!lg) return false;
      var lr = lg.getBoundingClientRect();
      if (lr.width < 10) return false;
      dpr = Math.min(2, root.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      F = W * 0.78;
      // 画面の真ん中のロゴ（1.5倍）のマークの中心と、地面の上の M（最後のカメラから見て、ロゴのマークにぴったり重なる位置）
      mx = lr.left + (MARK_CX / 802) * lr.width;
      my = lr.top + (MARK_CY / 159) * lr.height;
      var mw = (MARK_W / 802) * lr.width;
      hf = (MARK_WORLD * F) / mw;
      mark = MARK.map(function (path) {
        return path.map(function (p) {
          var sx = lr.left + (p[0] / 802) * lr.width;
          var sy = lr.top + (p[1] / 159) * lr.height;
          return [((sx - mx) * hf) / F, ((my - sy) * hf) / F];
        });
      });
      roads = cityRoads(20261102);
      tw = towers(7);
      var rs = rng(11);
      for (var k = 0; k < 150; k++) stars.push([rs() * W, rs() * H * 0.62, 0.4 + rs() * 1.1, rs() * 6.28, 0.25 + rs() * 0.75]);
      sprite = glowSprite("170,205,255");
      gold = glowSprite("255,196,110");
      return true;
    }

    /** 地面の点（x, y, z）を画面へ。奥行き（zc）が NEAR より手前なら null */
    function proj(cam, x, y, z, o) {
      var dz = z - cam.cz;
      var dy = y - cam.h;
      var yc = dy * cam.c + dz * cam.s;
      var zc = -dy * cam.s + dz * cam.c;
      o[0] = cam.px + (F * x) / zc;
      o[1] = cam.py - (F * yc) / zc;
      o[2] = zc;
      return o;
    }

    var P = [0, 0, 0];
    var Q = [0, 0, 0];
    function seg(cam, ax, az, bx, bz) {
      var za = (az - cam.cz) * cam.c + cam.h * cam.s;
      var zb = (bz - cam.cz) * cam.c + cam.h * cam.s;
      if (za < NEAR && zb < NEAR) return false;
      if (za < NEAR) {
        var u = (NEAR - za) / (zb - za);
        ax = ax + (bx - ax) * u;
        az = az + (bz - az) * u;
      } else if (zb < NEAR) {
        var w = (NEAR - zb) / (za - zb);
        bx = bx + (ax - bx) * w;
        bz = bz + (az - bz) * w;
      }
      proj(cam, ax, 0, az, P);
      proj(cam, bx, 0, bz, Q);
      return true;
    }

    /** 原点からの距離が r 以内になる、道（a + s·d）の s の範囲を SPAN へ（0〜1 に切る）。ないなら false */
    function within(A, B, C, r) {
      var disc = B * B - 4 * A * (C - r * r);
      if (disc <= 0 || A <= 0) return false;
      var q = Math.sqrt(disc);
      var s0 = (-B - q) / (2 * A);
      var s1 = (-B + q) / (2 * A);
      if (s1 <= 0 || s0 >= 1) return false;
      SPAN[0] = s0 < 0 ? 0 : s0;
      SPAN[1] = s1 > 1 ? 1 : s1;
      return true;
    }
    function part(cam, ax, az, dx, dz, s0, s1, out) {
      if (s1 - s0 < 1e-4) return;
      proj(cam, ax + dx * s0, 0, az + dz * s0, P);
      proj(cam, ax + dx * s1, 0, az + dz * s1, Q);
      if (P[2] < NEAR || Q[2] < NEAR) return;
      out.push(P[0], P[1], Q[0], Q[1]);
    }
    /** 道のうち、原点からの距離が r1〜r2 の部分（光の波の帯）を out へ */
    function band(cam, ax, az, bx, bz, r1, r2, out) {
      var dx = bx - ax;
      var dz = bz - az;
      var A = dx * dx + dz * dz;
      var B = 2 * (ax * dx + az * dz);
      var C = ax * ax + az * az;
      if (!within(A, B, C, r2)) return;
      var lo = SPAN[0];
      var hi = SPAN[1];
      if (r1 > 0 && within(A, B, C, r1) && SPAN[1] > lo && SPAN[0] < hi) {
        var i0 = SPAN[0];
        var i1 = SPAN[1];
        if (i0 > lo) part(cam, ax, az, dx, dz, lo, i0, out);
        if (i1 < hi) part(cam, ax, az, dx, dz, i1, hi, out);
      } else part(cam, ax, az, dx, dz, lo, hi, out);
    }

    function bucket(z) {
      return z < DEPTH[0] ? 0 : z < DEPTH[1] ? 1 : z < DEPTH[2] ? 2 : z < DEPTH[3] ? 3 : -1;
    }

    function drawSky(cam, t) {
      var fade = clamp01((t - 0.05) / 0.45) * (1 - cam.v);
      if (fade <= 0.01) return;
      var hy = cam.phi < 1.45 ? cam.py - F * Math.tan(cam.phi) : -1e4;
      // 星（地平線より上だけ）
      for (var k = 0; k < stars.length; k++) {
        var st = stars[k];
        if (st[1] > hy - 6) continue;
        var tw2 = 0.55 + 0.45 * Math.sin(t * 3.1 + st[3]);
        ctx.globalAlpha = fade * st[4] * tw2;
        ctx.fillStyle = "#dfe9ff";
        ctx.fillRect(st[0], st[1], st[2], st[2]);
      }
      ctx.globalAlpha = 1;
      if (hy < -200 || hy > H + 200) return;
      // 地平線の光（街の光が広がるほど明るく）と、光の出どころ（地平線の真ん中・M の方角）の暖かい光
      var light = clamp01((t - 0.1) / 1.2);
      var g = ctx.createLinearGradient(0, hy - 90, 0, hy + 70);
      g.addColorStop(0, "rgba(70,110,220,0)");
      g.addColorStop(0.55, "rgba(90,140,255," + (0.16 + 0.14 * light) * fade + ")");
      g.addColorStop(1, "rgba(70,110,220,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-W * 0.25, hy - 90, W * 1.5, 160);
      var rg = ctx.createRadialGradient(cam.px, hy, 0, cam.px, hy, W * 0.62);
      rg.addColorStop(0, "rgba(255,206,140," + (0.55 * light + 0.12) * fade + ")");
      rg.addColorStop(0.3, "rgba(255,150,80," + 0.18 * light * fade + ")");
      rg.addColorStop(1, "rgba(255,150,80,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(-W * 0.25, hy - W * 0.62, W * 1.5, W * 1.24);
    }

    function drawRoads(cam, t) {
      var k;
      for (k = 0; k < 8; k++) batch[k].length = 0;
      for (k = 0; k < 3; k++) wave[k].length = 0;
      heads.length = 0;
      cars.length = 0;
      trails.length = 0;
      var dim = 1 - 0.74 * cam.v;
      var edge = cam.roll ? 100 : 40;
      var wr = t > WAVE_AT ? (t - WAVE_AT) * WAVE_SPEED : -1;
      var wa = 1 - clamp01((t - WAVE_AT) / WAVE_LEN);
      for (var i = 0; i < roads.length; i += 6) {
        var rv = (t - roads[i + 5]) / 0.085;
        if (rv <= 0) continue;
        var ax = roads[i];
        var az = roads[i + 1];
        var bx = roads[i + 2];
        var bz = roads[i + 3];
        var kind = roads[i + 4];
        var head = rv < 1;
        if (head) {
          bx = ax + (bx - ax) * rv;
          bz = az + (bz - az) * rv;
        }
        if (!seg(cam, ax, az, bx, bz)) continue;
        var zc = (P[2] + Q[2]) / 2;
        var b = bucket(zc);
        if (b < 0) continue;
        if ((P[0] < -edge && Q[0] < -edge) || (P[0] > W + edge && Q[0] > W + edge) || (P[1] < -edge && Q[1] < -edge) || (P[1] > H + edge && Q[1] > H + edge)) continue;
        batch[b * 2 + kind].push(P[0], P[1], Q[0], Q[1]);
        if (head) {
          if (heads.length < (lite ? 120 : 480)) heads.push(Q[0], Q[1], Q[2], kind);
          continue;
        }
        // 光の波：M から広がる輪の帯に入る部分だけを明るく（道は原点に近い端から 120 以内なので、遠い道は飛ばす）
        if (wr > 0 && wa > 0) {
          var d0 = (roads[i + 5] - SPREAD_FROM) * SPREAD;
          if (d0 - 120 < wr + WAVE_W && d0 + 120 > wr - WAVE_W) {
            for (var wb = 0; wb < 3; wb++) {
              var hw = (WAVE_W * (3 - wb)) / 3;
              band(cam, ax, az, bx, bz, wr - hw, wr + hw, wave[wb]);
            }
          }
        }
        // 大通りを走る車の光と、その尾（M から外へ流れる。道ごとに少しずつずらす）
        if (!lite && kind === 1 && b < 3 && cars.length < 4 * 260) {
          var f = (t * 0.8 + ((i / 6) * 0.618034) % 1) % 1;
          var fb = f > 0.24 ? f - 0.24 : 0;
          proj(cam, ax + (bx - ax) * fb, 0, az + (bz - az) * fb, P);
          proj(cam, ax + (bx - ax) * f, 0, az + (bz - az) * f, Q);
          if (P[2] > NEAR && Q[2] > NEAR) {
            cars.push(Q[0], Q[1], Q[2], 0);
            trails.push(P[0], P[1], Q[0], Q[1]);
          }
        }
      }
      ctx.lineCap = "round";
      for (var pass = lite ? 1 : 0; pass < 2; pass++) {
        for (k = 7; k >= 0; k--) {
          var arr = batch[k];
          if (!arr.length) continue;
          var bb = k >> 1;
          var kd = k & 1;
          if (pass === 0 && bb === 3) continue;
          var a = ALPHA[bb] * dim;
          ctx.strokeStyle = "rgba(" + COLOR[kd] + "," + (pass === 0 ? a * 0.13 : a) + ")";
          ctx.lineWidth = pass === 0 ? WIDTH[bb][kd] * 5 : WIDTH[bb][kd];
          ctx.beginPath();
          for (var j = 0; j < arr.length; j += 4) {
            ctx.moveTo(arr[j], arr[j + 1]);
            ctx.lineTo(arr[j + 2], arr[j + 3]);
          }
          ctx.stroke();
        }
      }
      // 光の波（にじみと芯）
      if (wr > 0 && wa > 0) {
        for (var wp = lite ? 1 : 0; wp < 2; wp++) {
          for (k = 0; k < 3; k++) {
            var wl = wave[k];
            if (!wl.length) continue;
            ctx.strokeStyle = "rgba(255,232,190," + WAVE_A[k] * wa * (wp === 0 ? 0.22 : 1) + ")";
            ctx.lineWidth = wp === 0 ? 7 : 1.7;
            ctx.beginPath();
            for (var wj = 0; wj < wl.length; wj += 4) {
              ctx.moveTo(wl[wj], wl[wj + 1]);
              ctx.lineTo(wl[wj + 2], wl[wj + 3]);
            }
            ctx.stroke();
          }
        }
      }
      // 車の光（金の大通りの上で目立つよう、白く青い光。尾は細い線、先は光の点）
      if (trails.length) {
        ctx.strokeStyle = "rgba(225,238,255," + 0.6 * dim + ")";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (var tj = 0; tj < trails.length; tj += 4) {
          ctx.moveTo(trails[tj], trails[tj + 1]);
          ctx.lineTo(trails[tj + 2], trails[tj + 3]);
        }
        ctx.stroke();
      }
      for (var cc = 0; cc < cars.length; cc += 4) {
        var cz2 = cars[cc + 2];
        var cs = Math.max(4, Math.min(18, (F * 10) / cz2));
        ctx.globalAlpha = dim * (cz2 < 1500 ? 1 : 0.6);
        ctx.drawImage(sprite, cars[cc] - cs / 2, cars[cc + 1] - cs / 2, cs, cs);
      }
      ctx.globalAlpha = 1;
      // 光の先（道を走る光の頭）
      for (var h = 0; h < heads.length; h += 4) {
        var z = heads[h + 2];
        var size = Math.max(4, Math.min(30, (F * 15) / z));
        ctx.globalAlpha = dim * (z < 1500 ? 1 : 0.6);
        ctx.drawImage(heads[h + 3] === 1 ? gold : sprite, heads[h] - size / 2, heads[h + 1] - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    }

    function drawTowers(cam, t) {
      var fade = 1 - cam.v;
      if (fade <= 0.02) return;
      ctx.lineCap = "butt";
      for (var i = 0; i < tw.length; i += 4) {
        var on = clamp01((t - tw[i + 3]) / 0.25);
        if (on <= 0) continue;
        proj(cam, tw[i], 0, tw[i + 1], P);
        if (P[2] < NEAR || P[2] > 3200) continue;
        proj(cam, tw[i], tw[i + 2] * on, tw[i + 1], Q);
        if (Q[2] < NEAR) continue;
        if (P[0] < -80 || P[0] > W + 80) continue;
        var wdt = Math.max(0.7, Math.min(4, (F * 9) / P[2]));
        var a = (P[2] < 1500 ? 0.55 : 0.32) * fade;
        ctx.strokeStyle = "rgba(255,214,160," + a + ")";
        ctx.lineWidth = wdt;
        ctx.beginPath();
        ctx.moveTo(P[0], P[1]);
        ctx.lineTo(Q[0], Q[1]);
        ctx.stroke();
        // 屋上の灯
        var s2 = wdt * 2.6;
        ctx.globalAlpha = a * 1.4 > 1 ? 1 : a * 1.4;
        ctx.drawImage(gold, Q[0] - s2 / 2, Q[1] - s2 / 2, s2, s2);
        ctx.globalAlpha = 1;
      }
    }

    /** 金色の M：左の山が描かれ、少し遅れて右の山。描き終わると、ふくらむように強く光る */
    function drawMark(cam, t) {
      var starts = [2.0, 2.2];
      var DUR = 0.44;
      var pulse = t > 2.64 ? Math.max(0, 1 - Math.abs(t - 2.74) / 0.14) : 0;
      var ma = 1 - clamp01((t - 2.82) / 0.3);
      if (ma <= 0) return;
      ctx.globalAlpha = ma;
      for (var m = 0; m < 2; m++) {
        var p = clamp01((t - starts[m]) / DUR);
        if (p <= 0) continue;
        p = 1 - Math.pow(1 - p, 2.2);
        var path = mark[m];
        var pts = [];
        var lens = [];
        var total = 0;
        for (var k = 0; k < path.length; k++) {
          var o = proj(cam, path[k][0], 0, path[k][1], [0, 0, 0]);
          pts.push(o);
          if (k > 0) {
            var l = Math.sqrt((o[0] - pts[k - 1][0]) * (o[0] - pts[k - 1][0]) + (o[1] - pts[k - 1][1]) * (o[1] - pts[k - 1][1]));
            lens.push(l);
            total += l;
          }
        }
        if (pts[0][2] < NEAR) continue;
        var want = total * p;
        var hx = pts[0][0];
        var hy = pts[0][1];
        var scale = F / pts[0][2];
        // 太さは、最後のロゴのマークの太さ（地面で約 20）に合わせる（低く近いときも太くなりすぎない）
        var core = Math.min(4.2, Math.max(1.6, 20 * scale * 0.42));
        for (var pass = 0; pass < 3; pass++) {
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.strokeStyle = pass === 0 ? "rgba(255,170,70," + (0.22 + 0.3 * pulse) + ")" : pass === 1 ? "rgba(255,206,130," + (0.55 + 0.3 * pulse) + ")" : "rgba(255,248,226,0.96)";
          ctx.lineWidth = pass === 0 ? core * 5.5 : pass === 1 ? core * 2.2 : core * (1 + 0.35 * pulse);
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          var acc = 0;
          for (var s = 1; s < pts.length; s++) {
            var segLen = lens[s - 1];
            if (acc + segLen <= want) {
              ctx.lineTo(pts[s][0], pts[s][1]);
              hx = pts[s][0];
              hy = pts[s][1];
            } else {
              var f = (want - acc) / segLen;
              hx = pts[s - 1][0] + (pts[s][0] - pts[s - 1][0]) * f;
              hy = pts[s - 1][1] + (pts[s][1] - pts[s - 1][1]) * f;
              ctx.lineTo(hx, hy);
              break;
            }
            acc += segLen;
          }
          ctx.stroke();
        }
        if (p < 1) {
          var hs = Math.max(18, core * 9);
          ctx.drawImage(gold, hx - hs / 2, hy - hs / 2, hs, hs);
        }
      }
      ctx.globalAlpha = 1;
    }

    function draw(t) {
      var cam = pose(t, W, H, hf, mx, my);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // 低く飛ぶあいだは、画面の真ん中を軸に少し傾ける
      if (cam.roll) {
        ctx.translate(cam.px, cam.py);
        ctx.rotate(cam.roll);
        ctx.translate(-cam.px, -cam.py);
      }
      ctx.globalCompositeOperation = "lighter";
      drawSky(cam, t);
      drawRoads(cam, t);
      if (!lite) drawTowers(cam, t);
      drawMark(t > B1 ? pose(B1, W, H, hf, mx, my) : cam, t);
      ctx.globalCompositeOperation = "source-over";
    }

    function frame(now) {
      // 終わった・触れて飛ばした（幕と一緒に消えていく）ら、描くのをやめる（最後の絵はそのまま）
      if (html.getAttribute("data-launch") !== "full" || html.classList.contains("launch-skip")) return;
      if (!cv) {
        cv = d.querySelector(".launch-canvas");
        if (!cv) {
          if (now < 6000) root.requestAnimationFrame(frame);
          return;
        }
        ctx = cv.getContext("2d");
        if (!ctx || !setup()) {
          cv = null;
          return;
        }
        // ここから長い版の時間割（app/globals.css）
        html.setAttribute("data-grand", "");
        t0 = now;
      }
      var t = (now - t0) / 1000;
      // 遅い端末では、光のにじみ・高い建物・光の頭を減らす（1コマ 45ms を超えることが続いたら）
      if (last && now - last > 45) slow++;
      if (slow > 5) lite = true;
      last = now;
      if (t >= END) {
        // 最後の形のまま止める（ロゴの後ろにうっすら残り、幕と一緒に上がる。app/globals.css）
        draw(END);
        return;
      }
      draw(t);
      root.requestAnimationFrame(frame);
    }
    root.requestAnimationFrame(frame);
  }

  // 試験（components/app/launch-city.test.ts）からは、描かずに中身だけを渡す
  if (root.__michiluLaunchTest) {
    root.__michiluLaunchTest({ rng: rng, cityRoads: cityRoads, towers: towers, pose: pose, MARK: MARK, timing: { A0: A0, A1: A1, B1: B1, DIVE: DIVE, END: END, WAVE_AT: WAVE_AT, WAVE_LEN: WAVE_LEN } });
    return;
  }
  run();
})(typeof window !== "undefined" ? window : globalThis);
