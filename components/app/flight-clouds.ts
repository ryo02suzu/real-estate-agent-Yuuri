// 「地球から土地へ降りる」演出の雲（components/app/globe-flight.tsx が地図の上の透明な板に描く）。降りていく途中（ズーム 5〜8）で
// 3 枚の雲の層を下から近づいてくるように大きくし、ふわっと濃くなってから抜ける（雲を突き抜ける感じ）。雲の形は決まった種から作る
// MICHILU の絵（components/app/flight-look.ts の cloudField）で、時間帯の色（LOOKS の cloud）で塗る。地図の向きに合わせて回す
import { cloudField, LOOKS, type FlightMood } from "./flight-look";

/** 雲の層の高さ（地図のズームで。この値のとき、雲の模様がもとの大きさになる） */
const LAYERS = [
  { z: 5.7, dx: 0.0, dy: 0.0, k: 1 },
  { z: 6.5, dx: 0.37, dy: 0.21, k: 0.85 },
  { z: 7.3, dx: 0.71, dy: 0.58, k: 0.7 },
];
const TEX = 384;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 雲の絵（時間帯の色で塗った、透けるキャンバス） */
function cloudTexture(mood: FlightMood): HTMLCanvasElement {
  const f = cloudField(TEX / 2, 11);
  const n = TEX / 2;
  const c = document.createElement("canvas");
  c.width = TEX;
  c.height = TEX;
  const small = document.createElement("canvas");
  small.width = n;
  small.height = n;
  const sctx = small.getContext("2d")!;
  const img = sctx.createImageData(n, n);
  const { light, shade, alpha } = LOOKS[mood].cloud;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const v = f[y * n + x];
      // 光の当たる側（左上）が明るく、反対側が影になる
      const up = f[((y + n - 2) % n) * n + ((x + n - 2) % n)];
      const lit = Math.min(1, Math.max(0, 0.55 + (v - up) * 2.4 + v * 0.35));
      const i = (y * n + x) * 4;
      img.data[i] = shade[0] + (light[0] - shade[0]) * lit;
      img.data[i + 1] = shade[1] + (light[1] - shade[1]) * lit;
      img.data[i + 2] = shade[2] + (light[2] - shade[2]) * lit;
      img.data[i + 3] = Math.round(255 * Math.pow(v, 0.85) * alpha);
    }
  sctx.putImageData(img, 0, 0);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(small, 0, 0, TEX, TEX);
  return c;
}

export type CloudPainter = { draw(zoom: number, bearing: number): void; resize(): void; dispose(): void };

/** 雲を描く板を用意する（canvas は地図の上に重ねた透明な板） */
export function cloudPainter(canvas: HTMLCanvasElement, mood: FlightMood): CloudPainter {
  const tex = cloudTexture(mood);
  const ctx = canvas.getContext("2d")!;
  let W = 0;
  let H = 0;
  let dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  };
  resize();
  let last = -1;
  return {
    resize,
    draw(zoom, bearing) {
      // 雲の無いところでは描き直さない（ズームが雲の層から離れていて、前も空だったとき）
      const any = LAYERS.some((l) => {
        const s = 2 ** (zoom - l.z);
        return s > 0.3 && s < 5;
      });
      if (!any && last === 0) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      last = 0;
      if (!any) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const diag = Math.hypot(W, H);
      for (const l of LAYERS) {
        const s = 2 ** (zoom - l.z);
        // 遠いうちは薄く、近づくと濃く、通り抜けるときにいちど画面をおおってから消える
        const o = smooth(0.32, 0.9, s) * (1 - smooth(2.4, 4.6, s)) * l.k;
        if (o <= 0.01) continue;
        last = 1;
        const size = TEX * 1.6 * s;
        ctx.save();
        ctx.globalAlpha = o;
        ctx.translate(W / 2, H / 2);
        ctx.rotate((-bearing * Math.PI) / 180);
        const ox = (l.dx * size) % size;
        const oy = (l.dy * size) % size;
        const half = diag / 2 + size;
        for (let y = -half - oy; y < half; y += size) for (let x = -half - ox; x < half; x += size) ctx.drawImage(tex, x, y, size, size);
        ctx.restore();
      }
    },
    dispose() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
