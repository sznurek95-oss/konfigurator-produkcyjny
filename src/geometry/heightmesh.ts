// Bryła jako siatka prostokątna: każda komórka to słupek [zb, zt] — zawsze szczelna (manifold).
// Nadaje się do każdego modelu, który da się opisać jako dno + prostopadłościenne ścianki
// (wkłady, pojemniki, organizery). zb > 0 tam, gdzie od spodu jest wgłębienie.
import type { HRect, Mesh, Rect } from '../core/model.js';

export interface HeightSpec {
  W: number;
  D: number;
  floor: number;
  rects: HRect[];                 // ścianki i przegródki: [x0, y0, x1, y1, wysokość]
  engrave?: HRect[];              // napis wklęsły od góry w dnie: [.., wysokość dna pod napisem]
  pockets?: Rect[];               // wgłębienia od spodu
  labelDepth?: number;
  clip?: { at: number; part: 'lo' | 'hi' } | null;
}

export function heightMesh(g: HeightSpec): Mesh {
  const rects = g.rects, engr = g.engrave || [], pockets = g.pockets || [], dep = g.labelDepth || 0, R = (v: number) => Math.round(v * 1e4) / 1e4;
  const uniq = (a: number[]) => [...new Set(a.map(R))].sort((a, b) => a - b);
  const xs = uniq([0, g.W, ...rects.flatMap(r => [r[0], r[2]]), ...engr.flatMap(r => [r[0], r[2]]), ...pockets.flatMap(r => [r[0], r[2]])]);
  const ys = uniq([0, g.D, ...rects.flatMap(r => [r[1], r[3]]), ...engr.flatMap(r => [r[1], r[3]]), ...pockets.flatMap(r => [r[1], r[3]])]);
  const nxc = xs.length - 1, nyc = ys.length - 1, top: (number | null)[][] = [], bot: (number | null)[][] = [];
  let vol = 0;
  for (let i = 0; i < nxc; i++) {
    top.push([]); bot.push([]);
    for (let j = 0; j < nyc; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
      let h: number | null = g.floor, z0: number | null = 0;
      for (const r of rects) if (cx > r[0] && cx < r[2] && cy > r[1] && cy < r[3]) h = Math.max(h as number, r[4]);
      if (h === g.floor) for (const r of engr) if (cx > r[0] && cx < r[2] && cy > r[1] && cy < r[3]) { h = r[4]; break; }
      for (const r of pockets) if (cx > r[0] && cx < r[2] && cy > r[1] && cy < r[3]) { z0 = dep; break; }
      if (g.clip) {
        const zc = g.clip.at;
        if (g.clip.part === 'lo') h = Math.min(h as number, zc);
        else if ((h as number) <= zc + 1e-9) { h = null; z0 = null; } else z0 = zc;
      }
      top[i].push(h); bot[i].push(z0);
      if (h != null) vol += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]) * (h - (z0 as number));
    }
  }
  const levels = uniq([0, dep, g.floor, ...rects.map(r => r[4]), ...engr.map(r => r[4]), ...(g.clip ? [g.clip.at] : [])]);
  const P: number[] = [];
  type V = [number, number, number];
  const tri = (a: V, b: V, c: V) => P.push(...a, ...b, ...c);
  function quad(a: V, b: V, c: V, d: V, n: V) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] >= 0) { tri(a, b, c); tri(a, c, d); } else { tri(a, c, b); tri(a, d, c); }
  }
  const segs = (lo: number, hi: number) => { const out: [number, number][] = []; for (let k = 0; k < levels.length - 1; k++) { const a = levels[k], b = levels[k + 1]; if (a >= lo - 1e-9 && b <= hi + 1e-9) out.push([a, b]); } return out; };
  // odsłonięte fragmenty słupka A względem sąsiada B (B = null: krawędź bryły)
  const exposed = (bA: number, tA: number, bB: number | null, tB: number | null): [number, number][] =>
    bB == null ? [[bA, tA]] : [...(bA < bB ? [[bA, bB] as [number, number]] : []), ...(tA > (tB as number) ? [[tB as number, tA] as [number, number]] : [])];
  for (let i = 0; i < nxc; i++) for (let j = 0; j < nyc; j++) {
    const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1], h = top[i][j], z = bot[i][j];
    if (h == null) continue;
    quad([x0, y0, z as number], [x1, y0, z as number], [x1, y1, z as number], [x0, y1, z as number], [0, 0, -1]);
    quad([x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h], [0, 0, 1]);
  }
  for (let i = 0; i <= nxc; i++) for (let j = 0; j < nyc; j++) {
    const x = xs[i], y0 = ys[j], y1 = ys[j + 1];
    const L = i > 0 && top[i - 1][j] != null ? [bot[i - 1][j] as number, top[i - 1][j] as number] : null;
    const Rr = i < nxc && top[i][j] != null ? [bot[i][j] as number, top[i][j] as number] : null;
    const face = (iv: [number, number][], n: V) => { for (const [lo, hi] of iv) for (const [a, b] of segs(lo, hi)) quad([x, y0, a], [x, y1, a], [x, y1, b], [x, y0, b], n); };
    if (L) face(exposed(L[0], L[1], Rr ? Rr[0] : null, Rr ? Rr[1] : null), [1, 0, 0]);
    if (Rr) face(exposed(Rr[0], Rr[1], L ? L[0] : null, L ? L[1] : null), [-1, 0, 0]);
  }
  for (let j = 0; j <= nyc; j++) for (let i = 0; i < nxc; i++) {
    const y = ys[j], x0 = xs[i], x1 = xs[i + 1];
    const A = j > 0 && top[i][j - 1] != null ? [bot[i][j - 1] as number, top[i][j - 1] as number] : null;
    const B = j < nyc && top[i][j] != null ? [bot[i][j] as number, top[i][j] as number] : null;
    const face = (iv: [number, number][], n: V) => { for (const [lo, hi] of iv) for (const [a, b] of segs(lo, hi)) quad([x0, y, a], [x1, y, a], [x1, y, b], [x0, y, b], n); };
    if (A) face(exposed(A[0], A[1], B ? B[0] : null, B ? B[1] : null), [0, 1, 0]);
    if (B) face(exposed(B[0], B[1], A ? A[0] : null, A ? A[1] : null), [0, -1, 0]);
  }
  return { pos: new Float32Array(P), vol };
}

/** Kontrola szczelności: każda krawędź ma dokładnie jedną krawędź przeciwną. Zwraca liczbę błędnych krawędzi. */
export function badEdges(mesh: Mesh): number {
  const P = mesh.pos, E = new Map<string, number>(), k = (a: number, b: number, c: number) => a.toFixed(4) + ',' + b.toFixed(4) + ',' + c.toFixed(4);
  for (let i = 0; i < P.length; i += 9) {
    const v = [k(P[i], P[i + 1], P[i + 2]), k(P[i + 3], P[i + 4], P[i + 5]), k(P[i + 6], P[i + 7], P[i + 8])];
    for (let q = 0; q < 3; q++) { const e = v[q] + '>' + v[(q + 1) % 3]; E.set(e, (E.get(e) || 0) + 1); }
  }
  let bad = 0;
  for (const [e, c] of E) { const [a, b] = e.split('>'); if (c !== 1 || E.get(b + '>' + a) !== 1) bad++; }
  return bad;
}
