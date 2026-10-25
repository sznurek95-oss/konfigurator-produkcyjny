// @ts-nocheck — kod przeniesiony 1:1 ze starej wersji; typy dopisujemy stopniowo.
// Automatyczne wypełnianie prostokątnego obszaru modułami z biblioteki tak, żeby pokrycie wynosiło 100%.

/** Najmniejszy wymiar modułu (mm), który ma sens drukować. */
export const MINSZ = 20;
/** Tolerancja porównań położenia (mm). */
export const EPS = 0.01;
export function overlap(a, b){ return a.x < b.x+b.w-EPS && b.x < a.x+a.w-EPS && a.y < b.y+b.d-EPS && b.y < a.y+a.d-EPS; }
export const U = v => Math.round(v*2);
export const M = u => u/2;           // jednostki 0,5 mm
export function mulberry(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// prostokąty wolnego miejsca w obszarze R (przeszkody: zachowane moduły)
export function freeRects(R, obst){
  const xs = [...new Set([R.x, R.x+R.w, ...obst.flatMap(o => [o.x, o.x+o.w])].map(v => Math.min(R.x+R.w, Math.max(R.x, v))).map(U))].sort((a,b)=>a-b).map(M);
  const ys = [...new Set([R.y, R.y+R.d, ...obst.flatMap(o => [o.y, o.y+o.d])].map(v => Math.min(R.y+R.d, Math.max(R.y, v))).map(U))].sort((a,b)=>a-b).map(M);
  const nx = xs.length-1, ny = ys.length-1, free = [], used = [];
  for(let j=0;j<ny;j++){ free.push([]); used.push([]); for(let i=0;i<nx;i++){
    const cx = (xs[i]+xs[i+1])/2, cy = (ys[j]+ys[j+1])/2;
    free[j].push(!obst.some(o => cx > o.x && cx < o.x+o.w && cy > o.y && cy < o.y+o.d)); used[j].push(false); } }
  const out = [];
  for(let j=0;j<ny;j++) for(let i=0;i<nx;i++){
    if(!free[j][i] || used[j][i]) continue;
    let i2 = i; while(i2+1 < nx && free[j][i2+1] && !used[j][i2+1]) i2++;
    let j2 = j; while(j2+1 < ny){ let ok = true; for(let k=i;k<=i2;k++) if(!free[j2+1][k] || used[j2+1][k]){ ok = false; break; } if(!ok) break; j2++; }
    for(let jj=j;jj<=j2;jj++) for(let k=i;k<=i2;k++) used[jj][k] = true;
    out.push({x:xs[i], y:ys[j], w:xs[i2+1]-xs[i], d:ys[j2+1]-ys[j]});
  }
  return out;
}
// wąskie szczeliny (< 20 mm) dołączane do sąsiada o tej samej krawędzi — wolnego prostokąta albo ułożonego modułu
export function absorbThin(rects, kept){
  const near = (a,b) => Math.abs(a-b) < 0.01;
  for(let guard=0; guard<400; guard++){
    const T = rects.find(r => !r._stuck && (r.w < MINSZ - 0.01 || r.d < MINSZ - 0.01)); if(!T) break;
    const thinX = T.w < MINSZ - 0.01, others = [...rects.filter(r => r !== T).map(r => ({b:r, kind:'free'})), ...kept.map(k => ({b:k.box, kind:'kept', k}))];
    const touch = n => thinX ? (near(n.b.x + n.b.w, T.x) || near(n.b.x, T.x + T.w)) : (near(n.b.y + n.b.d, T.y) || near(n.b.y, T.y + T.d));
    const span = n => thinX ? [n.b.y, n.b.y + n.b.d] : [n.b.x, n.b.x + n.b.w], tspan = thinX ? [T.y, T.y + T.d] : [T.x, T.x + T.w];
    const merge = (n) => { const b = n.b;
      if(thinX){ const x0 = Math.min(b.x, T.x), x1 = Math.max(b.x + b.w, T.x + T.w); b.x = x0; b.w = x1 - x0; }
      else { const y0 = Math.min(b.y, T.y), y1 = Math.max(b.y + b.d, T.y + T.d); b.y = y0; b.d = y1 - y0; }
      if(n.kind === 'kept') n.k.changed = true; };
    let n = others.filter(touch).sort((a,b) => (a.kind==='free'?0:1) - (b.kind==='free'?0:1)).find(n => near(span(n)[0], tspan[0]) && near(span(n)[1], tspan[1]));
    if(n){ merge(n); rects.splice(rects.indexOf(T), 1); continue; }
    // sąsiad krótszy niż szczelina — dziel szczelinę wzdłuż
    n = others.filter(touch).find(n => span(n)[0] >= tspan[0] - 0.01 && span(n)[1] <= tspan[1] + 0.01 && span(n)[1] - span(n)[0] > 0.01);
    if(n){
      const [a0, a1] = span(n), pieces = [];
      if(a0 - tspan[0] > 0.01) pieces.push(thinX ? {x:T.x, y:tspan[0], w:T.w, d:a0 - tspan[0]} : {x:tspan[0], y:T.y, w:a0 - tspan[0], d:T.d});
      if(tspan[1] - a1 > 0.01) pieces.push(thinX ? {x:T.x, y:a1, w:T.w, d:tspan[1] - a1} : {x:a1, y:T.y, w:tspan[1] - a1, d:T.d});
      const mid = thinX ? {x:T.x, y:a0, w:T.w, d:a1 - a0} : {x:a0, y:T.y, w:a1 - a0, d:T.d};
      rects.splice(rects.indexOf(T), 1, ...pieces);
      const Tsave = Object.assign({}, T); Object.assign(T, mid); merge(n); Object.assign(T, Tsave);
      continue;
    }
    T._stuck = true;
  }
  return rects;
}
// najlepszy podział długości L (jednostki) na kawałki z listy len[] — największa suma ≤ L, potem koszt wg strategii
export function splitLen(L, lens, strat, rnd){
  const cost = lens.map(() => strat === 'mix' ? rnd() - 0.35 : 1), INF = 1e9;
  const dp = new Float64Array(L+1).fill(INF), from = new Int32Array(L+1).fill(-1); dp[0] = 0;
  const sign = strat === 'small' ? -1 : 1;
  // mix: losowe wagi (także ujemne) — w każdym rzędzie inne moduły są preferowane
  for(let s=1;s<=L;s++) for(let k=0;k<lens.length;k++){ const l = lens[k]; if(l <= s && dp[s-l] < INF){ const c = dp[s-l] + sign*cost[k]; if(c < dp[s]){ dp[s] = c; from[s] = k; } } }
  let best = 0; for(let s=L;s>0;s--) if(dp[s] < INF){ best = s; break; }
  const parts = []; let s = best; while(s > 0){ const k = from[s]; parts.push(lens[k]); s -= lens[k]; }
  if(strat === 'mix') for(let i=parts.length-1;i>0;i--){ const j = Math.floor(rnd()*(i+1)); [parts[i], parts[j]] = [parts[j], parts[i]]; }
  else parts.sort((a,b) => b-a);
  return {parts, rest: L - best};
}
// rozdziel resztę: najpierw na jeden największy kawałek (do +25%), w przeciwnym razie równo na wszystkie
export function spread(parts, rest){
  const out = parts.slice(); if(!rest) return out;
  if(!out.length) return [rest];
  let k = 0; out.forEach((p,i) => { if(p > out[k]) k = i; });
  if(rest <= out[k]*0.25){ out[k] += rest; return out; }
  const n = out.length, base = Math.floor(rest/n); let extra = rest - base*n;
  return out.map(p => p + base + (extra-- > 0 ? 1 : 0));
}
export function tileRect(R, sizes, strat, rnd){
  const W = U(R.w), H = U(R.d);
  const run = (transpose) => {
    const A = transpose ? W : H, B = transpose ? H : W;           // A: kierunek rzędów, B: długość rzędu
    const sz = sizes.map(z => ({...z, a: transpose ? U(z.w) : U(z.d), b: transpose ? U(z.d) : U(z.w)}));
    const alens = [...new Set(sz.map(z => z.a))];
    let {parts: rows, rest} = splitLen(A, alens, strat, rnd);
    if(!rows.length) rows = [Math.min(...alens)], rest = A - rows[0];
    const rowsF = spread(rows, rest);
    const cells = []; let pa = 0, stretch = 0;
    rows.forEach((ra, ri) => {
      const fa = rowsF[ri], cand = sz.filter(z => z.a === ra), blens = [...new Set(cand.map(z => z.b))];
      let {parts: cols, rest: r2} = splitLen(B, blens, strat, rnd);
      if(!cols.length) cols = [Math.min(...blens)], r2 = B - cols[0];
      const colsF = spread(cols, r2); let pb = 0;
      cols.forEach((cb, ci) => {
        const opts = cand.filter(z => z.b === cb), pick = opts[strat === 'mix' ? Math.floor(rnd()*opts.length) : 0];
        const fb = colsF[ci];
        const box = transpose ? {x:R.x + M(pa), y:R.y + M(pb), w:M(fa), d:M(fb)} : {x:R.x + M(pb), y:R.y + M(pa), w:M(fb), d:M(fa)};
        const changed = fa !== ra || fb !== cb; if(changed) stretch += Math.abs(fa-ra)*fb + Math.abs(fb-cb)*fa;
        cells.push({box, tid:pick.tid, rot:pick.rot, changed});
        pb += fb;
      });
      pa += fa;
    });
    return {cells, stretch};
  };
  const a = run(false), b = run(true);
  const key = r => r.stretch*1000 + (strat === 'small' ? -r.cells.length : r.cells.length);
  return key(a) <= key(b) ? a : b;
}
