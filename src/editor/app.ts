// @ts-nocheck — interfejs przeniesiony 1:1 ze starej wersji; typy dopisujemy stopniowo.
import { getModel, DEFAULT_MODEL } from '../core/model.js';
import { fmt, esc, slug } from '../core/format.js';
import { PRESETS, presetFull } from '../models/wklad-szuflada.js';
import { KITS, ZONES, WALL, buildKit } from '../layout/gotowe.js';
import '../models/index.js';
import { mountSingle, renderModelTabs, showSingle, refreshSingle, activeModel, presData } from './single.js';
import { COLORS, MATS, FLOW, ROSA, ROSA_CF, SERIES, findFil, rosaName, seriesOf } from '../materials/rosa3d.js';
import { stl } from '../export/stl.js';
import { zip } from '../export/zip.js';
import { make3mfBlob } from '../export/threemf.js';
import { buildPdf } from '../export/pdf.js';
import { desktop } from './desktop.js';
import { MINSZ, EPS, overlap, U, M, mulberry, freeRects, absorbThin, splitLen, spread, tileRect } from '../layout/autofill.js';

const $ = s => document.querySelector(s);
const KEY = 'szuflada-konfigurator-v1';
const defCost = () => ({mat:'PLA', waste:5, grams:null, price:80, hours:null, watt:150, kwh:1.10});
const defSettings = () => ({tol:0.5, bed:256, snap:5, label:true, tone2On:false, tone2Color:'#2B2D2F', tone2Band:5, uniOn:false, uniColor:'#E8E6E1', cost:defCost()});
const dens = () => MATS[state.settings.cost.mat] || 1.24;

let state = {
  drawer:null,
  templates: PRESETS.map(presetFull),
  removedPresets: [],
  items: [],
  settings: defSettings()
};
let sel = null, view = '2d', uid = 1;

function load(){
  try{
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if(s && s.templates){ state = Object.assign(state, s); state.settings = Object.assign(defSettings(), s.settings||{}); state.settings.cost = Object.assign(defCost(), state.settings.cost||{}); }
  }catch(e){}
  state.items.forEach(i => { const n = +String(i.id).replace(/\D/g,''); if(n >= uid) uid = n+1; });
  state.templates.forEach(t => { const n = +String(t.id).replace(/\D/g,''); if(n >= uid) uid = n+1; });
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }

const tpl = id => state.templates.find(t => t.id === id);
// --- most do silnika modeli (każdy wariant w bibliotece należy do jakiegoś modelu) ---
const mdl = t => getModel(t && t.model);
const ctxOf = (tol = 0, label = false) => ({drawerH: state.drawer ? state.drawer.h : null, tol, label});
const tplH = t => mdl(t).height(t, ctxOf());
const fp = it => { const t = tpl(it.tid); return it.rot ? {w:t.d, d:t.w} : {w:t.w, d:t.d}; };
function geo(t, tol=0){ const g = mdl(t).spec(t, ctxOf(tol, false)); g.model = t.model || DEFAULT_MODEL; return g; }
const compartments = g => getModel(g.model).plan2d(g);

// Drugi kolor: górny pas o wysokości tone2Band mm
const viewGeo = t => { const g = mdl(t).spec(t, ctxOf(0, state.settings.label)); g.model = t.model || DEFAULT_MODEL; return g; };
function tone2At(t){
  const st = state.settings; if(!st.tone2On) return null;
  return mdl(t).splitHeight(t, ctxOf(), st.tone2Band);
}
function splitParts(g, t){
  const zc = tone2At(t); if(zc == null) return [g];
  return [Object.assign({}, g, {clip:{at:zc, part:'lo'}}), Object.assign({}, g, {clip:{at:zc, part:'hi'}})];
}
function exportGeo(t){ const g = mdl(t).spec(t, ctxOf(state.settings.tol, state.settings.label)); g.model = t.model || DEFAULT_MODEL; return g; }
const meshCache = new Map();
function meshFor(g){ const k = JSON.stringify(g); if(!meshCache.has(k)) meshCache.set(k, getModel(g.model).mesh(g, g.clip || null)); return meshCache.get(k); }
const vol = t => meshFor(geo(t, state.settings.tol)).vol;
const grams = t => vol(t)/1000*dens();

/* ---------- STL + ZIP ---------- */
function stlFile(t, qty){
  const g = exportGeo(t);
  const name = `${qty?qty+'x_':''}${slug(t.name)}_${fmt(g.W).replace(',','.')}x${fmt(g.D).replace(',','.')}x${fmt(g.H).replace(',','.')}mm.stl`;
  return {name, data: stl(meshFor(g), t.name)};
}

let dlPromise = null;
function getDl(){
  if(!dlPromise) dlPromise = (window.claude && window.claude.use) ? window.claude.use('downloads').catch(()=>null) : Promise.resolve(undefined);
  return dlPromise;
}
/* ---------- numer zamówienia w nazwie pliku ---------- */
// Dopisywany z przodu: 1234_organizer_400x480.3mf. Puste pole = nazwy jak dotąd.
function orderNo(){
  const el = $('#orderNo'); if(!el) return '';
  return el.value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/\s+/g, '_').replace(/^[._-]+|[._-]+$/g, '').slice(0, 60);
}
const withOrder = name => { const n = orderNo(); return n ? `${n}_${name}` : name; };
async function offer(filename, blob, raw = false){
  if(!raw) filename = withOrder(filename);
  if(desktop.on){
    try{ const p = await desktop.save(filename, blob); toast('Zapisano w folderze zleceń: ' + p.split(/[\\/]/).slice(-2).join('\\')); }
    catch(e){ toast('Nie udało się zapisać pliku: ' + e); }
    return;
  }
  const dl = await getDl();
  if(dl){
    try{ await dl.save({filename, data:blob}); toast('Zapisano: '+filename); }
    catch(e){
      const c = e && e.code;
      toast(c==='declined' ? 'Pobieranie anulowane.' : c==='rate_limited' ? 'Okno zapisu jest już otwarte — dokończ je i spróbuj ponownie.' : 'Pobieranie plików nie działa w tym widoku.');
    }
    return;
  }
  if(dl === null){ toast('Pobieranie plików nie działa w tym widoku.'); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function downloadTpl(t){
  const f = stlFile(t, 0);
  if(!(window.claude && window.claude.use)) offer(f.name, new Blob([f.data], {type:'model/stl'}));
  else offer(f.name.replace(/\.stl$/,'.zip'), zip([f]));
}
function downloadAll(){
  const used = usage();
  if(!used.length){ toast('W szufladzie nie ma jeszcze modułów.'); return; }
  const files = used.map(([t,q]) => stlFile(t, q));
  const d = state.drawer;
  offer(`organizer_szuflada_${d.w}x${d.d}.zip`, zip(files));
}

/* ---------- układ ---------- */
const box = it => { const f = fp(it); return {x:it.x, y:it.y, w:f.w, d:f.d}; };
function collides(r, ignore){ return state.items.some(o => o.id !== ignore && overlap(r, box(o))); }
function problems(){
  const D = state.drawer, bad = new Map();
  if(!D) return bad;
  for(const it of state.items){
    const b = box(it), t = tpl(it.tid), why = [];
    if(b.x < -EPS || b.y < -EPS || b.x+b.w > D.w+EPS || b.y+b.d > D.d+EPS) why.push('wystaje poza szufladę');
    if(collides(b, it.id)) why.push('nachodzi na inny moduł');
    if(tplH(t) > D.h + EPS) why.push('jest wyższy niż szuflada');
    if(why.length) bad.set(it.id, why);
  }
  return bad;
}
function findSpot(w, d, ignore){
  const D = state.drawer, xs = new Set([0]), ys = new Set([0]);
  state.items.forEach(o => { if(o.id===ignore) return; const b = box(o); xs.add(b.x+b.w); ys.add(b.y+b.d); xs.add(b.x); ys.add(b.y); });
  const X = [...xs].sort((a,b)=>a-b), Y = [...ys].sort((a,b)=>a-b);
  for(const y of Y) for(const x of X){
    if(x + w > D.w + EPS || y + d > D.d + EPS) continue;
    if(!collides({x,y,w,d}, ignore)) return {x,y};
  }
  return null;
}
function addItem(tid, quiet){
  const t = tpl(tid); if(!state.drawer) return false;
  let spot = findSpot(t.w, t.d), rot = 0;
  if(!spot){ spot = findSpot(t.d, t.w); rot = 1; }
  if(!spot){ if(quiet) return false; spot = {x:0,y:0}; rot = 0; toast('Brak wolnego miejsca — moduł nachodzi na inne. Przesuń go albo zmniejsz.'); }
  const it = {id:'i'+(uid++), tid, x:spot.x, y:spot.y, rot};
  state.items.push(it); sel = it.id;
  if(!quiet) commit();
  return true;
}
function sampleLayout(){
  ['p4','p5','p3','p3','p2','p2','p1','p1','p1','p1','p5','p3','p2','p1','p1'].forEach(id => addItem(id, true));
  sel = null;
}

/* ---------- 2D ---------- */
const svg = $('#svg'), NS = 'http://www.w3.org/2000/svg';
let drag = null, rafPending = false;
function rotRect(r, t, rot){ return rot ? [r[1], t.w - r[2], r[3], t.w - r[0]] : r; }
function render2d(){
  const D = state.drawer;
  $('#empty2d').hidden = !!D;
  if(!D){ svg.innerHTML = ''; return; }
  const big = Math.max(D.w, D.d), m = big*0.07 + 14, fs = big/42, wallT = Math.max(4, big/120);
  svg.setAttribute('viewBox', `${-m} ${-m} ${D.w+2*m} ${D.d+2*m}`);
  const bad = problems();
  let s = `<defs>
    <pattern id="g10" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="var(--line)" stroke-width="0.3"/></pattern>
    <pattern id="g50" width="50" height="50" patternUnits="userSpaceOnUse"><rect width="50" height="50" fill="url(#g10)"/><path d="M50 0H0V50" fill="none" stroke="var(--wall)" stroke-opacity=".45" stroke-width="0.5"/></pattern>
    <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.5" height="6" fill="var(--danger)" fill-opacity=".5"/></pattern>
  </defs>`;
  s += `<rect x="${-wallT}" y="${-wallT}" width="${D.w+2*wallT}" height="${D.d+2*wallT}" rx="${wallT/2}" fill="var(--wall)"/>`;
  s += `<rect x="0" y="0" width="${D.w}" height="${D.d}" fill="var(--floor)"/><rect class="bg" x="0" y="0" width="${D.w}" height="${D.d}" fill="url(#g50)"/>`;
  // wymiary
  const dy = -wallT - fs*1.3;
  s += `<g fill="var(--muted)" stroke="var(--muted)" font-family="IBM Plex Mono, monospace" font-size="${fs}">
    <path d="M0 ${dy}H${D.w}M0 ${dy-fs*.4}V${dy+fs*.4}M${D.w} ${dy-fs*.4}V${dy+fs*.4}" stroke-width="${fs/14}" fill="none"/>
    <text x="${D.w/2}" y="${dy-fs*.35}" text-anchor="middle" stroke="none">${D.w} mm</text>
    <path d="M${dy} 0V${D.d}M${dy-fs*.4} 0H${dy+fs*.4}M${dy-fs*.4} ${D.d}H${dy+fs*.4}" stroke-width="${fs/14}" fill="none"/>
    <text transform="translate(${dy-fs*.35} ${D.d/2}) rotate(-90)" text-anchor="middle" stroke="none">${D.d} mm</text>
    <text x="${D.w/2}" y="${D.d+wallT+fs*1.5}" text-anchor="middle" stroke="none" letter-spacing="${fs*.25}" font-family="IBM Plex Sans, sans-serif" font-weight="600">PRZÓD</text>
  </g>`;
  for(const it of state.items){
    const pv = resizePv && resizePv.id === it.id ? resizePv : null;
    const t = pv ? pv.t : tpl(it.tid), b = pv ? pv.box : box(it), g = geo(t), isSel = it.id === sel, isBad = !pv && bad.has(it.id);
    const {cells} = compartments(g);
    let inner = `<rect width="${b.w}" height="${b.d}" rx="${Math.min(2,t.wall)}" fill="${t.color}"/>`;
    for(const c of cells){ const r = rotRect(c, t, it.rot); inner += `<rect x="${r[0]}" y="${r[1]}" width="${r[2]-r[0]}" height="${r[3]-r[1]}" fill="${t.color}" fill-opacity=".38"/><rect x="${r[0]}" y="${r[1]}" width="${r[2]-r[0]}" height="${r[3]-r[1]}" fill="var(--floor)" fill-opacity=".55"/>`; }
    if(isBad) inner += `<rect width="${b.w}" height="${b.d}" fill="url(#hatch)"/>`;
    inner += `<rect width="${b.w}" height="${b.d}" fill="none" stroke="${isBad?'var(--danger)':isSel?'var(--accent)':'#000'}" stroke-opacity="${isBad||isSel?1:.25}" stroke-width="${isSel||isBad?2.5:1}" vector-effect="non-scaling-stroke" ${isBad&&!isSel?'stroke-dasharray="5 3"':''}/>`;
    const lf = Math.min(fs*0.9, b.w/6, b.d/3.2);
    if(lf > big/160){
      inner += `<g text-anchor="middle" font-size="${lf}" fill="var(--ink)" style="pointer-events:none">
        <text x="${b.w/2}" y="${b.d/2 - lf*0.15}" font-family="IBM Plex Sans, sans-serif" font-weight="600">${esc(b.w/lf > t.name.length*0.6 ? t.name : '')}</text>
        <text x="${b.w/2}" y="${b.d/2 + lf*1.05}" font-family="IBM Plex Mono, monospace" font-size="${lf*0.85}" fill-opacity=".75">${fmt(b.w)}×${fmt(b.d)}</text></g>`;
    }
    s += `<g class="it" data-id="${it.id}" transform="translate(${b.x} ${b.y})" style="cursor:${drag&&drag.id===it.id?'grabbing':'grab'}">${inner}</g>`;
  }
  // zaznaczany obszar automatycznego wypełnienia
  const fr = fill.pick ? {x:Math.min(fill.pick.x0,fill.pick.x1), y:Math.min(fill.pick.y0,fill.pick.y1), w:Math.abs(fill.pick.x1-fill.pick.x0), d:Math.abs(fill.pick.y1-fill.pick.y0)} : null;
  if(fr) s += `<rect x="${fr.x}" y="${fr.y}" width="${fr.w}" height="${fr.d}" fill="var(--accent)" fill-opacity=".18" stroke="var(--accent)" stroke-width="2" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>
    <text x="${fr.x + fr.w/2}" y="${fr.y + fr.d/2}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="${fs}" fill="var(--ink)">${fmt(fr.w)} × ${fmt(fr.d)}</text>`;
  // uchwyty do zmiany rozmiaru zaznaczonego modułu
  const si = fill.picking ? null : selItem();
  if(si){
    const b = resizePv && resizePv.id === si.id ? resizePv.box : box(si);
    const th = Math.max(3, big/85), hit = th*3.2;
    const hl = (len) => Math.max(th*3, Math.min(len*0.55, big/9));
    const H = [
      ['l', b.x - th/2, b.y + b.d/2 - hl(b.d)/2, th, hl(b.d), 'ew-resize'],
      ['r', b.x + b.w - th/2, b.y + b.d/2 - hl(b.d)/2, th, hl(b.d), 'ew-resize'],
      ['t', b.x + b.w/2 - hl(b.w)/2, b.y - th/2, hl(b.w), th, 'ns-resize'],
      ['b', b.x + b.w/2 - hl(b.w)/2, b.y + b.d - th/2, hl(b.w), th, 'ns-resize']
    ];
    s += '<g class="handles">';
    for(const [sd, x, y, w, h, cur] of H){
      const on = sd === resizeSide;
      const hx = sd==='l'||sd==='r' ? x - (hit-th)/2 : x, hy = sd==='t'||sd==='b' ? y - (hit-th)/2 : y;
      const hw = sd==='l'||sd==='r' ? hit : w, hh = sd==='t'||sd==='b' ? hit : h;
      s += `<g class="hd" data-side="${sd}" style="cursor:${cur}"><rect x="${hx}" y="${hy}" width="${hw}" height="${hh}" fill="transparent"/>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${th/2}" fill="${on ? 'var(--accent)' : 'var(--panel)'}" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/></g>`;
    }
    s += '</g>';
    if(resizePv && resizePv.id === si.id){
      const fsz = fs*0.85, isH = resizePv.side==='l'||resizePv.side==='r', val = isH ? b.w : b.d;
      const tx = b.x + b.w/2, ty = b.y + b.d/2 + fsz*0.35;
      s += `<g font-family="IBM Plex Mono, monospace" font-size="${fsz}" font-weight="500" style="pointer-events:none"><rect x="${tx - fsz*2.6}" y="${ty - fsz*1.05}" width="${fsz*5.2}" height="${fsz*1.45}" rx="${fsz*0.3}" fill="var(--ink)"/>
        <text x="${tx}" y="${ty}" text-anchor="middle" fill="var(--panel)">${fmt(val)} mm</text></g>`;
    }
  }
  svg.innerHTML = s;
}
function toMM(e){ const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
function snapAxis(v, size, max, others, thr){
  const g = state.settings.snap; let best = Math.round(v/g)*g, bd = Infinity;
  const c = [0, max-size]; others.forEach(([a0,a1]) => c.push(a1, a0-size));
  for(const k of c){ const d = Math.abs(v-k); if(d < thr && d < bd){ bd = d; best = k; } }
  return Math.max(0, Math.min(best, max-size));
}
svg.addEventListener('pointerdown', e => {
  if(fill.picking){
    const p = toMM(e), D = state.drawer, sn = v => Math.round(v/state.settings.snap)*state.settings.snap;
    fill.pick = {x0:Math.max(0,Math.min(D.w,sn(p.x))), y0:Math.max(0,Math.min(D.d,sn(p.y)))}; fill.pick.x1 = fill.pick.x0; fill.pick.y1 = fill.pick.y0;
    svg.setPointerCapture(e.pointerId); render2d(); return;
  }
  const hd = e.target.closest('.hd');
  if(hd && selItem()){
    const it = selItem();
    resizeSide = hd.dataset.side;
    drag = {mode:'resize', id:it.id, side:hd.dataset.side, orig:box(it), moved:false};
    svg.setPointerCapture(e.pointerId); render2d(); renderInspector(); return;
  }
  const g = e.target.closest('.it');
  if(!g){ if(sel){ sel = null; refresh(); } return; }
  const it = state.items.find(i => i.id === g.dataset.id); if(!it) return;
  const p = toMM(e);
  drag = {id:it.id, ox:p.x-it.x, oy:p.y-it.y, moved:false};
  sel = it.id; svg.setPointerCapture(e.pointerId); refresh();
});
svg.addEventListener('pointermove', e => {
  if(fill.picking && fill.pick){
    const p = toMM(e), D = state.drawer, thr = Math.max(2, 10 / svg.getScreenCTM().a);
    const snapE = (v, max, edges) => { let b = Math.round(v/state.settings.snap)*state.settings.snap, bd = Infinity; for(const c of edges){ const d = Math.abs(v-c); if(d < thr && d < bd){ bd = d; b = c; } } return Math.max(0, Math.min(max, b)); };
    const bx = state.items.map(box);
    fill.pick.x1 = snapE(p.x, D.w, [0, D.w, ...bx.flatMap(o => [o.x, o.x+o.w])]);
    fill.pick.y1 = snapE(p.y, D.d, [0, D.d, ...bx.flatMap(o => [o.y, o.y+o.d])]);
    if(!rafPending){ rafPending = true; requestAnimationFrame(() => { rafPending = false; render2d(); }); }
    return;
  }
  if(!drag) return;
  if(drag.mode === 'resize'){
    const it = state.items.find(i => i.id === drag.id), p = toMM(e);
    const thr = Math.max(2, 10 / svg.getScreenCTM().a);
    const nb = sideMoved(it, drag.orig, drag.side, drag.side==='l'||drag.side==='r' ? p.x : p.y, thr);
    const ob = drag.orig;
    drag.moved = drag.moved || nb.w !== ob.w || nb.d !== ob.d;
    resizePv = {id:it.id, side:drag.side, box:nb, t:resizedTpl(it, nb)};
    if(!rafPending){ rafPending = true; requestAnimationFrame(() => { rafPending = false; render2d(); }); }
    return;
  }
  const it = state.items.find(i => i.id === drag.id), D = state.drawer, f = fp(it), p = toMM(e);
  const others = state.items.filter(o => o.id !== it.id).map(box);
  const thr = Math.max(2, 10 / svg.getScreenCTM().a);
  const nx = snapAxis(p.x - drag.ox, f.w, D.w, others.map(o=>[o.x,o.x+o.w]), thr);
  const ny = snapAxis(p.y - drag.oy, f.d, D.d, others.map(o=>[o.y,o.y+o.d]), thr);
  if(nx !== it.x || ny !== it.y){ it.x = nx; it.y = ny; drag.moved = true;
    if(!rafPending){ rafPending = true; requestAnimationFrame(() => { rafPending = false; render2d(); renderStatus(); renderInspector(); }); } }
});
const endDrag = () => {
  if(fill.picking && fill.pick){
    const P = fill.pick, r = {x:Math.min(P.x0,P.x1), y:Math.min(P.y0,P.y1), w:Math.abs(P.x1-P.x0), d:Math.abs(P.y1-P.y0)};
    fill.picking = false; fill.pick = null; $('#pickBanner').hidden = true;
    if(r.w < MINSZ || r.d < MINSZ){ toast(`Zaznaczony obszar jest za mały — każdy bok musi mieć co najmniej ${MINSZ} mm.`); render2d(); openFill(); return; }
    fill.region = r; fill.area = 'region'; render2d(); openFill(); return;
  }
  if(!drag) return;
  if(drag.mode === 'resize'){
    const it = state.items.find(i => i.id === drag.id), pv = resizePv, moved = drag.moved;
    drag = null; resizePv = null;
    if(moved && pv) applyBox(it, pv.box); else { render2d(); renderInspector(); }
    return;
  }
  const m = drag.moved; drag = null; if(m) commit(); else render2d(); };
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);

/* ---------- zmiana rozmiaru wybranego boku ---------- */
let resizeSide = 'r', resizePv = null;
const SIDE_NAMES = {l:'lewy', r:'prawy', t:'tylny', b:'przedni'};
const r05 = v => Math.round(v*2)/2;
// nowa ramka po przesunięciu boku na pozycję v (mm w układzie szuflady), z przyciąganiem
function sideMoved(it, ob, side, v, thr){
  const D = state.drawer, others = state.items.filter(o => o.id !== it.id).map(box);
  const horiz = side==='l' || side==='r';
  const cands = horiz ? [0, D.w, ...others.flatMap(o => [o.x, o.x+o.w])] : [0, D.d, ...others.flatMap(o => [o.y, o.y+o.d])];
  const g = state.settings.snap; let best = Math.round(v/g)*g, bd = Infinity;
  if(thr) for(const c of cands){ const d = Math.abs(v-c); if(d < thr && d < bd){ bd = d; best = c; } }
  v = r05(best);
  const b = {...ob};
  if(side==='r'){ v = Math.min(D.w, Math.max(ob.x + MINSZ, v)); b.w = v - ob.x; }
  if(side==='l'){ v = Math.max(0, Math.min(ob.x + ob.w - MINSZ, v)); b.x = v; b.w = ob.x + ob.w - v; }
  if(side==='b'){ v = Math.min(D.d, Math.max(ob.y + MINSZ, v)); b.d = v - ob.y; }
  if(side==='t'){ v = Math.max(0, Math.min(ob.y + ob.d - MINSZ, v)); b.y = v; b.d = ob.y + ob.d - v; }
  return b;
}
// granica, do której bok może dojść: najbliższy sąsiad w tym kierunku albo ścianka szuflady
function fitEdge(it, side){
  const D = state.drawer, b = box(it), others = state.items.filter(o => o.id !== it.id).map(box);
  const ovY = o => o.y < b.y + b.d - EPS && b.y < o.y + o.d - EPS, ovX = o => o.x < b.x + b.w - EPS && b.x < o.x + o.w - EPS;
  if(side==='r') return others.filter(o => ovY(o) && o.x > b.x + EPS).reduce((m,o) => Math.min(m, o.x), D.w);
  if(side==='l') return others.filter(o => ovY(o) && o.x + o.w < b.x + b.w - EPS).reduce((m,o) => Math.max(m, o.x + o.w), 0);
  if(side==='b') return others.filter(o => ovX(o) && o.y > b.y + EPS).reduce((m,o) => Math.min(m, o.y), D.d);
  return others.filter(o => ovX(o) && o.y + o.d < b.y + b.d - EPS).reduce((m,o) => Math.max(m, o.y + o.d), 0);
}
function fitSide(it, side){
  const ob = box(it), nb = sideMoved(it, ob, side, fitEdge(it, side), 0);
  if(Math.abs(nb.w - ob.w) < 0.25 && Math.abs(nb.d - ob.d) < 0.25){ toast(`Bok ${SIDE_NAMES[side]} już przylega do sąsiada lub ścianki.`); return; }
  applyBox(it, nb);
}
function setSideSize(it, side, size){
  const ob = box(it), horiz = side==='l' || side==='r';
  const v = side==='r' ? ob.x + size : side==='l' ? ob.x + ob.w - size : side==='b' ? ob.y + size : ob.y + ob.d - size;
  const nb = sideMoved(it, ob, side, v, 0);
  if(Math.abs((horiz ? nb.w : nb.d) - size) > 0.3) toast(`Bok ${SIDE_NAMES[side]} doszedł do ${horiz ? (side==='r' ? 'prawej' : 'lewej') : (side==='b' ? 'przedniej' : 'tylnej')} ścianki — wymiar ${fmt(horiz ? nb.w : nb.d)} mm.`);
  applyBox(it, nb);
}
// wymiary szablonu dla ramki (z uwzględnieniem obrotu) + korekta liczby przegródek
function dimsFor(it, nb){ return it.rot ? {w:nb.d, d:nb.w} : {w:nb.w, d:nb.d}; }
const fixCells = t => mdl(t).normalize(t);
function resizedTpl(it, nb){ return fixCells(Object.assign({}, tpl(it.tid), dimsFor(it, nb))); }
function applyBox(it, nb){
  const t = tpl(it.tid), dm = dimsFor(it, nb);
  if(Math.abs(dm.w - t.w) < 0.01 && Math.abs(dm.d - t.d) < 0.01){ it.x = nb.x; it.y = nb.y; commit(); return; }
  const users = state.items.filter(i => i.tid === t.id).length;
  const baseName = t.baseName || t.name, baseId = t.base || t.id;
  const want = fixCells(Object.assign({}, t, dm));
  let target, msg;
  if(!t.preset && users === 1 && t.base){
    Object.assign(t, {w:want.w, d:want.d, nx:want.nx, ny:want.ny, name:`${baseName} ${fmt(want.w)}×${fmt(want.d)}`});
    target = t; msg = `Wariant zmieniony na ${fmt(want.w)} × ${fmt(want.d)} mm.`;
  } else {
    target = state.templates.find(x => x !== t && (x.base || x.id) === baseId && Math.abs(x.w - want.w) < 0.01 && Math.abs(x.d - want.d) < 0.01 &&
      x.nx === want.nx && x.ny === want.ny && x.wall === t.wall && x.floor === t.floor && x.divPct === t.divPct && x.hAuto === t.hAuto && x.h === t.h);
    if(target) msg = `Użyto istniejącego wariantu „${target.name}”.`;
    else {
      target = Object.assign(JSON.parse(JSON.stringify(t)), {id:'c'+(uid++), preset:false, base:baseId, baseName, w:want.w, d:want.d, nx:want.nx, ny:want.ny,
        name:`${baseName} ${fmt(want.w)}×${fmt(want.d)}`});
      state.templates.splice(state.templates.indexOf(t) + 1, 0, target);
      msg = `Utworzono wariant „${target.name}” tylko dla tego elementu${users > 1 ? ` — pozostałe ${users-1} szt. „${t.name}” bez zmian` : ''}.`;
    }
    it.tid = target.id;
    if(!t.preset && t.base && !state.items.some(i => i.tid === t.id)) state.templates = state.templates.filter(x => x !== t);
  }
  if(want.nx !== t.nx || want.ny !== t.ny) msg += ` Liczba przegródek zmniejszona do ${want.nx}×${want.ny}, żeby nie były węższe niż 8 mm.`;
  it.x = nb.x; it.y = nb.y; commit(); toast(msg);
}

/* ---------- akcje ---------- */
function selItem(){ return state.items.find(i => i.id === sel); }
function rotate(it){
  const D = state.drawer; it.rot = it.rot ? 0 : 1; const f = fp(it);
  it.x = Math.max(0, Math.min(it.x, D.w - f.w)); it.y = Math.max(0, Math.min(it.y, D.d - f.d)); commit();
}
function duplicate(it){
  const f = fp(it), spot = findSpot(f.w, f.d);
  const n = {id:'i'+(uid++), tid:it.tid, rot:it.rot, x: spot?spot.x:it.x, y: spot?spot.y:it.y};
  if(!spot) toast('Brak wolnego miejsca — kopia nachodzi na oryginał.');
  state.items.push(n); sel = n.id; commit();
}
function removeItem(it){ state.items = state.items.filter(i => i !== it); sel = null; commit(); }
document.addEventListener('keydown', e => {
  if(e.target.closest('input,select,textarea') || !$('#ovTpl').hidden || !$('#ovDrawer').hidden || !$('#ovLay').hidden || !$('#ovFill').hidden || !$('#ovKit').hidden) return;
  const it = selItem(); if(!it) return;
  const st = e.shiftKey ? 10 : state.settings.snap, D = state.drawer, f = fp(it);
  const mv = (dx,dy) => { it.x = Math.max(0, Math.min(it.x+dx, D.w-f.w)); it.y = Math.max(0, Math.min(it.y+dy, D.d-f.d)); commit(); e.preventDefault(); };
  if(e.key==='ArrowLeft') mv(-st,0); else if(e.key==='ArrowRight') mv(st,0);
  else if(e.key==='ArrowUp') mv(0,-st); else if(e.key==='ArrowDown') mv(0,st);
  else if(e.key==='r'||e.key==='R') rotate(it);
  else if(e.key==='d'||e.key==='D') duplicate(it);
  else if(e.key==='Delete'||e.key==='Backspace'){ removeItem(it); e.preventDefault(); }
  else if(e.key==='Escape'){ sel=null; refresh(); }
});

/* ---------- panele ---------- */
function miniSvg(t, size=52){
  const g = geo(t), {cells} = compartments(g), s = Math.max(g.W, g.D);
  let r = `<rect width="${g.W}" height="${g.D}" rx="${s/40}" fill="${t.color}"/>`;
  cells.forEach(c => r += `<rect x="${c[0]}" y="${c[1]}" width="${c[2]-c[0]}" height="${c[3]-c[1]}" fill="var(--floor)" fill-opacity=".6"/>`);
  return `<svg viewBox="${-s*.04} ${-s*.04} ${g.W+s*.08} ${g.D+s*.08}" width="${size}" height="${size}" aria-hidden="true">${r}</svg>`;
}
function usage(){
  const m = new Map(); state.items.forEach(i => m.set(i.tid, (m.get(i.tid)||0)+1));
  return state.templates.filter(t => m.has(t.id)).map(t => [t, m.get(t.id)]);
}
let libAsk = null;
function deleteTpl(t){
  state.items = state.items.filter(i => i.tid !== t.id);
  state.templates = state.templates.filter(x => x !== t);
  if(t.preset){ state.removedPresets = state.removedPresets || []; if(!state.removedPresets.includes(t.id)) state.removedPresets.push(t.id); }
  if(sel && !selItem()) sel = null;
  libAsk = null; commit(); toast(`Usunięto moduł „${t.name}”.`);
}
function restorePresets(){
  PRESETS.forEach((p, i) => { if(!state.templates.some(t => t.id === p.id)) state.templates.splice(Math.min(i, state.templates.length), 0, presetFull(p)); });
  state.removedPresets = []; commit();
}
function renderHAll(){
  const ts = state.templates; if(!ts.length){ $('#hAllInfo').textContent = ''; return; }
  const hs = [...new Set(ts.map(tplH))], allAuto = ts.every(t => t.hAuto);
  if(document.activeElement !== $('#hAll')) $('#hAll').value = hs.length === 1 ? hs[0] : '';
  $('#hAll').placeholder = hs.length > 1 ? 'różne' : '';
  const D = state.drawer;
  $('#hAllInfo').textContent = allAuto && D ? `Teraz: dopasowane do szuflady (${tplH(ts[0])} mm, czyli ${fmt(D.h)} − 3 mm).`
    : hs.length === 1 ? `Teraz: wszystkie moduły mają ${fmt(hs[0])} mm.` : `Teraz: moduły mają różne wysokości (${hs.map(h => fmt(h)).join(', ')} mm).`;
}
$('#hAllApply').onclick = () => {
  const v = parseFloat(String($('#hAll').value).replace(',', '.'));
  if(!isFinite(v) || v < 10 || v > 400){ toast('Podaj wysokość od 10 do 400 mm.'); return; }
  state.templates.forEach(t => { t.hAuto = false; t.h = Math.round(v*10)/10; });
  commit();
  const D = state.drawer;
  toast(D && v > D.h ? `Ustawiono ${fmt(v)} mm — to więcej niż wysokość szuflady (${fmt(D.h)} mm).` : `Wszystkie moduły mają teraz ${fmt(v)} mm wysokości.`);
};
$('#hAll').addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); $('#hAllApply').click(); } });
$('#hAllAuto').onclick = () => {
  state.templates.forEach(t => { t.hAuto = true; });
  commit(); toast(state.drawer ? `Wysokość modułów dopasowana do szuflady: ${tplH(state.templates[0]||{hAuto:true})} mm.` : 'Wysokość dopasuje się do szuflady po podaniu jej wymiarów.');
};
function renderLib(){
  renderHAll();
  const cnt = new Map(); state.items.forEach(i => cnt.set(i.tid, (cnt.get(i.tid)||0)+1));
  const missing = PRESETS.filter(p => !state.templates.some(t => t.id === p.id)).length;
  $('#lib').innerHTML = (state.templates.length ? '' : '<li class="hint">Biblioteka jest pusta. Dodaj nowy moduł albo przywróć gotowe.</li>') + state.templates.map(t => {
    const g = geo(t), c = cnt.get(t.id)||0;
    if(libAsk === t.id) return `<li class="mod confirm">${miniSvg(t)}
      <div class="nm"><span>${esc(t.name)}</span></div>
      <div class="meta">${fmt(g.W)} × ${fmt(g.D)} × ${fmt(g.H)}</div>
      <div class="ask"><span>${c ? `Usunąć moduł i ${c} szt. z szuflady?` : 'Usunąć ten moduł z biblioteki?'}</span>
        <button class="btn dng" data-act="delyes" data-t="${t.id}" type="button">Usuń</button>
        <button class="btn" data-act="delno" data-t="${t.id}" type="button">Anuluj</button></div></li>`;
    return `<li class="mod"><button class="xdel" data-act="del" data-t="${t.id}" type="button" title="Usuń moduł" aria-label="Usuń moduł ${esc(t.name)}">×</button>${miniSvg(t)}
      <div class="nm"><span>${esc(t.name)}</span>${t.preset?'':'<span class="tag">własny</span>'}${c?`<span class="badge">${c} szt.</span>`:''}</div>
      <div class="meta">${fmt(g.W)} × ${fmt(g.D)} × ${fmt(g.H)} · ${t.nx}×${t.ny}</div>
      <div class="acts">
        <button class="btn pri grow" data-act="add" data-t="${t.id}" type="button" ${state.drawer?'':'disabled'}>Dodaj</button>
        <button class="btn" data-act="edit" data-t="${t.id}" type="button">Edytuj</button>
        <button class="btn" data-act="stl" data-t="${t.id}" type="button" title="Pobierz STL tego modułu">STL</button>
        ${helper.ok ? `<button class="btn" data-act="bambu" data-t="${t.id}" type="button" title="Otwórz ten moduł w Bambu Studio">Bambu</button>` : ''}
      </div></li>`;
  }).join('') + (missing ? `<li><button class="restore" data-act="restore" type="button">Przywróć usunięte gotowe moduły (${missing})</button></li>` : '');
}
$('#lib').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if(!b) return;
  const act = b.dataset.act;
  if(act==='restore'){ restorePresets(); return; }
  const t = tpl(b.dataset.t); if(!t) return;
  if(act==='del'){ libAsk = t.id; renderLib(); const y = $('#lib [data-act=delno]'); if(y) y.focus(); return; }
  if(act==='delno'){ libAsk = null; renderLib(); return; }
  if(act==='delyes'){ deleteTpl(t); return; }
  if(act==='bambu'){ sendToSlicer([[t,1]], slug(t.name) + '.3mf'); return; }
  if(b.dataset.act==='add') addItem(t.id);
  else if(b.dataset.act==='edit') openTpl(t);
  else downloadTpl(t);
});
function renderInspector(){
  const it = selItem(), el = $('#inspector');
  if(!it){ el.innerHTML = `<h2>Zaznaczony moduł</h2><p class="insp-empty">Kliknij moduł na planie, żeby go przesunąć, obrócić albo usunąć.</p>`; return; }
  const t = tpl(it.tid), f = fp(it), why = problems().get(it.id);
  el.innerHTML = `<h2><span><span class="dot" style="background:${t.color}"></span>${esc(t.name)}</span><small>${fmt(f.w)}×${fmt(f.d)} mm</small></h2>
    ${why?`<p class="warnline" style="color:var(--danger)">Moduł ${why.join(' i ')}.</p>`:''}
    <div class="grid2">
      <div class="field"><label for="iX">Od lewej (mm)</label><input id="iX" type="number" step="0.5" value="${fmt(it.x).replace(',','.')}"></div>
      <div class="field"><label for="iY">Od tyłu (mm)</label><input id="iY" type="number" step="0.5" value="${fmt(it.y).replace(',','.')}"></div>
    </div>
    <div class="rsz">
      <div class="rsz-h">Zmień rozmiar z wybranego boku</div>
      <div class="sidepick" role="radiogroup" aria-label="Bok elementu">
        ${['t','l','r','b'].map(sd => `<button type="button" class="sp sp-${sd}" data-sd="${sd}" role="radio" aria-checked="${sd===resizeSide}" title="Bok ${SIDE_NAMES[sd]}">${{t:'Tył',l:'Lewy',r:'Prawy',b:'Przód'}[sd]}</button>`).join('')}
        <span class="sp-box" style="aspect-ratio:${Math.max(.45, Math.min(2.2, f.w/f.d))}"></span>
      </div>
      <div class="row" style="align-items:end;flex-wrap:nowrap">
        <div class="field" style="flex:1"><label for="iSz">${resizeSide==='l'||resizeSide==='r' ? 'Szerokość' : 'Głębokość'} (mm)</label>
          <input id="iSz" type="number" min="${MINSZ}" step="0.5" value="${fmt(resizeSide==='l'||resizeSide==='r' ? f.w : f.d).replace(',','.')}"></div>
        <button class="btn" id="iSzApply" type="button">Ustaw</button>
      </div>
      <button class="btn pri" id="iFit" type="button">Dopasuj bok ${SIDE_NAMES[resizeSide]} do sąsiada / ścianki</button>
      <p class="hint" style="margin:0">Przeciwległy bok zostaje na miejscu. Możesz też przeciągnąć uchwyt na krawędzi modułu na planie. Zmiana dotyczy tylko tego elementu.</p>
    </div>
    <div class="row">
      <button class="btn" id="iRot" type="button">Obróć 90°</button>
      <button class="btn" id="iDup" type="button">Duplikuj</button>
      <button class="btn" id="iEdit" type="button">Edytuj moduł</button>
      <button class="btn dng" id="iDel" type="button">Usuń</button>
    </div>`;
  const setPos = () => { const D = state.drawer, x = parseFloat($('#iX').value), y = parseFloat($('#iY').value);
    if(isFinite(x)) it.x = Math.max(0, Math.min(x, D.w-f.w)); if(isFinite(y)) it.y = Math.max(0, Math.min(y, D.d-f.d)); commit(); };
  $('#iX').addEventListener('change', setPos); $('#iY').addEventListener('change', setPos);
  el.querySelectorAll('.sp').forEach(b => b.onclick = () => { resizeSide = b.dataset.sd; renderInspector(); render2d(); });
  $('#iFit').onclick = () => fitSide(it, resizeSide);
  const szApply = () => { const v = parseFloat(String($('#iSz').value).replace(',', '.')); if(!isFinite(v) || v < MINSZ){ toast(`Podaj wymiar co najmniej ${MINSZ} mm.`); return; } setSideSize(it, resizeSide, r05(v)); };
  $('#iSzApply').onclick = szApply;
  $('#iSz').addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); szApply(); } });
  $('#iRot').onclick = () => rotate(it); $('#iDup').onclick = () => duplicate(it);
  $('#iDel').onclick = () => removeItem(it); $('#iEdit').onclick = () => openTpl(t);
}
function renderBom(){
  const used = usage(), bed = state.settings.bed;
  if(!used.length){ $('#bomWrap').innerHTML = `<p class="hint">Dodaj moduły do szuflady — tu pojawi się lista do wydruku.</p>`; $('#dlAll').disabled = true; return; }
  $('#dlAll').disabled = false;
  let tq = 0, tg = 0;
  const rows = used.map(([t,q]) => {
    const g = geo(t, state.settings.tol), gr = grams(t)*q; tq += q; tg += gr;
    const tooBig = Math.max(g.W,g.D) > bed + EPS || Math.min(g.W,g.D) > bed + EPS || g.H > bed;
    return `<tr><td><span class="dot" style="background:${t.color}"></span>${esc(t.name)}<div class="meta" style="font:11.5px var(--f-mono);color:var(--muted)">${fmt(g.W)}×${fmt(g.D)}×${fmt(g.H)}</div>${tooBig?`<div class="warnline">Większy niż stół ${bed} mm</div>`:''}</td><td class="n">${q}</td><td class="n">${fmt(gr,0)} g</td></tr>`;
  }).join('');
  $('#bomWrap').innerHTML = `<table class="bom"><thead><tr><th>Moduł</th><th style="text-align:right">Szt.</th><th style="text-align:right">${esc(state.settings.cost.mat)}</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td>Razem</td><td class="n">${tq}</td><td class="n">≈ ${fmt(tg,0)} g</td></tr></tfoot></table>
    <p class="hint">Masa przy pełnym wypełnieniu, ${esc(state.settings.cost.mat)} ${fmt(dens(),2)} g/cm³.</p>`;
}
function renderStatus(){
  const D = state.drawer, el = $('#status');
  if(!D){ el.innerHTML = 'Brak wymiarów szuflady.'; return; }
  const area = state.items.reduce((a,i) => { const f = fp(i); return a + f.w*f.d; }, 0);
  const pct = area / (D.w*D.d) * 100, bad = problems();
  const it = selItem();
  el.innerHTML = `<span>Zajętość dna <b>${fmt(pct,0)}%</b></span><span>Modułów <b>${state.items.length}</b></span>
    <span>Wolne <b>${fmt(Math.max(0, D.w*D.d-area)/100,0)} cm²</b></span>
    ${it?`<span>Pozycja <b>${fmt(it.x)}, ${fmt(it.y)}</b></span>`:''}
    ${bad.size?`<span class="chip bad">${bad.size} ${bad.size===1?'kolizja':'kolizje'}</span>`:state.items.length?'<span class="chip ok">Układ pasuje</span>':''}
    <button class="btn" id="clearAll" type="button" ${state.items.length?'':'disabled'}>Wyczyść</button>
    <span class="keys"><kbd>R</kbd> obrót · <kbd>D</kbd> kopia · <kbd>Del</kbd> usuń · strzałki przesuwają</span>`;
  const cb = $('#clearAll');
  cb.onclick = () => {
    if(cb.dataset.arm){ state.items = []; sel = null; commit(); return; }
    cb.dataset.arm = '1'; cb.textContent = 'Kliknij, by potwierdzić'; cb.classList.add('dng');
    setTimeout(() => { if(cb.isConnected){ delete cb.dataset.arm; cb.textContent = 'Wyczyść'; cb.classList.remove('dng'); } }, 3000);
  };
}
function renderHeader(){
  const D = state.drawer;
  $('#drawerDims').textContent = D ? `${D.w} × ${D.d} × ${D.h} mm` : 'podaj wymiary';
}
function refresh(){ renderHeader(); render2d(); renderLib(); renderInspector(); renderBom(); renderCost(); renderSlicer(); renderTone2Info(); renderStatus(); if(view==='3d') rebuild3d(); }
function commit(){ save(); refresh(); }

/* ---------- projekt 3MF + most do Bambu Studio ---------- */
function make3mf(list){
  const objects = list.map(([t, qty]) => {
    const g = exportGeo(t), parts = splitParts(g, t);
    return {name: t.name, qty, size: {w: g.W, d: g.D},
      parts: parts.length === 1 ? [{name: t.name, mesh: meshFor(g)}]
        : [{name: `${t.name} - dół (kolor 1)`, mesh: meshFor(parts[0])}, {name: `${t.name} - góra (kolor 2)`, mesh: meshFor(parts[1])}]};
  });
  return make3mfBlob(objects, state.settings.bed, state.drawer ? `Organizer ${state.drawer.w}x${state.drawer.d}` : 'Organizer');
}
const HELPER = 'http://localhost:52845';
const inClaude = !!(window.claude && window.claude.use);
const helper = {ok:false, slicer:false, busy:false};
async function pingHelper(){
  if(inClaude) return;
  let ok = false, sl = false;
  if(desktop.on){ ok = true; try{ sl = await desktop.status(); }catch(e){} }
  else try{ const r = await fetch(HELPER + '/ping', {cache:'no-store'}); const j = await r.json(); ok = !!j.ok; sl = !!j.slicer; }catch(e){}
  if(ok !== helper.ok || sl !== helper.slicer){ helper.ok = ok; helper.slicer = sl; renderSlicer(); renderLib(); refreshSingle(); }
}
function renderSlicer(){
  const box = $('#slicerBox'), used = usage().length;
  $('#dl3mf').hidden = inClaude;
  if(inClaude){ box.innerHTML = `<p class="hint">Wysyłanie prosto do Bambu Studio działa w wersji offline, razem z pomocnikiem Bambu-most.bat.</p>`; return; }
  box.innerHTML = `<button class="btn ${helper.ok?'pri':''}" id="toSlicer" type="button" ${helper.ok && used && !helper.busy ? '' : 'disabled'}>${helper.busy ? 'Wysyłam…' : 'Otwórz w Bambu Studio'}</button>
    <div class="st ${helper.ok?'on':''}"><i></i>${helper.ok
      ? (desktop.on ? (helper.slicer ? 'Bambu Studio znalezione — projekt zapisze się w folderze zleceń i otworzy w slicerze' : 'Nie znaleziono Bambu Studio — plik otworzy się w programie przypisanym do .3mf')
        : helper.slicer ? 'Pomocnik połączony z Bambu Studio' : 'Pomocnik działa, ale nie znalazł Bambu Studio — plik otworzy się w programie przypisanym do .3mf')
      : 'Uruchom Bambu-most.bat (leży obok tego pliku), żeby wysyłać układ prosto do slicera'}</div>`;
  if(state.settings.tone2On && tone2Heights().length) box.insertAdjacentHTML('beforeend', `<p class="hint">Dwa kolory: w projekcie .3mf każdy moduł ma części „dół” i „góra”. W Bambu Studio zaznacz części „góra” i przypisz im drugi filament z AMS. Bez AMS dodaj zmianę koloru na wysokości ${tone2Heights().map(([z]) => fmt(z) + ' mm').join(', ')}.</p>`);
  $('#dlAll').classList.toggle('pri', !helper.ok);
  const b = $('#toSlicer'); if(b) b.onclick = () => { const d = state.drawer; sendToSlicer(usage(), `organizer_${d.w}x${d.d}.3mf`); };
}
async function sendBlob(blob, name, n){
  name = withOrder(name);
  helper.busy = true; renderSlicer();
  try{
    if(desktop.on){
      await desktop.open(await desktop.save(name, blob));
      toast(`Otwieram w Bambu Studio: ${n} ${n===1?'element':n<5?'elementy':'elementów'}. Plik jest też w folderze zleceń.`);
      return;
    }
    const body = await blob.arrayBuffer();
    const r = await fetch(HELPER + '/open?name=' + encodeURIComponent(name), {method:'POST', body});
    const j = await r.json();
    if(!j.ok) throw new Error(j.error || 'błąd pomocnika');
    toast(`Wysłano do Bambu Studio: ${n} ${n===1?'element':n<5?'elementy':'elementów'}. Jeśli nie mieszczą się na płycie, użyj „Rozmieść” (A).`);
  }catch(e){
    if(desktop.on){ toast('Nie udało się otworzyć Bambu Studio: ' + e); return; }
    helper.ok = false; renderLib(); refreshSingle();
    toast('Nie udało się połączyć z pomocnikiem. Sprawdź, czy okno Bambu-most.bat jest otwarte.');
  }finally{ helper.busy = false; renderSlicer(); }
}
async function sendToSlicer(list, name){
  if(!list.length){ toast('W szufladzie nie ma jeszcze modułów.'); return; }
  return sendBlob(make3mf(list), name, list.reduce((a,[,q]) => a+q, 0));
}
$('#dl3mf').onclick = () => {
  const used = usage(); if(!used.length){ toast('W szufladzie nie ma jeszcze modułów.'); return; }
  const d = state.drawer; offer(`organizer_${d.w}x${d.d}.3mf`, make3mf(used));
};

/* ---------- kalkulator kosztu ---------- */
function tone2Grams(){
  let v = 0; state.items.forEach(i => { const t = tpl(i.tid), ps = splitParts(geo(t, state.settings.tol), t); if(ps.length > 1) v += meshFor(ps[1]).vol; });
  return v/1000*dens()*(1 + (state.settings.cost.waste||0)/100);
}
function autoCost(){
  let v = 0; state.items.forEach(i => v += vol(tpl(i.tid)));
  const waste = 1 + (state.settings.cost.waste||0)/100;
  return {g: v/1000*dens()*waste, h: v/FLOW/3600*waste, n: state.items.length};
}
const zl = n => n.toLocaleString('pl-PL', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' zł';
function renderCost(){
  const c = state.settings.cost, a = autoCost();
  const g = c.grams == null ? a.g : c.grams, h = c.hours == null ? a.h : c.hours;
  const act = document.activeElement;
  if(act !== $('#cGrams')) $('#cGrams').value = c.grams == null ? Math.round(a.g) : c.grams;
  if(act !== $('#cHours')) $('#cHours').value = c.hours == null ? Math.round(a.h*10)/10 : c.hours;
  $('#cGramsAuto').dataset.on = c.grams == null ? '1' : '0';
  $('#cGramsAuto').textContent = c.grams == null ? 'z układu (szacunek)' : `↺ wróć do wyliczenia (${fmt(a.g,0)} g)`;
  $('#cHoursAuto').dataset.on = c.hours == null ? '1' : '0';
  $('#cHoursAuto').textContent = c.hours == null ? 'z układu (szacunek)' : `↺ wróć do wyliczenia (${fmt(a.h,1)} h)`;
  const fil = g/1000*(c.price||0), kwhUsed = h*(c.watt||0)/1000, el = kwhUsed*(c.kwh||0), tot = fil + el;
  $('#costOut').innerHTML = a.n === 0 && c.grams == null ? '<p class="hint">Dodaj moduły do szuflady, żeby policzyć koszt.</p>' :
    `<div class="costtab">
      <span>Filament · ${fmt(g,0)} g</span><span>${zl(fil)}</span>
      ${state.settings.tone2On && tone2Grams() > 0 ? `<span style="color:var(--muted);font-size:12px">w tym kolor 2: ok. ${fmt(tone2Grams(),0)} g</span><span></span>` : ''}
      <span>Prąd · ${fmt(kwhUsed,2)} kWh</span><span>${zl(el)}</span>
      <span class="tot">Razem</span><span class="tot">${zl(tot)}</span>
      ${a.n ? `<span>Średnio na moduł (${a.n} szt.)</span><span>${zl(tot/a.n)}</span>` : ''}
    </div>
    <p class="hint">Zużycie i czas to szacunek dla pełnego wypełnienia. Po pocięciu w slicerze wpisz jego wartości, będzie dokładniej.</p>`;
}
function bindCost(){
  const c = state.settings.cost;
  $('#cMat').innerHTML = Object.keys(MATS).map(m => `<option value="${m}" ${m===c.mat?'selected':''}>${m} (${fmt(MATS[m],2)})</option>`).join('');
  $('#cWaste').value = c.waste; $('#cPrice').value = c.price; $('#cWatt').value = c.watt; $('#cKwh').value = c.kwh;
  renderCost();
}
const num = (v, d) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) && n >= 0 ? n : d; };
$('#cMat').addEventListener('change', e => { state.settings.cost.mat = e.target.value; commit(); });
[['#cWaste','waste',5],['#cPrice','price',80],['#cWatt','watt',150],['#cKwh','kwh',1.1]].forEach(([id,k,d]) =>
  $(id).addEventListener('input', e => { state.settings.cost[k] = num(e.target.value, d); if(k==='waste') commit(); else { save(); renderCost(); } }));
$('#cGrams').addEventListener('input', e => { state.settings.cost.grams = e.target.value === '' ? null : num(e.target.value, null); save(); renderCost(); });
$('#cHours').addEventListener('input', e => { state.settings.cost.hours = e.target.value === '' ? null : num(e.target.value, null); save(); renderCost(); });
['#cGrams','#cHours'].forEach(id => $(id).addEventListener('blur', renderCost));
$('#costCard').addEventListener('click', e => { const b = e.target.closest('[data-auto]'); if(!b || b.dataset.on === '1') return;
  state.settings.cost[b.dataset.auto === 'g' ? 'grams' : 'hours'] = null; save(); renderCost(); });

/* settings */
$('#setTol').value = state.settings.tol;
function bindSettings(){
  if(typeof bindTone2 === 'function' && $('#t2On')) bindTone2();
  bindCost();
  if(typeof bindUni === 'function') bindUni();
  $('#setLabel').checked = !!state.settings.label; $('#setTol').value = state.settings.tol; $('#setBed').value = state.settings.bed; $('#setSnap').value = state.settings.snap;
}
$('#setTol').addEventListener('change', e => { const v = parseFloat(e.target.value); state.settings.tol = isFinite(v) ? Math.max(0, Math.min(3, v)) : 0.5; e.target.value = state.settings.tol; commit(); });
$('#setBed').addEventListener('change', e => { const v = parseFloat(e.target.value); state.settings.bed = isFinite(v) ? Math.max(100, Math.min(1000, v)) : 220; e.target.value = state.settings.bed; commit(); });
$('#setLabel').addEventListener('change', e => { state.settings.label = e.target.checked; save(); if(view==='3d') rebuild3d(); });
$('#setSnap').addEventListener('change', e => { state.settings.snap = +e.target.value; save(); });
$('#dlAll').addEventListener('click', downloadAll);

/* ---------- okno: szuflada ---------- */
function openDrawer(){
  const D = state.drawer;
  $('#dW').value = D ? D.w : ''; $('#dD').value = D ? D.d : ''; $('#dH').value = D ? D.h : '';
  $('#dCancel').hidden = !D; $('#sampleRow').hidden = state.items.length > 0; $('#dErr').textContent = '';
  $('#ovDrawer').hidden = false; setTimeout(() => $('#dW').focus(), 30);
}
$('#drawerBtn').onclick = openDrawer;
$('#dCancel').onclick = () => { $('#ovDrawer').hidden = true; };
$('#formDrawer').addEventListener('submit', e => {
  e.preventDefault();
  const w = parseFloat($('#dW').value), d = parseFloat($('#dD').value), h = parseFloat($('#dH').value);
  if(!isFinite(w)||!isFinite(d)||!isFinite(h)){ $('#dErr').textContent = 'Wpisz wszystkie trzy wymiary w milimetrach.'; return; }
  if(w<50||d<50||w>2000||d>2000){ $('#dErr').textContent = 'Szerokość i głębokość muszą mieścić się w zakresie 50–2000 mm.'; return; }
  if(h<15||h>500){ $('#dErr').textContent = 'Wysokość musi mieścić się w zakresie 15–500 mm.'; return; }
  const first = !state.drawer;
  state.drawer = {w:Math.round(w*10)/10, d:Math.round(d*10)/10, h:Math.round(h*10)/10};
  $('#ovDrawer').hidden = true;
  if(!state.items.length && !$('#sampleRow').hidden && $('#dSample').checked) sampleLayout();
  commit();
  if(!first && problems().size) toast('Część modułów nie pasuje do nowych wymiarów — są zaznaczone na czerwono.');
});

/* ---------- okno: moduł ---------- */
let editing = null, draftColor = COLORS[0], delArm = false;
function readTpl(){
  return {
    name: $('#tName').value.trim() || 'Moduł', w: parseFloat($('#tW').value), d: parseFloat($('#tD').value),
    h: parseFloat($('#tH').value), hAuto: $('#tHAuto').checked, nx: parseInt($('#tNx').value,10), ny: parseInt($('#tNy').value,10),
    wall: parseFloat($('#tWall').value), floor: parseFloat($('#tFloor').value), divPct: parseFloat($('#tDiv').value), color: draftColor
  };
}
const validTpl = t => mdl(t).validate(t);
function previewTpl(){
  const t = readTpl(), err = validTpl(t);
  $('#tH').disabled = t.hAuto;
  if(t.hAuto) $('#tH').value = state.drawer ? Math.max(15, Math.round(state.drawer.h-3)) : 40;
  $('#tErr').textContent = err;
  if(err){ $('#tPrev').innerHTML = ''; return; }
  const g = geo(t), {cells, cw, cd} = compartments(g), s = Math.max(g.W, g.D);
  let r = `<rect width="${g.W}" height="${g.D}" fill="${t.color}"/>`;
  cells.forEach(c => r += `<rect x="${c[0]}" y="${c[1]}" width="${c[2]-c[0]}" height="${c[3]-c[1]}" fill="var(--panel)" fill-opacity=".7"/>`);
  const fs = s/16;
  r += `<text x="${g.W/2}" y="${g.D + fs*1.4}" text-anchor="middle" font-size="${fs}" font-family="IBM Plex Mono, monospace" fill="var(--muted)">${fmt(g.W)} × ${fmt(g.D)} × ${fmt(g.H)} mm · przegródka ${fmt(cw)} × ${fmt(cd)}</text>`;
  $('#tPrev').innerHTML = `<svg viewBox="${-s*.05} ${-s*.05} ${g.W+s*.1} ${g.D+s*.05+fs*2}" style="height:150px">${r}</svg>`;
}
function openTpl(t){
  editing = t || null; delArm = false;
  const src = t || {name:'Nowy moduł', w:80, d:80, h:40, hAuto:true, nx:2, ny:1, wall:1.6, floor:1.2, divPct:100, color:COLORS[(state.templates.length)%COLORS.length]};
  $('#tTitle').textContent = t ? 'Edytuj moduł' : 'Nowy moduł';
  $('#tName').value = src.name; $('#tW').value = src.w; $('#tD').value = src.d; $('#tH').value = src.h; $('#tHAuto').checked = src.hAuto;
  $('#tNx').value = src.nx; $('#tNy').value = src.ny; $('#tWall').value = src.wall; $('#tFloor').value = src.floor; $('#tDiv').value = src.divPct;
  draftColor = src.color;
  $('#tSw').innerHTML = COLORS.map(c => `<button type="button" style="background:${c}" data-c="${c}" aria-label="Kolor ${c}" aria-pressed="${c===draftColor}"></button>`).join('') +
    '<span style="flex-basis:100%;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:4px">Rosa3D PLA Starter</span>' +
    ROSA.map(([c,n]) => `<button type="button" style="background:${c}" data-c="${c}" title="${n}" aria-label="Rosa3D ${n}" aria-pressed="${c===draftColor}"></button>`).join('') +
    '<span style="flex-basis:100%;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:4px">Rosa3D PLA-CF Matt Home Decor</span>' +
    ROSA_CF.map(([c,n]) => `<button type="button" style="background:${c}" data-c="${c}" title="${n}" aria-label="Rosa3D CF ${n}" aria-pressed="${c===draftColor}"></button>`).join('');
  $('#tDel').hidden = !t; $('#tDel').textContent = 'Usuń moduł';
  $('#tReset').hidden = !t || !t.preset; $('#tSaveNew').hidden = !t;
  $('#ovTpl').hidden = false; previewTpl(); setTimeout(() => $('#tName').focus(), 30);
}
$('#tSw').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if(!b) return; draftColor = b.dataset.c;
  $('#tSw').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.c===draftColor)); previewTpl(); });
$('#formTpl').addEventListener('input', previewTpl);
$('#tCancel').onclick = () => { $('#ovTpl').hidden = true; };
function applyTpl(asNew){
  const t = readTpl(), err = validTpl(t); if(err){ $('#tErr').textContent = err; return; }
  if(!isFinite(t.h)) t.h = 40;
  if(editing && !asNew){ Object.assign(editing, t); }
  else { const n = Object.assign({id:'c'+(uid++), preset:false}, t); if(asNew && editing && n.name === editing.name) n.name += ' (kopia)'; state.templates.push(n); }
  $('#ovTpl').hidden = true; commit();
  if(problems().size) toast('Po zmianie niektóre moduły nachodzą na siebie — zaznaczono je na czerwono.');
}
$('#formTpl').addEventListener('submit', e => { e.preventDefault(); applyTpl(false); });
$('#tSaveNew').onclick = () => applyTpl(true);
$('#tReset').onclick = () => { const p = PRESETS.find(x => x.id === editing.id); if(!p) return; const f = presetFull(p);
  ['name','w','d','nx','ny','wall','floor','divPct','hAuto','h','color'].forEach(k => editing[k] = f[k]); $('#ovTpl').hidden = true; commit(); };
$('#tDel').onclick = () => {
  const n = state.items.filter(i => i.tid === editing.id).length;
  if(!delArm){ delArm = true; $('#tDel').textContent = n ? `Na pewno? Usunie też ${n} szt. z szuflady` : 'Na pewno usunąć?'; return; }
  $('#ovTpl').hidden = true; deleteTpl(editing);
};
$('#newTpl').onclick = () => openTpl(null);

/* ---------- widok 3D ---------- */
let T = null, showWalls = true;
function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function init3d(){
  if(T) return true;
  if(!window.THREE){ $('#host3d').innerHTML = '<div class="empty-state">Nie udało się wczytać silnika 3D. Odśwież stronę.</div>'; return false; }
  const host = $('#host3d'), renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); host.appendChild(renderer.domElement);
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.physicallyCorrectLights = false;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, 1, 50000);
  const controls = THREE.OrbitControls ? new THREE.OrbitControls(camera, renderer.domElement) : null;
  if(controls){ controls.enableDamping = true; controls.dampingFactor = .12; controls.maxPolarAngle = Math.PI*0.495; }
  if(THREE.RoomEnvironment){ try{ const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture; pm.dispose(); }catch(e){} }
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f8c, scene.environment ? 0.08 : 0.75); scene.add(hemi);
  const dl = new THREE.DirectionalLight(0xffffff, scene.environment ? 0.72 : 0.65); dl.castShadow = true;
  dl.shadow.mapSize.set(2048, 2048); dl.shadow.bias = -0.0004; dl.shadow.normalBias = 0.6; dl.shadow.radius = 3;
  scene.add(dl); scene.add(dl.target);
  const dl2 = new THREE.DirectionalLight(0xffffff, 0.12); dl2.position.set(-0.6, 0.5, -0.4); scene.add(dl2);
  const group = new THREE.Group(); scene.add(group);
  T = {renderer, scene, camera, controls, group, host, running:false, fitted:null, sun:dl};
  const resize = () => { const w = host.clientWidth, h = host.clientHeight; if(!w||!h) return; renderer.setSize(w, h, false); camera.aspect = w/h; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(host); resize();
  // klik = zaznaczenie
  let down = null; const ray = new THREE.Raycaster();
  renderer.domElement.addEventListener('pointerdown', e => down = {x:e.clientX, y:e.clientY});
  renderer.domElement.addEventListener('pointerup', e => {
    if(!down || Math.hypot(e.clientX-down.x, e.clientY-down.y) > 4) return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera({x:(e.clientX-r.left)/r.width*2-1, y:-(e.clientY-r.top)/r.height*2+1}, camera);
    const hit = ray.intersectObjects(group.children, false).find(h => h.object.userData.id);
    sel = hit ? hit.object.userData.id : null; refresh();
  });
  return true;
}
const geoCache3 = new Map();
function threeGeo(g){
  const k = JSON.stringify(g); if(geoCache3.has(k)) return geoCache3.get(k);
  const P = meshFor(g).pos, out = new Float32Array(P.length);
  for(let t=0;t<P.length;t+=9){ // (x,y,z) -> (x,z,y), odwrócona kolejność wierzchołków
    const v = [[P[t],P[t+1],P[t+2]],[P[t+6],P[t+7],P[t+8]],[P[t+3],P[t+4],P[t+5]]];
    v.forEach((p,i) => { out[t+i*3]=p[0]; out[t+i*3+1]=p[2]; out[t+i*3+2]=p[1]; });
  }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(out, 3)); bg.computeVertexNormals();
  const edges = new THREE.EdgesGeometry(bg, 20);
  const r = {bg, edges}; geoCache3.set(k, r); return r;
}
function fitCam(){
  const D = state.drawer, s = Math.max(D.w, D.d);
  T.camera.position.set(D.w*0.5 + s*0.15, s*0.95, D.d + s*0.75);
  if(T.controls){ T.controls.target.set(D.w/2, 0, D.d/2); T.controls.update(); } else T.camera.lookAt(D.w/2,0,D.d/2);
  T.fitted = `${D.w}x${D.d}`;
}
function rebuild3d(){
  if(!state.drawer || !init3d()) return;
  const D = state.drawer, grp = T.group;
  while(grp.children.length){ const c = grp.children.pop(); if(c.material) c.material.dispose(); }
  const ink = new THREE.Color(css('--ink') || '#1b211e');
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
  const wood = new THREE.MeshStandardMaterial({color:lin('#C9A77C'), roughness:.8, envMapIntensity:.3});
  const t = Math.max(8, Math.max(D.w,D.d)/60), S = Math.max(D.w, D.d);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(D.w+2*t, 6, D.d+2*t), wood); floor.position.set(D.w/2, -3.01, D.d/2); floor.receiveShadow = true; grp.add(floor);
  const sun = T.sun, sc = sun.shadow.camera;
  sun.position.set(D.w/2 + S*0.45, S*1.1, D.d/2 + S*0.7); sun.target.position.set(D.w/2, 0, D.d/2); sun.target.updateMatrixWorld();
  sc.left = -S*0.85; sc.right = S*0.85; sc.top = S*0.85; sc.bottom = -S*0.85; sc.near = 1; sc.far = S*4; sc.updateProjectionMatrix();
  if(showWalls){
    const wm = new THREE.MeshStandardMaterial({color:lin('#C9A77C'), roughness:.8, transparent:true, opacity:.3, depthWrite:false, envMapIntensity:.5});
    [[D.w+2*t, t, D.w/2, -t/2],[D.w+2*t, t, D.w/2, D.d+t/2]].forEach(([w,d,x,z]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w,D.h,d), wm); m.position.set(x,D.h/2,z); grp.add(m); });
    [[-t/2],[D.w+t/2]].forEach(([x]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(t,D.h,D.d), wm); m.position.set(x,D.h/2,D.d/2); grp.add(m); });
  }
  const bad = problems();
  for(const it of state.items){
    const tp = tpl(it.tid), parts = splitParts(viewGeo(tp), tp);
    parts.forEach((g, pi) => {
      const {bg, edges} = threeGeo(g);
      const col = pi === 1 ? state.settings.tone2Color : (state.settings.uniOn ? state.settings.uniColor : tp.color);
      // PLA Starter: lekki połysk satynowy; PLA-CF Matt: matowa, rozproszona powierzchnia bez odblasków
      const matte = (findFil(col) || {}).matte;
      const mat = new THREE.MeshPhysicalMaterial({color:lin(col), metalness:0, ...(matte ? {roughness:.9, clearcoat:0, envMapIntensity:.17} : {roughness:.45, clearcoat:.12, clearcoatRoughness:.35, envMapIntensity:.14}),
        emissive: bad.has(it.id) ? new THREE.Color(0xC2412D) : it.id===sel ? new THREE.Color(css('--accent')||'#0F7A6C') : new THREE.Color(0x000000),
        emissiveIntensity: bad.has(it.id) ? .55 : it.id===sel ? .35 : 0});
      const m = new THREE.Mesh(bg, mat); m.userData.id = it.id; m.castShadow = true; m.receiveShadow = true;
      const objs = [m];
      if(!state.settings.uniOn) objs.push(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({color:ink, transparent:true, opacity:.22})));
      objs.forEach(o => { if(it.rot){ o.rotation.y = Math.PI/2; o.position.set(it.x, 0, it.y + tp.w); } else o.position.set(it.x, 0, it.y); grp.add(o); });
    });
  }
  if(T.fitted !== `${D.w}x${D.d}`) fitCam();
  if(!T.running) loop();
}
function loop(){
  if(view !== '3d' || pres.open){ T.running = false; return; }
  T.running = true; if(T.controls) T.controls.update(); T.renderer.render(T.scene, T.camera); requestAnimationFrame(loop);
}
$('#tgWalls').onclick = () => { showWalls = !showWalls; $('#tgWalls').textContent = showWalls ? 'Ukryj ścianki szuflady' : 'Pokaż ścianki szuflady'; rebuild3d(); };
$('#resetCam').onclick = () => { if(T) fitCam(); };
// Rosa3D PLA Starter — 10 podstawowych kolorów. Producent nie podaje kodów, odcienie dobrane jak najbliżej rzeczywistych szpul.
const UNI_QUICK = ROSA;
let uniSeries = null, t2Series = null;
function swatches(list, sname, cur, on, labelPrefix){
  const alias = {'Green Grass':' (Matcha Green)', 'Black':sname.includes('CF') ? ' (Carbon Black)' : ''};
  return list.map(([c,n]) => `<button type="button" data-c="${c}" style="background:${c}" title="Rosa3D ${sname} ${n}${alias[n]||''}" aria-label="${labelPrefix}Rosa3D ${sname} ${n}" aria-pressed="${on && String(cur).toLowerCase()===c.toLowerCase()}"></button>`).join('');
}
function bindUni(){
  const st = state.settings;
  $('#uniOn').checked = !!st.uniOn; $('#uniColor').value = st.uniColor; $('#uniColor').disabled = !st.uniOn;
  uniSeries = uniSeries || seriesOf(st.uniColor); $('#uniSeries').value = uniSeries;
  $('#uniQuick').innerHTML = swatches(SERIES[uniSeries].list, SERIES[uniSeries].name, st.uniColor, st.uniOn, '');
  $('#uniName').textContent = st.uniOn ? (rosaName(st.uniColor) || 'własny kolor') : '';
}
function tone2Heights(){
  const m = new Map(); state.items.forEach(i => { const t = tpl(i.tid), z = tone2At(t); if(z != null) m.set(z, (m.get(z)||0)+1); });
  return [...m.entries()].sort((a,b)=>a[0]-b[0]);
}
function bindTone2(){
  const st = state.settings;
  $('#t2On').checked = !!st.tone2On; $('#t2Color').value = st.tone2Color; $('#t2Band').value = st.tone2Band;
  $('#t2Color').disabled = $('#t2Band').disabled = !st.tone2On;
  t2Series = t2Series || seriesOf(st.tone2Color); $('#t2Series').value = t2Series;
  $('#t2Quick').innerHTML = swatches(SERIES[t2Series].list, SERIES[t2Series].name, st.tone2Color, st.tone2On, 'Drugi kolor: ');
  renderTone2Info();
}
function renderTone2Info(){
  const el = $('#t2Info'); if(!el) return;
  if(!state.settings.tone2On){ el.textContent = ''; return; }
  const hs = tone2Heights();
  const f = findFil(state.settings.tone2Color);
  el.textContent = (f ? f.name + ' · ' : '') + (hs.length ? 'zmiana koloru na ' + hs.map(([z]) => fmt(z) + ' mm').join(', ') : 'pas jest za wysoki dla tych modułów');
}
const t2changed = () => { bindTone2(); save(); rebuild3d(); renderSlicer(); renderCost(); };
$('#t2On').addEventListener('change', e => { state.settings.tone2On = e.target.checked; t2changed(); });
$('#t2Color').addEventListener('input', e => { state.settings.tone2Color = e.target.value; bindTone2(); rebuild3d(); });
$('#t2Color').addEventListener('change', save);
$('#t2Band').addEventListener('input', e => { const v = parseFloat(e.target.value); if(isFinite(v) && v > 0){ state.settings.tone2Band = Math.min(200, v); save(); renderTone2Info(); rebuild3d(); renderSlicer(); renderCost(); } });
$('#t2Quick').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if(!b) return; state.settings.tone2On = true; state.settings.tone2Color = b.dataset.c; t2changed(); });
$('#uniSeries').addEventListener('change', e => { uniSeries = e.target.value; bindUni(); });
$('#t2Series').addEventListener('change', e => { t2Series = e.target.value; bindTone2(); });
$('#uniOn').addEventListener('change', e => { state.settings.uniOn = e.target.checked; bindUni(); save(); rebuild3d(); });
$('#uniColor').addEventListener('input', e => { state.settings.uniColor = e.target.value; bindUni(); rebuild3d(); });
$('#uniColor').addEventListener('change', save);
$('#uniQuick').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if(!b) return;
  state.settings.uniOn = true; state.settings.uniColor = b.dataset.c; bindUni(); save(); rebuild3d(); });

function setView(v){
  view = v; $('#tab2d').setAttribute('aria-selected', v==='2d'); $('#tab3d').setAttribute('aria-selected', v==='3d');
  $('#view2d').hidden = v!=='2d'; $('#view3d').hidden = v!=='3d';
  if(v==='3d'){ if(!state.drawer){ $('#view3d').hidden = true; $('#view2d').hidden = false; } else rebuild3d(); }
  try{ localStorage.setItem(KEY+'-view', v); }catch(e){}
}
$('#tab2d').onclick = () => setView('2d'); $('#tab3d').onclick = () => setView('3d');

/* ---------- układy: zapis i wczytanie ---------- */
const LKEY = KEY + '-uklady';
let curName = '';
function snapshot(name){
  return {app:'konfigurator-szuflady', version:1, name, savedAt:new Date().toISOString(),
    drawer:state.drawer, templates:state.templates, items:state.items, settings:state.settings, removedPresets:state.removedPresets||[]};
}
function readLayouts(){ try{ return JSON.parse(localStorage.getItem(LKEY) || '[]'); }catch(e){ return []; } }
function writeLayouts(a){ try{ localStorage.setItem(LKEY, JSON.stringify(a)); return true; }catch(e){ return false; } }
function validLayout(o){
  if(!o || o.app !== 'konfigurator-szuflady' || !Array.isArray(o.templates) || !Array.isArray(o.items)) return 'To nie jest plik układu z tego konfiguratora.';
  const d = o.drawer; if(!d || !(d.w>0 && d.d>0 && d.h>0)) return 'W pliku brakuje wymiarów szuflady.';
  const ids = new Set(o.templates.map(t => t.id));
  if(o.templates.some(t => !(t.w>0 && t.d>0 && t.nx>=1 && t.ny>=1 && t.wall>0 && t.floor>0))) return 'Plik zawiera uszkodzony opis modułu.';
  if(o.items.some(i => !ids.has(i.tid) || !isFinite(i.x) || !isFinite(i.y))) return 'Plik zawiera moduł bez definicji albo położenia.';
  return '';
}
function applyLayout(o){
  const c = JSON.parse(JSON.stringify(o));
  state.drawer = c.drawer; state.templates = c.templates; state.items = c.items;
  state.settings = Object.assign(defSettings(), c.settings||{}); state.settings.cost = Object.assign(defCost(), state.settings.cost||{});
  // brakujące moduły predefiniowane wracają do biblioteki
  state.removedPresets = Array.isArray(c.removedPresets) ? c.removedPresets : [];
  PRESETS.forEach(p => { if(!state.removedPresets.includes(p.id) && !state.templates.some(t => t.id === p.id)) state.templates.splice(Math.min(PRESETS.indexOf(p), state.templates.length), 0, presetFull(p)); });
  state.templates.forEach(t => { t.divPct = t.divPct || 100; if(t.h == null) t.h = 40; });
  state.items.forEach(i => { const n = +String(i.id).replace(/\D/g,''); if(n >= uid) uid = n+1; });
  state.templates.forEach(t => { const n = +String(t.id).replace(/\D/g,''); if(n >= uid) uid = n+1; });
  sel = null; curName = c.name || ''; meshCache.clear(); bindSettings(); commit();
}
const fmtDate = s => { try{ return new Date(s).toLocaleString('pl-PL', {day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}); }catch(e){ return ''; } };
function renderLayouts(){
  const a = readLayouts().sort((x,y) => y.savedAt.localeCompare(x.savedAt));
  $('#lList').innerHTML = a.length ? a.map(l => `<li class="mod" style="grid-template-columns:minmax(0,1fr)">
      <div class="nm"><span>${esc(l.name)}</span><span class="badge">${l.items.length} mod.</span></div>
      <div class="meta">${l.drawer.w} × ${l.drawer.d} × ${l.drawer.h} mm · ${esc(fmtDate(l.savedAt))}</div>
      <div class="acts"><button class="btn pri grow" type="button" data-l="load" data-n="${esc(l.name)}">Wczytaj</button>
        <button class="btn" type="button" data-l="file" data-n="${esc(l.name)}">Do pliku</button>
        <button class="btn dng" type="button" data-l="del" data-n="${esc(l.name)}">Usuń</button></div></li>`).join('')
    : '<li class="hint">Nie ma jeszcze zapisanych układów.</li>';
}
function openLayouts(){
  $('#lName').value = curName; $('#lErr').textContent = ''; renderLayouts();
  $('#ovLay').hidden = false; setTimeout(() => $('#lName').focus(), 30);
}
$('#layoutsBtn').onclick = openLayouts;
$('#lClose').onclick = () => { $('#ovLay').hidden = true; };
$('#formLay').addEventListener('submit', e => {
  e.preventDefault();
  if(!state.drawer){ $('#lErr').textContent = 'Najpierw podaj wymiary szuflady.'; return; }
  const name = $('#lName').value.trim();
  if(!name){ $('#lErr').textContent = 'Wpisz nazwę układu.'; return; }
  const a = readLayouts().filter(l => l.name !== name); const existed = a.length !== readLayouts().length;
  a.push(snapshot(name));
  if(!writeLayouts(a)){ $('#lErr').textContent = 'Przeglądarka nie pozwala zapisać danych. Użyj „Zapisz do pliku”.'; return; }
  curName = name; $('#lErr').textContent = ''; renderLayouts();
  toast(existed ? `Nadpisano układ „${name}”.` : `Zapisano układ „${name}”.`);
});
$('#lList').addEventListener('click', e => {
  const b = e.target.closest('[data-l]'); if(!b) return;
  const a = readLayouts(), l = a.find(x => x.name === b.dataset.n); if(!l) return;
  if(b.dataset.l === 'load'){
    if(state.items.length && !b.dataset.arm){ b.dataset.arm = '1'; b.textContent = 'Zastąpić obecny? Kliknij'; setTimeout(() => { if(b.isConnected){ delete b.dataset.arm; b.textContent = 'Wczytaj'; } }, 3000); return; }
    applyLayout(l); $('#ovLay').hidden = true; toast(`Wczytano układ „${l.name}”.`);
  } else if(b.dataset.l === 'file'){
    offer(slug(l.name) + '.json', new Blob([JSON.stringify(l, null, 1)], {type:'application/json'}), true);
  } else {
    if(!b.dataset.arm){ b.dataset.arm = '1'; b.textContent = 'Na pewno?'; setTimeout(() => { if(b.isConnected){ delete b.dataset.arm; b.textContent = 'Usuń'; } }, 3000); return; }
    writeLayouts(a.filter(x => x !== l)); if(curName === l.name) curName = ''; renderLayouts();
  }
});
$('#lExport').onclick = () => {
  if(!state.drawer){ $('#lErr').textContent = 'Najpierw podaj wymiary szuflady.'; return; }
  const name = $('#lName').value.trim() || curName || `Szuflada ${state.drawer.w}x${state.drawer.d}`;
  offer(slug(name) + '.json', new Blob([JSON.stringify(snapshot(name), null, 1)], {type:'application/json'}), true);
};
$('#lImport').onclick = () => $('#lFile').click();
$('#lFile').addEventListener('change', e => {
  const f = e.target.files[0]; e.target.value = ''; if(!f) return;
  const r = new FileReader();
  r.onload = () => {
    let o; try{ o = JSON.parse(r.result); }catch(err){ $('#lErr').textContent = 'Nie da się odczytać pliku — to nie jest poprawny JSON.'; return; }
    const err = validLayout(o); if(err){ $('#lErr').textContent = err; return; }
    if(!o.name) o.name = f.name.replace(/\.json$/i, '');
    applyLayout(o); $('#ovLay').hidden = true; toast(`Wczytano układ „${o.name}” z pliku.`);
  };
  r.onerror = () => { $('#lErr').textContent = 'Nie udało się odczytać pliku.'; };
  r.readAsText(f);
});

/* ---------- instrukcja PDF ---------- */
const PDF_DPI = 200, PXMM = PDF_DPI/25.4, PT = 0.3528;
const INK = '#1B211E', MUTED = '#5D6862', LINE = '#C9D0CA', ACC = '#0F7A6C';
function pdfPage(land){
  const w = land ? 297 : 210, h = land ? 210 : 297, c = document.createElement('canvas');
  c.width = Math.round(w*PXMM); c.height = Math.round(h*PXMM);
  const x = c.getContext('2d'); x.scale(PXMM, PXMM); x.fillStyle = '#fff'; x.fillRect(0,0,w,h);
  x.textBaseline = 'alphabetic'; x.lineJoin = 'round';
  return {c, x, w, h};
}
const pf = (x, pt, wt='400', fam='IBM Plex Sans') => { x.font = `${wt} ${pt*PT}px "${fam}", "Segoe UI", Arial, sans-serif`; };
function ptext(x, str, X, Y, o={}){ pf(x, o.pt||9, o.wt||'400', o.fam||'IBM Plex Sans'); x.fillStyle = o.color||INK; x.textAlign = o.align||'left'; x.fillText(str, X, Y); }
function wrapText(x, str, maxW){ const out=[]; let line=''; for(const w of str.split(' ')){ const t = line ? line+' '+w : w; if(x.measureText(t).width > maxW && line){ out.push(line); line = w; } else line = t; } if(line) out.push(line); return out; }
function hexA(hex, a){ const n = parseInt(hex.slice(1),16); return `rgba(${n>>16},${(n>>8)&255},${n&255},${a})`; }
function pdfHeader(pg, title, sub){
  ptext(pg.x, title, 15, 20, {pt:17, wt:'700', fam:'Bricolage Grotesque'});
  ptext(pg.x, sub, 15, 26.5, {pt:9, color:MUTED});
  pg.x.strokeStyle = LINE; pg.x.lineWidth = 0.3; pg.x.beginPath(); pg.x.moveTo(15,30); pg.x.lineTo(pg.w-15,30); pg.x.stroke();
}
function pdfFooter(pg, n, total){
  ptext(pg.x, 'Konfigurator szuflady · instrukcja układania', 15, pg.h-8, {pt:7.5, color:MUTED});
  ptext(pg.x, `Strona ${n} z ${total}`, pg.w-15, pg.h-8, {pt:7.5, color:MUTED, align:'right'});
}
function orderedItems(){ return [...state.items].sort((a,b) => (a.y-b.y) || (a.x-b.x)); }
function planPage(order, sub){
  const D = state.drawer, pg = pdfPage(D.w > D.d*1.1), x = pg.x;
  pdfHeader(pg, 'Plan ułożenia modułów', sub);
  const top = 42, bottom = pg.h - 30, left = 28, right = pg.w - 15;
  const sc = Math.min((right-left)/D.w, (bottom-top)/D.d);
  const ox = left + ((right-left) - D.w*sc)/2, oy = top + ((bottom-top) - D.d*sc)/2;
  const X = v => ox + v*sc, Y = v => oy + v*sc;
  // szuflada
  x.fillStyle = '#F1F3F0'; x.fillRect(X(0), Y(0), D.w*sc, D.d*sc);
  x.strokeStyle = '#E2E6E1'; x.lineWidth = 0.15;
  for(let g=50; g<D.w; g+=50){ x.beginPath(); x.moveTo(X(g),Y(0)); x.lineTo(X(g),Y(D.d)); x.stroke(); }
  for(let g=50; g<D.d; g+=50){ x.beginPath(); x.moveTo(X(0),Y(g)); x.lineTo(X(D.w),Y(g)); x.stroke(); }
  x.strokeStyle = '#59615C'; x.lineWidth = 1.2; x.strokeRect(X(0)-0.6, Y(0)-0.6, D.w*sc+1.2, D.d*sc+1.2);
  // wymiary szuflady
  x.strokeStyle = MUTED; x.lineWidth = 0.25;
  const dy = Y(0) - 6; x.beginPath(); x.moveTo(X(0),dy); x.lineTo(X(D.w),dy); x.moveTo(X(0),dy-1.5); x.lineTo(X(0),dy+1.5); x.moveTo(X(D.w),dy-1.5); x.lineTo(X(D.w),dy+1.5); x.stroke();
  ptext(x, `${fmt(D.w)} mm`, X(D.w/2), dy-1.5, {pt:8.5, fam:'IBM Plex Mono', color:MUTED, align:'center'});
  const dx = X(0) - 6; x.beginPath(); x.moveTo(dx,Y(0)); x.lineTo(dx,Y(D.d)); x.moveTo(dx-1.5,Y(0)); x.lineTo(dx+1.5,Y(0)); x.moveTo(dx-1.5,Y(D.d)); x.lineTo(dx+1.5,Y(D.d)); x.stroke();
  x.save(); x.translate(dx-1.5, Y(D.d/2)); x.rotate(-Math.PI/2); ptext(x, `${fmt(D.d)} mm`, 0, 0, {pt:8.5, fam:'IBM Plex Mono', color:MUTED, align:'center'}); x.restore();
  ptext(x, 'TYŁ', X(D.w/2), Y(0) - 12, {pt:7.5, wt:'600', color:MUTED, align:'center'});
  ptext(x, 'PRZÓD  ·  strona, od której otwierasz szufladę', X(D.w/2), Y(D.d) + 7, {pt:8, wt:'600', color:MUTED, align:'center'});
  // moduły
  order.forEach((it, i) => {
    const t = tpl(it.tid), b = box(it), g = geo(t), {cells} = compartments(g);
    x.fillStyle = hexA(t.color, 0.55); x.fillRect(X(b.x), Y(b.y), b.w*sc, b.d*sc);
    x.fillStyle = 'rgba(255,255,255,0.62)';
    cells.forEach(c => { const r = rotRect(c, t, it.rot); x.fillRect(X(b.x+r[0]), Y(b.y+r[1]), (r[2]-r[0])*sc, (r[3]-r[1])*sc); });
    x.strokeStyle = '#2A302D'; x.lineWidth = 0.3; x.strokeRect(X(b.x), Y(b.y), b.w*sc, b.d*sc);
    const cx = X(b.x + b.w/2), cy = Y(b.y + b.d/2), small = Math.min(b.w, b.d)*sc;
    const r = Math.max(2.2, Math.min(4, small*0.22));
    x.fillStyle = '#fff'; x.strokeStyle = INK; x.lineWidth = 0.35; x.beginPath(); x.arc(cx, cy - (small > 14 ? 2 : 0), r, 0, Math.PI*2); x.fill(); x.stroke();
    ptext(x, String(i+1), cx, cy - (small > 14 ? 2 : 0) + r*0.38, {pt: r*2.1/PT/1.0*0.5 + 2, wt:'700', align:'center'});
    if(small > 14) ptext(x, `${fmt(b.w)}×${fmt(b.d)}`, cx, cy + r + 2.2, {pt: Math.min(7.5, b.w*sc/3.2), fam:'IBM Plex Mono', align:'center'});
  });
  ptext(x, 'Numery to kolejność układania: zaczynaj od tylnego lewego rogu, potem w prawo i rzędami do przodu.', 15, pg.h - 15, {pt:8.5, color:MUTED});
  return pg;
}
function listPages(order, sub){
  const pages = []; let pg, y;
  const D = state.drawer, used = usage(), nrs = new Map();
  order.forEach((it,i) => { const a = nrs.get(it.tid) || []; a.push(i+1); nrs.set(it.tid, a); });
  const fresh = () => { pg = pdfPage(false); pages.push(pg); pdfHeader(pg, 'Moduły i rozmieszczenie', sub); y = 40; };
  const need = h => { if(y + h > pg.h - 18) fresh(); };
  const h2 = s => { need(14); ptext(pg.x, s, 15, y + 4, {pt:12, wt:'700', fam:'Bricolage Grotesque'}); y += 9; };
  fresh();
  // typy modułów
  h2('1. Moduły do wydrukowania');
  for(const [t, q] of used){
    need(30);
    const x = pg.x, g = geo(t), eg = exportGeo(t), {cells, cw, cd} = compartments(g), s = 24/Math.max(g.W, g.D);
    const mx = 15 + (24 - g.W*s)/2, my = y + (24 - g.D*s)/2;
    x.fillStyle = hexA(t.color, 0.6); x.fillRect(mx, my, g.W*s, g.D*s);
    x.fillStyle = 'rgba(255,255,255,0.65)'; cells.forEach(c => x.fillRect(mx + c[0]*s, my + c[1]*s, (c[2]-c[0])*s, (c[3]-c[1])*s));
    x.strokeStyle = INK; x.lineWidth = 0.25; x.strokeRect(mx, my, g.W*s, g.D*s);
    ptext(x, t.name, 45, y + 4.5, {pt:10.5, wt:'600'});
    ptext(x, `${q} szt.`, pg.w - 15, y + 4.5, {pt:10.5, wt:'600', align:'right'});
    ptext(x, `Wymiar: ${fmt(t.w)} × ${fmt(t.d)} × ${fmt(g.H)} mm   ·   wydruk: ${fmt(eg.W)} × ${fmt(eg.D)} × ${fmt(eg.H)} mm (luz ${fmt(state.settings.tol)} mm)`, 45, y + 10.5, {pt:8.5, fam:'IBM Plex Mono', color:MUTED});
    ptext(x, `Przegródki: ${t.nx} × ${t.ny} (${t.nx*t.ny} szt., każda ok. ${fmt(cw,0)} × ${fmt(cd,0)} mm)   ·   ścianka ${fmt(t.wall)} mm, dno ${fmt(t.floor)} mm`, 45, y + 15.5, {pt:8.5, color:MUTED});
    const lab = eg.engrave && eg.engrave.length ? `Napis na dnie: ${mdl(t).labelText(t, ctxOf(), true)}   ·   ` : '';
    pf(x, 8.5); const nrLine = wrapText(x, `${lab}Numery na planie: ${nrs.get(t.id).join(', ')}`, pg.w - 60);
    nrLine.forEach((l, k) => ptext(x, l, 45, y + 20.5 + k*4.2, {pt:8.5, color:MUTED}));
    y += Math.max(28, 22 + nrLine.length*4.2);
    pg.x.strokeStyle = '#E4E8E3'; pg.x.lineWidth = 0.2; pg.x.beginPath(); pg.x.moveTo(15, y-2); pg.x.lineTo(pg.w-15, y-2); pg.x.stroke();
  }
  // tabela rozmieszczenia
  y += 4; h2('2. Rozmieszczenie w szufladzie');
  const cols = [[15,'Nr','left'],[27,'Moduł','left'],[95,'W szufladzie (szer. × głęb.)','left'],[155,'Od lewej','right'],[175,'Od tyłu','right'],[195,'Obrót','right']];
  const head = () => { need(10); cols.forEach(([cx,l,al]) => ptext(pg.x, l, cx, y+3, {pt:7.5, wt:'600', color:MUTED, align:al})); y += 5; pg.x.strokeStyle = LINE; pg.x.lineWidth = 0.25; pg.x.beginPath(); pg.x.moveTo(15,y); pg.x.lineTo(pg.w-15,y); pg.x.stroke(); y += 1; };
  head();
  order.forEach((it, i) => {
    if(y + 6 > pg.h - 18){ fresh(); head(); }
    const t = tpl(it.tid), b = box(it), yy = y + 4.3;
    if(i % 2 === 0){ pg.x.fillStyle = '#F5F7F4'; pg.x.fillRect(15, y, pg.w-30, 6); }
    pg.x.fillStyle = t.color; pg.x.fillRect(22, y+1.8, 2.4, 2.4);
    ptext(pg.x, String(i+1), 15, yy, {pt:8.5, wt:'700'});
    ptext(pg.x, t.name, 27, yy, {pt:8.5});
    ptext(pg.x, `${fmt(b.w)} × ${fmt(b.d)} mm`, 95, yy, {pt:8.5, fam:'IBM Plex Mono'});
    ptext(pg.x, `${fmt(b.x)} mm`, 155, yy, {pt:8.5, fam:'IBM Plex Mono', align:'right'});
    ptext(pg.x, `${fmt(b.y)} mm`, 175, yy, {pt:8.5, fam:'IBM Plex Mono', align:'right'});
    ptext(pg.x, it.rot ? '90°' : '—', 195, yy, {pt:8.5, fam:'IBM Plex Mono', align:'right'});
    y += 6;
  });
  // kroki i podsumowanie
  y += 6; h2('3. Jak ułożyć');
  const ac = autoCost(), c = state.settings.cost;
  const steps = [
    `Wydrukuj moduły z listy 1 (razem ${state.items.length} szt.). W dnie każdego modułu jest wklęsły napis z jego wymiarem, widoczny od góry, więc łatwo je rozpoznasz.`,
    'Wyjmij wszystko z szuflady i wyczyść dno. Ustaw szufladę przodem do siebie, tak jak na planie.',
    'Układaj moduły według numerów, zaczynając od tylnego lewego rogu. Moduły z obrotem 90° kładź dłuższym bokiem w poprzek szuflady.',
    `Sprawdzaj odległości z tabeli 2 — mierzone od lewej i od tylnej ścianki do lewego tylnego narożnika modułu.`,
    'Jeśli moduły są zbyt ciasne, zwiększ luz w konfiguratorze i wydrukuj ponownie tylko te, które się nie mieszczą.'
  ];
  if(!state.settings.label) steps[0] = `Wydrukuj moduły z listy 1 (razem ${state.items.length} szt.). Po wydruku podpisz je numerami z planu.`;
  steps.forEach((st, i) => {
    pf(pg.x, 9.5); const lines = wrapText(pg.x, st, pg.w - 40);
    need(lines.length*4.6 + 2);
    ptext(pg.x, `${i+1}.`, 17, y + 4, {pt:9.5, wt:'700', color:ACC});
    lines.forEach((l, k) => ptext(pg.x, l, 24, y + 4 + k*4.6, {pt:9.5}));
    y += lines.length*4.6 + 2;
  });
  y += 4; h2('4. Materiał i koszt');
  const g = c.grams == null ? ac.g : c.grams, hrs = c.hours == null ? ac.h : c.hours;
  const fil = g/1000*(c.price||0), el = hrs*(c.watt||0)/1000*(c.kwh||0);
  const t2 = state.settings.tone2On ? tone2Heights() : [];
  if(t2.length){
    const hx = state.settings.tone2Color.toUpperCase(), rn = rosaName(state.settings.tone2Color);
    need(6); ptext(pg.x, 'Drugi kolor', 17, y + 4, {pt:9.5}); pg.x.fillStyle = hx; pg.x.fillRect(120, y + 1, 3.2, 3.2); pg.x.strokeStyle = INK; pg.x.lineWidth = 0.2; pg.x.strokeRect(120, y + 1, 3.2, 3.2);
    ptext(pg.x, `${rn || hx}, górne ${fmt(state.settings.tone2Band)} mm, ok. ${fmt(tone2Grams(),0)} g`, 125, y + 4, {pt:9.5, fam:'IBM Plex Mono'}); y += 5.5;
    need(6); ptext(pg.x, 'Zmiana koloru na wysokości', 17, y + 4, {pt:9.5}); ptext(pg.x, t2.map(([z,n]) => `${fmt(z)} mm (${n} szt.)`).join(', '), 120, y + 4, {pt:9.5, fam:'IBM Plex Mono'}); y += 5.5;
  }
  [[`Materiał`, `${c.mat}${state.settings.uniOn && rosaName(state.settings.uniColor) ? ' · ' + rosaName(state.settings.uniColor) : ''}, ok. ${fmt(g,0)} g`], ['Szacowany czas druku', `${fmt(hrs,1)} h`], ['Koszt filamentu', zl(fil)], ['Koszt prądu', zl(el)], ['Razem', zl(fil+el)]].forEach(([k,v], i) => {
    need(6); ptext(pg.x, k, 17, y + 4, {pt:9.5, wt: i===4?'700':'400'}); ptext(pg.x, v, 120, y + 4, {pt:9.5, wt: i===4?'700':'400', fam:'IBM Plex Mono'}); y += 5.5;
  });
  return pages;
}
async function makeInstruction(){
  if(!state.drawer || !state.items.length){ toast('Dodaj moduły do szuflady, żeby przygotować instrukcję.'); return; }
  const btn = $('#pdfBtn'); btn.disabled = true; btn.textContent = 'Przygotowuję…';
  try{
    try{ await Promise.all(['400 10px "IBM Plex Sans"','600 10px "IBM Plex Sans"','700 10px "IBM Plex Sans"','400 10px "IBM Plex Mono"','700 10px "Bricolage Grotesque"'].map(f => document.fonts.load(f))); }catch(e){}
    const D = state.drawer, order = orderedItems();
    const name = curName || `Szuflada ${fmt(D.w)} × ${fmt(D.d)} × ${fmt(D.h)} mm`;
    const date = new Date().toLocaleDateString('pl-PL', {day:'numeric', month:'long', year:'numeric'});
    const sub = `${name}  ·  wnętrze ${fmt(D.w)} × ${fmt(D.d)} × ${fmt(D.h)} mm  ·  ${state.items.length} modułów  ·  ${date}`;
    const pages = [planPage(order, sub), ...listPages(order, sub)];
    pages.forEach((pg, i) => pdfFooter(pg, i+1, pages.length));
    await offer(`instrukcja_${slug(name)}.pdf`, buildPdf(pages, 'Instrukcja: ' + name));
  }catch(e){ toast('Nie udało się przygotować PDF: ' + (e && e.message || e)); }
  finally{ btn.disabled = false; btn.textContent = 'Instrukcja PDF'; }
}
$('#pdfBtn').onclick = makeInstruction;


/* ---------- automatyczne wypełnienie (100%) ---------- */
const fill = {area:'free', region:null, strat:'mix', seed:1, use:null, req:new Map(), reqMode:'min', picking:false, pick:null, plan:null};
function computeFill(){
  const D = state.drawer; if(!D) return {err:'Najpierw podaj wymiary szuflady.'};
  const use = state.templates.filter(t => fill.use.has(t.id));
  if(!use.length) return {err:'Zaznacz co najmniej jeden moduł do użycia.'};
  let R, keepItems;
  if(fill.area === 'all'){ R = {x:0, y:0, w:D.w, d:D.d}; keepItems = []; }
  else if(fill.area === 'region'){ if(!fill.region) return {err:'Zaznacz fragment szuflady na planie.'}; R = fill.region; keepItems = state.items.slice(); }
  else { R = {x:0, y:0, w:D.w, d:D.d}; keepItems = state.items.slice(); }
  const inter = (a) => !(a.x >= R.x + R.w - EPS || a.x + a.w <= R.x + EPS || a.y >= R.y + R.d - EPS || a.y + a.d <= R.y + EPS);
  const kept = keepItems.map(it => ({it, box:{...box(it)}, changed:false}));
  const obst = kept.map(k => k.box).filter(inter);
  // 1) moduły z wpisaną ilością: najpierw je układamy (od tylnego lewego rogu, rzędami)
  const rnd = mulberry(fill.seed * 7919);
  const reqList = [];
  for(const t of use){ const n = fill.req.get(t.id) || 0; for(let i=0;i<n;i++) reqList.push(t); }
  reqList.sort((a,b) => (b.w*b.d) - (a.w*a.d) || (fill.strat === 'mix' ? rnd() - 0.5 : 0));
  const placed = [], missing = new Map(), occ = obst.slice();
  const fits = (b) => b.x >= R.x - EPS && b.y >= R.y - EPS && b.x + b.w <= R.x + R.w + EPS && b.y + b.d <= R.y + R.d + EPS && !occ.some(o => overlap(b, o));
  for(const t of reqList){
    const xs = [R.x, ...occ.map(o => o.x + o.w)], ys = [R.y, ...occ.map(o => o.y + o.d)];
    let best = null;
    for(const rot of [0,1]){ const w = rot ? t.d : t.w, d = rot ? t.w : t.d;
      for(const y of ys) for(const x of xs){ const b = {x, y, w, d};
        if(fits(b) && (!best || y < best.b.y - EPS || (Math.abs(y - best.b.y) < EPS && x < best.b.x - EPS))) best = {b, rot}; } }
    if(!best){ missing.set(t.id, (missing.get(t.id)||0) + 1); continue; }
    occ.push(best.b); placed.push({box:{...best.b}, orig:{...best.b}, tid:t.id, rot:best.rot, changed:false});
  }
  if(missing.size) return {err:'Nie mieszczą się: ' + [...missing].map(([id,n]) => `${tpl(id).name} ×${n}`).join(', ') + '. Zmniejsz wymagane ilości albo wybierz większy obszar.'};
  let rects = freeRects(R, occ);
  const keptNear = kept.filter(k => inter(k.box) || fill.area !== 'region');
  const keptAbs = fill.area === 'region' ? keptNear.filter(k => k.box.x >= R.x - EPS && k.box.y >= R.y - EPS && k.box.x + k.box.w <= R.x + R.w + EPS && k.box.y + k.box.d <= R.y + R.d + EPS) : keptNear;
  rects = absorbThin(rects, [...placed, ...keptAbs]);
  const stuck = rects.filter(r => r._stuck); rects = rects.filter(r => !r._stuck);
  // 2) reszta: moduły bez wpisanej ilości (przy „co najmniej” — wszystkie zaznaczone)
  const fillUse = fill.reqMode === 'exact' ? use.filter(t => !(fill.req.get(t.id) > 0)) : use;
  if(rects.length && !fillUse.length) return {err:'Po ułożeniu wymaganych modułów zostaje wolne miejsce, a wszystkie zaznaczone moduły mają wpisaną dokładną ilość. Zostaw co najmniej jeden moduł bez ilości albo przełącz na „co najmniej”.'};
  const sizes = []; const seen = new Set();
  for(const t of fillUse){ for(const rot of [0,1]){ const w = rot ? t.d : t.w, d = rot ? t.w : t.d, k = U(w)+'x'+U(d);
    if(seen.has(k) && fill.strat !== 'mix') continue; seen.add(k); sizes.push({tid:t.id, rot, w, d}); } }
  const cells = placed.map(p => ({box:p.box, tid:p.tid, rot:p.rot, changed:p.changed, req:true}));
  for(const r of rects) cells.push(...tileRect(r, sizes, fill.strat, rnd).cells);
  const total = R.w*R.d, obstArea = obst.reduce((a,o) => a + Math.max(0, Math.min(o.x+o.w, R.x+R.w) - Math.max(o.x, R.x)) * Math.max(0, Math.min(o.y+o.d, R.y+R.d) - Math.max(o.y, R.y)), 0);
  const stuckArea = stuck.reduce((a,r) => a + r.w*r.d, 0);
  const expanded = kept.filter(k => k.changed);
  const expArea = expanded.reduce((a,k) => a + k.box.w*k.box.d - box(k.it).w*box(k.it).d, 0);
  const filled = cells.reduce((a,c) => a + c.box.w*c.box.d, 0) + obstArea + expArea;
  return {R, cells, expanded, stuck, pct: Math.min(100, filled/total*100), stuckArea, area: fill.area};
}
function variantFor(t, w, d){
  if(Math.abs(w - t.w) < 0.01 && Math.abs(d - t.d) < 0.01) return t;
  const baseName = t.baseName || t.name, baseId = t.base || t.id;
  const want = fixCells(Object.assign({}, t, {w, d}));
  let v = state.templates.find(x => (x.base || x.id) === baseId && Math.abs(x.w - w) < 0.01 && Math.abs(x.d - d) < 0.01 && x.nx === want.nx && x.ny === want.ny && x.wall === t.wall && x.floor === t.floor && x.divPct === t.divPct && x.hAuto === t.hAuto && x.h === t.h);
  if(v) return v;
  v = Object.assign(JSON.parse(JSON.stringify(t)), {id:'c'+(uid++), preset:false, base:baseId, baseName, w, d, nx:want.nx, ny:want.ny, name:`${baseName} ${fmt(w)}×${fmt(d)}`});
  state.templates.splice(state.templates.indexOf(t) + 1, 0, v);
  return v;
}
function renderFillPrev(){
  const res = fill.plan = computeFill();
  $('#fErr').textContent = res.err || '';
  $('#fApply').disabled = !!res.err;
  $('#fRegionInfo').textContent = fill.region ? `${fmt(fill.region.w)} × ${fmt(fill.region.d)} mm, od lewej ${fmt(fill.region.x)}, od tyłu ${fmt(fill.region.y)}` : 'nie zaznaczono';
  if(res.err){ $('#fPrev').innerHTML = ''; $('#fStats').innerHTML = ''; return; }
  const D = state.drawer, m = Math.max(D.w, D.d)*0.02;
  let sv = `<svg viewBox="${-m} ${-m} ${D.w+2*m} ${D.d+2*m}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${D.w}" height="${D.d}" fill="var(--floor)" stroke="var(--wall)" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
  const keptIds = new Set(res.area === 'all' ? [] : state.items.map(i => i.id));
  for(const it of state.items){ if(!keptIds.has(it.id)) continue; const ex = res.expanded.find(k => k.it === it), b = ex ? ex.box : box(it);
    sv += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.d}" fill="var(--wall)" fill-opacity=".45" stroke="${ex ? 'var(--warn)' : 'var(--wall)'}" stroke-width="${ex?2:1}" vector-effect="non-scaling-stroke"/>`; }
  for(const c of res.cells){ const t = tpl(c.tid), b = c.box;
    sv += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.d}" fill="${t.color}" fill-opacity=".8" stroke="#000" stroke-opacity=".35" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    if(c.changed) sv += `<rect x="${b.x + b.w*0.2}" y="${b.y + b.d*0.2}" width="${b.w*0.6}" height="${b.d*0.6}" fill="none" stroke="#fff" stroke-width="1.2" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>`; }
  for(const r of res.stuck) sv += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.d}" fill="var(--danger)" fill-opacity=".6"/>`;
  if(res.area === 'region') sv += `<rect x="${res.R.x}" y="${res.R.y}" width="${res.R.w}" height="${res.R.d}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>`;
  $('#fPrev').innerHTML = sv + '</svg>';
  const byT = new Map(); res.cells.forEach(c => byT.set(c.tid, (byT.get(c.tid)||0) + 1));
  const changed = res.cells.filter(c => c.changed).length, ok = res.pct >= 99.999;
  const reqRows = [...fill.req].filter(([id,n]) => n > 0 && fill.use.has(id) && tpl(id)).map(([id,n]) => { const got = byT.get(id) || 0;
    return `<span>${esc(tpl(id).name)}: wymagane ${fill.reqMode === 'exact' ? '' : 'min. '}${n}</span><b class="${(fill.reqMode === 'exact' ? got === n : got >= n) ? 'ok' : 'bad'}">${got} szt.</b>`; }).join('');
  $('#fStats').innerHTML = `<div class="fstat">
    <span>Zapełnienie obszaru</span><b class="${ok ? 'ok' : 'bad'}">${ok ? '100%' : fmt(res.pct, 1) + '%'}</b>
    <span>Nowe moduły</span><b>${res.cells.length} szt.</b>
    <span>W tym dopasowane (nowe warianty)</span><b>${changed} szt.</b>
    ${res.expanded.length ? `<span>Poszerzone ułożone moduły (zamykają szczeliny)</span><b>${res.expanded.length} szt.</b>` : ''}
    ${reqRows}
    </div>
    <p class="hint" style="margin:4px 0 0">${[...byT].map(([id,n]) => `${esc(tpl(id).name)} ×${n}`).join(' · ')}</p>
    ${ok ? '' : `<p class="err" style="margin:4px 0 0">Zostały szczeliny węższe niż ${MINSZ} mm (${fmt(res.stuckArea/100,0)} cm², na czerwono), których nie da się zamknąć bez przesuwania ułożonych modułów. Wybierz „Cała szuflada od nowa” — wtedy wypełnienie zawsze wynosi 100%.</p>`}
    <p class="hint" style="margin:4px 0 0">Moduły z przerywaną ramką mają dopasowany rozmiar.</p>`;
}
function openFill(){
  if(!state.drawer){ toast('Najpierw podaj wymiary szuflady.'); return; }
  if(!fill.use) fill.use = new Set(state.templates.filter(t => !t.base).map(t => t.id));
  for(const id of [...fill.use]) if(!tpl(id)) fill.use.delete(id);
  if(fill.area === 'free' && !state.items.length) fill.area = 'all';
  document.querySelectorAll('input[name=fArea]').forEach(r => r.checked = r.value === fill.area);
  $('#fStrat').value = fill.strat;
  $('#fMods').innerHTML = state.templates.map(t => `<div class="frow"><label class="check"><input type="checkbox" data-t="${t.id}" ${fill.use.has(t.id)?'checked':''}><span class="dot" style="background:${t.color}"></span><span class="fname">${esc(t.name)}</span><span class="meta">${fmt(t.w)}×${fmt(t.d)} · ${t.nx}×${t.ny}</span></label>
    <input class="fqty" type="number" min="0" max="200" step="1" data-q="${t.id}" value="${fill.req.get(t.id) || ''}" placeholder="auto" aria-label="Wymagana ilość: ${esc(t.name)}" ${fill.use.has(t.id)?'':'disabled'}></div>`).join('');
  $('#fReqMode').value = fill.reqMode;
  $('#ovFill').hidden = false; renderFillPrev();
}
$('#fillBtn').onclick = openFill;
$('#fCancel').onclick = () => { $('#ovFill').hidden = true; };
document.querySelectorAll('input[name=fArea]').forEach(r => r.addEventListener('change', () => { fill.area = r.value; if(fill.area === 'region' && !fill.region){ startPick(); return; } renderFillPrev(); }));
$('#fStrat').addEventListener('change', e => { fill.strat = e.target.value; renderFillPrev(); });
$('#fMods').addEventListener('change', e => { const c = e.target.closest('[data-t]'); if(!c) return; if(c.checked) fill.use.add(c.dataset.t); else fill.use.delete(c.dataset.t);
  const q = $(`#fMods [data-q="${c.dataset.t}"]`); if(q) q.disabled = !c.checked; renderFillPrev(); });
let qT; $('#fMods').addEventListener('input', e => { const q = e.target.closest('[data-q]'); if(!q) return;
  const n = parseInt(q.value, 10); if(isFinite(n) && n > 0) fill.req.set(q.dataset.q, Math.min(200, n)); else fill.req.delete(q.dataset.q);
  clearTimeout(qT); qT = setTimeout(renderFillPrev, 250); });
$('#fReqMode').addEventListener('change', e => { fill.reqMode = e.target.value; renderFillPrev(); });
$('#fShuffle').onclick = () => { fill.seed++; if(fill.strat !== 'mix'){ fill.strat = 'mix'; $('#fStrat').value = 'mix'; } renderFillPrev(); };
function startPick(){
  $('#ovFill').hidden = true; setView('2d'); fill.picking = true; fill.pick = null; sel = null; refresh();
  $('#pickBanner').hidden = false;
}
$('#fPick').onclick = startPick;
$('#pickCancel').onclick = () => { fill.picking = false; fill.pick = null; $('#pickBanner').hidden = true; render2d(); openFill(); };
$('#fApply').onclick = () => {
  const res = fill.plan; if(!res || res.err) return;
  if(res.area === 'all') state.items = [];
  for(const k of res.expanded){ const t = tpl(k.it.tid), dm = dimsFor(k.it, k.box), v = variantFor(t, dm.w, dm.d); k.it.tid = v.id; k.it.x = k.box.x; k.it.y = k.box.y; }
  for(const c of res.cells){ const t = tpl(c.tid), dm = c.rot ? {w:c.box.d, d:c.box.w} : {w:c.box.w, d:c.box.d}, v = variantFor(t, dm.w, dm.d);
    state.items.push({id:'i'+(uid++), tid:v.id, x:c.box.x, y:c.box.y, rot:c.rot}); }
  sel = null; $('#ovFill').hidden = true; commit();
  toast(res.pct >= 99.999 ? `Wypełniono 100% obszaru: ${res.cells.length} nowych modułów.` : `Wypełniono ${fmt(res.pct,1)}% — zostały wąskie szczeliny przy ułożonych modułach.`);
};


/* ---------- gotowe układy szuflad kuchennych ---------- */
const kit = {sel:null, res:new Map()};
function kitCompute(){
  const D = state.drawer, dim = {W:D.w, D:D.d, H:D.h};
  kit.res = new Map(KITS.map(k => [k.id, buildKit(k, dim, state.settings.bed)]));
  if(!kit.sel || !kit.res.get(kit.sel).ok) kit.sel = (KITS.find(k => kit.res.get(k.id).ok) || {}).id || null;
}
function kitPreview(res){
  const D = state.drawer, m = Math.max(D.w, D.d)*0.02, big = Math.max(D.w, D.d), fs = big/34;
  let sv = `<svg viewBox="${-m} ${-m} ${D.w+2*m} ${D.d+2*m}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="kgap" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.5" height="6" fill="var(--danger)" fill-opacity=".5"/></pattern></defs><rect x="0" y="0" width="${D.w}" height="${D.d}" fill="var(--floor)" stroke="var(--wall)" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
  for(const g of res.gaps) sv += `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.d}" fill="url(#kgap)" stroke="var(--danger)" stroke-opacity=".6" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  for(const c of res.cells){
    const col = ZONES[c.zone].color, lw = (c.w - (c.nx+1)*WALL)/c.nx, ld = (c.d - (c.ny+1)*WALL)/c.ny;
    sv += `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.d}" fill="${col}" fill-opacity=".45" stroke="#000" stroke-opacity=".5" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    for(let i=0;i<c.nx;i++) for(let j=0;j<c.ny;j++)
      sv += `<rect x="${c.x + WALL + i*(lw+WALL)}" y="${c.y + WALL + j*(ld+WALL)}" width="${lw}" height="${ld}" fill="${col}" fill-opacity=".85" stroke="#000" stroke-opacity=".25" stroke-width=".6" vector-effect="non-scaling-stroke"/>`;
  }
  // podpisy: nazwa modułu w 1–2 liniach, czcionka dopasowana do szerokości; za małe moduły bez podpisu
  const label = (x, y, w, d, text) => {
    const words = String(text).split(' '); let lines = [text];
    if(words.length > 1 && text.length * 0.56 * fs > w * 0.9){ let best = null;
      for(let i = 1; i < words.length; i++){ const a = words.slice(0, i).join(' '), b = words.slice(i).join(' '), m = Math.max(a.length, b.length); if(!best || m < best.m) best = {m, l:[a, b]}; }
      lines = best.l; }
    const longest = Math.max(...lines.map(l => l.length)), f = Math.min(fs, w * 0.92 / (longest * 0.56));
    if(f < big/95 || f * 1.25 * lines.length > d * 0.95) return '';
    return lines.map((l, i) => `<text x="${x + w/2}" y="${y + d/2 + (i - (lines.length-1)/2) * f * 1.25}" font-size="${f}" text-anchor="middle" dominant-baseline="middle" fill="#111" stroke="#fff" stroke-opacity=".7" stroke-width="${f/6}" paint-order="stroke">${esc(l)}</text>`).join('');
  };
  for(const c of res.cells) sv += label(c.x, c.y, c.w, c.d, c.label);
  for(const g of res.gaps) sv += label(g.x, g.y, g.w, g.d, 'wolne miejsce');
  return sv + '</svg>';
}
function renderKit(){
  const D = state.drawer;
  $('#kitList').innerHTML = KITS.map(k => { const r = kit.res.get(k.id);
    return `<button type="button" class="kititem" data-k="${k.id}" aria-pressed="${k.id === kit.sel}" ${r.ok ? '' : 'disabled'}><b>${esc(k.name)}</b><span>${esc(k.short)}</span>${r.ok ? `<span>${r.stats.modules} szt. modułów, ${r.stats.kinds} rodz.</span>` : `<span class="no">Nie pasuje: ${esc(r.reason)}</span>`}</button>`; }).join('');
  const k = KITS.find(x => x.id === kit.sel), r = k && kit.res.get(k.id);
  $('#kitApply').disabled = !r || !r.ok;
  $('#kitErr').textContent = r && r.ok ? '' : `Żaden układ nie mieści się w szufladzie ${fmt(D.w)} × ${fmt(D.d)} × ${fmt(D.h)} mm.`;
  if(!r || !r.ok){ ['#kitPrev','#kitLeg','#kitWhere','#kitWhy','#kitStats'].forEach(q => $(q).innerHTML = ''); return; }
  $('#kitPrev').innerHTML = kitPreview(r);
  const zs = [...new Set([...r.cells.map(c => c.zone)])];
  $('#kitLeg').innerHTML = zs.map(z => `<span><span class="dot" style="background:${ZONES[z].color}"></span>${esc(ZONES[z].name)}</span>`).join('') + (r.gaps.length ? '<span><span class="dot" style="background:var(--danger);opacity:.5"></span>wolne miejsce</span>' : '');
  $('#kitWhere').innerHTML = `<b>Gdzie:</b> ${esc(k.where)}`;
  $('#kitWhy').innerHTML = k.why.map(w => `<li>${esc(w)}</li>`).join('');
  const byLabel = new Map(); r.cells.forEach(c => { const key = `${c.label} ${fmt(c.w,0)}×${fmt(c.d,0)} (${c.nx}×${c.ny})`; byLabel.set(key, (byLabel.get(key)||0)+1); });
  $('#kitStats').innerHTML = `<p class="hint" style="margin:0">${[...byLabel].map(([n,c]) => `${esc(n)} ×${c}`).join(' · ')}</p>` +
    (state.items.length ? `<p class="kitnote">Wstawienie zastąpi obecny układ (${state.items.length} szt. modułów).</p>` : '') +
    r.notes.map(n => `<p class="kitnote">${esc(n)}</p>`).join('');
}
function openKit(){
  if(!state.drawer){ toast('Najpierw podaj wymiary szuflady.'); openDrawer(); return; }
  kitCompute(); renderKit(); $('#ovKit').hidden = false;
}
$('#kitBtn').onclick = openKit;
$('#kitCancel').onclick = () => { $('#ovKit').hidden = true; };
$('#kitList').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if(!b || b.disabled) return; kit.sel = b.dataset.k; renderKit(); });
$('#kitApply').onclick = () => {
  const r = kit.res.get(kit.sel), k = KITS.find(x => x.id === kit.sel), D = state.drawer; if(!r || !r.ok) return;
  state.items = [];
  state.templates = state.templates.filter(t => t.preset || !t.base);   // zbędne warianty z poprzednich układów i wypełnień
  const made = new Map(), hMaxAuto = Math.max(15, Math.round(D.h - 3));
  for(const c of r.cells){
    const key = [c.zone, c.label, c.w, c.d, c.nx, c.ny, c.divPct, c.hMax].join('|');
    let t = made.get(key);
    if(!t){
      t = {id:'c'+(uid++), name:`${c.label} ${fmt(c.w)}×${fmt(c.d)}`, w:c.w, d:c.d, nx:c.nx, ny:c.ny, h:c.hMax != null ? Math.min(c.hMax, hMaxAuto) : 40, hAuto:c.hMax == null,
        wall:1.6, floor:1.2, divPct:c.divPct, color:ZONES[c.zone].color, preset:false, base:'g:' + c.zone, baseName:c.label};
      made.set(key, t); state.templates.push(t);
    }
    state.items.push({id:'i'+(uid++), tid:t.id, x:c.x, y:c.y, rot:0});
  }
  sel = null; $('#ovKit').hidden = true; commit();
  toast(`Wstawiono układ „${k.name}”: ${r.cells.length} szt. modułów, ${r.stats.kinds} rodz.${r.gaps.length ? ' Zostało wolne miejsce.' : ''}`);
};

/* ---------- tryb prezentacji: realistyczny render do zdjęć produktowych ---------- */
const pres = {open:false, shot:'hero', drawer:'oak', bg:'#F4F4F2', la:35, le:55, layers:true, ao:true, size:'2000x2000', wm:'', P:null,
  subj:'layout', rad:'white', one:null, keep:{}};  // subj: 'layout' (szuflada) albo 'single' (pojedynczy model, np. wieszak)
const isOne = () => pres.subj === 'single';
// otoczenie pojedynczego modelu: rurki grzejnika drabinkowego
const RADS = {
  white:{color:'#F3F3EF', rough:.36, clear:.55, metal:0, env:.45},
  anthracite:{color:'#3B3E42', rough:.48, clear:.35, metal:0, env:.4},
  chrome:{color:'#E4E7EA', rough:.07, clear:0, metal:1, env:1.1},
};
const DRAWERS = {
  oak:{base:'#C9A27A', dark:'#99714C', light:'#DDBB92', rough:.62, grain:true},
  walnut:{base:'#6B4A33', dark:'#45301F', light:'#87624A', rough:.55, grain:true},
  white:{base:'#ECEAE5', rough:.42, grain:false},
  anthracite:{base:'#3A3D41', rough:.55, grain:false}
};
const woodCache = new Map();
function woodTex(kind){
  if(woodCache.has(kind)) return woodCache.get(kind);
  const d = DRAWERS[kind], c = document.createElement('canvas'); c.width = 2048; c.height = 512;
  const x = c.getContext('2d'), rnd = mulberry(kind.length*991 + 7);
  x.fillStyle = d.base; x.fillRect(0, 0, c.width, c.height);
  if(d.grain){
    for(let i=0;i<260;i++){
      const y0 = rnd()*c.height, amp = 2 + rnd()*10, per = 300 + rnd()*900, ph = rnd()*6.28;
      x.strokeStyle = rnd() < .6 ? d.dark : d.light; x.globalAlpha = .04 + rnd()*.16; x.lineWidth = .6 + rnd()*2.6;
      x.beginPath(); for(let px=0; px<=c.width; px+=16){ const py = y0 + Math.sin(px/per*6.28 + ph)*amp + Math.sin(px/97 + ph)*1.2; px ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
    }
    for(let i=0;i<40;i++){ x.globalAlpha = .05 + rnd()*.06; x.fillStyle = d.dark; x.fillRect(rnd()*c.width, rnd()*c.height, 30 + rnd()*120, .8 + rnd()*1.2); }
  }
  const img = x.getImageData(0, 0, c.width, c.height), px = img.data;
  for(let i=0;i<px.length;i+=4){ const n = (rnd() - .5) * (d.grain ? 10 : 5); px[i] += n; px[i+1] += n; px[i+2] += n; }
  x.putImageData(img, 0, 0); x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
  woodCache.set(kind, t); return t;
}
// materiał PLA z wypukłymi ścieżkami warstw (0,2 mm) na ściankach i liniami górnej warstwy
const presMats = new Map();
// axis: kierunek narastania warstw w scenie — 'y' (moduły szuflady) albo 'z' (model drukowany na boku)
function plaMat(hex, axis = 'y'){
  const key = hex + '|' + pres.layers + '|' + axis; if(presMats.has(key)) return presMats.get(key);
  const A = axis === 'z' ? {c:'z', up:'vec4(0.0, 0.0, 1.0, 0.0)', diag:'(vWP.x + vWP.y)', dv:'vec4(0.7071, -0.7071, 0.0, 0.0)'}
                         : {c:'y', up:'vec4(0.0, 1.0, 0.0, 0.0)', diag:'(vWP.x + vWP.z)', dv:'vec4(0.7071, 0.0, -0.7071, 0.0)'};
  const matte = (findFil(hex) || {}).matte;
  const m = new THREE.MeshPhysicalMaterial({color:new THREE.Color(hex).convertSRGBToLinear(), metalness:0,
    ...(matte ? {roughness:.88, clearcoat:0, envMapIntensity:.2} : {roughness:.42, clearcoat:.15, clearcoatRoughness:.35, envMapIntensity:.18})});
  const on = pres.layers ? 1 : 0, amp = matte ? .3 : .45;
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if(${on}.0 > 0.5){
        vec3 wn = inverseTransformDirection(normal, viewMatrix);
        float side = 1.0 - smoothstep(0.55, 0.9, abs(wn.${A.c}));
        float t = vWP.${A.c} / 0.2, fw = fwidth(t);
        float a = ${amp.toFixed(2)} * (1.0 - smoothstep(0.35, 0.8, fw)) * side;
        vec3 upV = normalize((viewMatrix * ${A.up}).xyz);
        normal = normalize(normal + upV * sin(t * 6.2831853) * a);
        // nierówności co kilka warstw (lekkie falowanie osi Z) — widoczne także z dalszej odległości
        float t3 = vWP.${A.c} / 0.8, fw3 = fwidth(t3);
        float n3 = sin(t3 * 6.2831853 + sin(vWP.${A.c} * 0.37) * 2.0) * 0.6 + sin(vWP.${A.c} * 2.9 + 1.3) * 0.4;
        normal = normalize(normal + upV * n3 * 0.07 * (1.0 - smoothstep(0.3, 0.9, fw3)) * side);
        float t2 = ${A.diag} / 0.42, fw2 = fwidth(t2);
        float a2 = 0.10 * (1.0 - smoothstep(0.2, 0.55, fw2)) * (1.0 - side);
        vec3 dV = normalize((viewMatrix * ${A.dv}).xyz);
        normal = normalize(normal + dV * sin(t2 * 6.2831853) * a2);
      }`);
  };
  m.customProgramCacheKey = () => 'pla' + on + amp + axis;
  presMats.set(key, m); return m;
}
function presInit(){
  if(pres.P) return true;
  if(!window.THREE){ toast('Nie udało się wczytać silnika 3D.'); return false; }
  const host = $('#presHost');
  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); host.appendChild(renderer.domElement);
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(28, 1, 5, 20000);
  if(THREE.RoomEnvironment){ const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture; pm.dispose(); }
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9a9a96, .1); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, .82); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.5; scene.add(key); scene.add(key.target);
  const fillL = new THREE.DirectionalLight(0xffffff, .12); scene.add(fillL);
  const group = new THREE.Group(); scene.add(group);
  const controls = THREE.OrbitControls ? new THREE.OrbitControls(camera, renderer.domElement) : null;
  if(controls){ controls.enableDamping = true; controls.dampingFactor = .1; controls.maxPolarAngle = Math.PI*0.495; controls.screenSpacePanning = true; }
  let composer = null, ssao = null;
  if(THREE.EffectComposer && THREE.SSAOPass && THREE.GammaCorrectionShader){
    composer = new THREE.EffectComposer(renderer);
    ssao = new THREE.SSAOPass(scene, camera, 512, 512); composer.addPass(ssao);
    composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
  }
  pres.P = {renderer, scene, camera, controls, key, fillL, hemi, group, composer, ssao, host};
  if(controls) controls.addEventListener('change', presDirty);
  const frame = $('#presFrame');
  new ResizeObserver(presLayout).observe($('#presStage'));
  return true;
}
function presAspect(){ const [w,h] = pres.size.split('x').map(Number); return {w, h, a:w/h}; }
function presLayout(){
  const P = pres.P; if(!P) return;
  const st = $('#presStage'), fr = $('#presFrame'), {a} = presAspect();
  const aw = st.clientWidth - 32, ah = st.clientHeight - 32; if(aw <= 0 || ah <= 0) return;
  let w = aw, h = aw / a; if(h > ah){ h = ah; w = ah * a; }
  fr.style.width = Math.floor(w) + 'px'; fr.style.height = Math.floor(h) + 'px';
  presSetSize(Math.floor(w), Math.floor(h), Math.min(devicePixelRatio, 2));
  pres.dirty = true;
}
function presSetSize(w, h, pr){
  const P = pres.P; P.renderer.setPixelRatio(pr); P.renderer.setSize(w, h, false);
  P.camera.aspect = w / h; P.camera.updateProjectionMatrix();
  if(P.composer){ P.composer.setPixelRatio ? P.composer.setPixelRatio(pr) : 0; P.composer.setSize(w, h); }
}
function presBounds(){
  if(isOne()){ const g = pres.one.spec; return {x0:0, x1:g.size.w, y0:0, y1:g.size.d, z0:0, z1:g.W}; }
  const D = state.drawer, t = pres.drawer === 'none' ? 0 : 16;
  return {x0:-t, x1:D.w + t, z0:-t, z1:D.d + t + (pres.drawer === 'none' ? 0 : 18), y0:pres.drawer === 'none' ? 0 : -10, y1:D.h + 12};
}
function presBuild(){
  const P = pres.P, D = state.drawer, g = P.group;
  while(g.children.length){ const c = g.children.pop(); if(c.geometry && c.userData.own) c.geometry.dispose(); }
  if(isOne()){ presBuildOne(); return; }
  const none = pres.drawer === 'none', T16 = 16, base = none ? 0 : -8;
  // moduły
  for(const it of state.items){
    const tp = tpl(it.tid), parts = splitParts(viewGeo(tp), tp);
    parts.forEach((gg, pi) => {
      const {bg} = threeGeo(gg);
      const col = pi === 1 ? state.settings.tone2Color : (state.settings.uniOn ? state.settings.uniColor : tp.color);
      const m = new THREE.Mesh(bg, plaMat(col)); m.castShadow = m.receiveShadow = true;
      if(it.rot){ m.rotation.y = Math.PI/2; m.position.set(it.x, 0, it.y + tp.w); } else m.position.set(it.x, 0, it.y);
      g.add(m);
    });
  }
  // szuflada
  if(!none){
    const dk = DRAWERS[pres.drawer], tex = woodTex(pres.drawer);
    const board = (L, H, Th, x, y, z, rotY, grainLen) => {
      const t2 = tex.clone(); t2.needsUpdate = true; t2.repeat.set(grainLen/900, H/220); t2.offset.set((x*0.37 + z*0.11) % 1, (y*0.13) % 1);
      const mat = new THREE.MeshPhysicalMaterial({map:t2, roughness:dk.rough, clearcoat: dk.grain ? .1 : .05, clearcoatRoughness:.5, envMapIntensity:.25});
      const m = new THREE.Mesh(new THREE.BoxGeometry(L, H, Th), mat); m.userData.own = true;
      m.rotation.y = rotY || 0; m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m;
    };
    const sideH = D.h + 12;
    board(D.w + 2*T16, 8, D.d + 2*T16, D.w/2, -4, D.d/2, 0, D.w + 2*T16);                       // dno
    board(D.d + T16, sideH, T16, -T16/2, sideH/2 - 8, D.d/2 - T16/2, Math.PI/2, D.d);          // lewy bok
    board(D.d + T16, sideH, T16, D.w + T16/2, sideH/2 - 8, D.d/2 - T16/2, Math.PI/2, D.d);     // prawy bok
    board(D.w, sideH, T16, D.w/2, sideH/2 - 8, -T16/2, 0, D.w);                                 // tył
    const fH = D.h + 22, fW = D.w + 2*T16 + 4;
    board(fW, fH, 18, D.w/2, fH/2 - 10, D.d + 9, 0, fW);                                        // front
    const hm = new THREE.MeshPhysicalMaterial({color:new THREE.Color('#9EA2A6').convertSRGBToLinear(), metalness:.85, roughness:.38, envMapIntensity:.55});
    const hw = Math.min(320, D.w*.45), hd = new THREE.Mesh(new THREE.BoxGeometry(hw, 10, 14), hm); hd.userData.own = true;
    hd.position.set(D.w/2, fH - 10 - 22, D.d + 18 + 7); hd.castShadow = true; g.add(hd);
    [-1,1].forEach(sx => { const leg = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 14), hm); leg.userData.own = true; leg.position.set(D.w/2 + sx*(hw/2 - 14), fH - 10 - 22, D.d + 18 + 7 - 7); g.add(leg); });
  }
  // miękki cień kontaktowy pod szufladą / modułami
  {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    const gr = x.createRadialGradient(128,128,40,128,128,128); gr.addColorStop(0,'rgba(0,0,0,0.55)'); gr.addColorStop(.55,'rgba(0,0,0,0.25)'); gr.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0,0,256,256);
    const tx = new THREE.CanvasTexture(c), B = presBounds();
    const cm = new THREE.MeshBasicMaterial({map:tx, transparent:true, depthWrite:false, opacity: pres.bg === '#2A2C2E' ? .9 : .55});
    const cs = new THREE.Mesh(new THREE.PlaneGeometry((B.x1 - B.x0)*1.25, (B.z1 - B.z0)*1.25), cm); cs.userData.own = true;
    cs.rotation.x = -Math.PI/2; cs.position.set((B.x0 + B.x1)/2, (none ? 0 : -8) - 0.05, (B.z0 + B.z1)/2); cs.renderOrder = -1; g.add(cs);
  }
  // podłoże studia (tylko cień)
  const gm = new THREE.ShadowMaterial({opacity: pres.bg === '#2A2C2E' ? .45 : .22});
  const GS = Math.max(D.w, D.d)*6, ground = new THREE.Mesh(new THREE.PlaneGeometry(GS, GS), gm); ground.userData.own = true;
  ground.rotation.x = -Math.PI/2; ground.position.set(D.w/2, none ? -0.01 : -8.01, D.d/2); ground.receiveShadow = true; g.add(ground);
  presBg(); presLight(); pres.dirty = true;
}
// pojedynczy model: wieszak na rurce grzejnika drabinkowego, za nim ściana (tylko cień, w kolorze tła)
function presBuildOne(){
  const P = pres.P, g = P.group, o = pres.one, B = presBounds();
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(o.mesh.pos, 3)); bg.computeVertexNormals();
  const hook = new THREE.Mesh(bg, plaMat(o.color, 'z')); hook.userData.own = true; hook.castShadow = hook.receiveShadow = true; g.add(hook);
  const cyl = o.scene.cylinders || [], dark = pres.bg === '#2A2C2E', zc = (B.z0 + B.z1)/2;
  let wallX = B.x0 - 40;
  if(cyl.length && pres.rad !== 'none'){
    const R = RADS[pres.rad];
    const mat = new THREE.MeshPhysicalMaterial({color:new THREE.Color(R.color).convertSRGBToLinear(), roughness:R.rough, metalness:R.metal,
      clearcoat:R.clear, clearcoatRoughness:.18, envMapIntensity:R.env});
    // rurki z modelu + kolejne w tym samym rozstawie (grzejnik drabinkowy), długie — wychodzą poza kadr
    const ys = cyl.map(c => c.y), pitch = cyl.length > 1 ? Math.abs(ys[1] - ys[0]) : 0, top = Math.max(...ys), bot = Math.min(...ys);
    const all = cyl.map(c => ({...c}));
    if(pitch){ for(let k=1;k<=2;k++){ all.push({...cyl[0], y: top + k*pitch}); all.push({...cyl[0], y: bot - k*pitch}); } }
    // ujęcie z boku: krótkie odcinki rurek (przekrój), żeby nie zasłaniały profilu wieszaka
    const len = pres.shot === 'top' ? (B.z1 - B.z0) + 70 : 1400;
    pres.stubs = pres.shot === 'top';
    for(const c of all){
      const m = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r, len, 96, 1), mat); m.userData.own = true;
      m.rotation.x = Math.PI/2; m.position.set(c.x, c.y, zc); m.castShadow = m.receiveShadow = true; g.add(m);
    }
    wallX = Math.min(...cyl.map(c => c.x - c.r)) - 45;
  }
  // bez grzejnika: sam wieszak, bez ściany i cienia — czysty wycinek produktu
  if(pres.rad === 'none' || !cyl.length){ presBg(); presLight(); pres.dirty = true; return; }
  const wm = new THREE.ShadowMaterial({opacity: dark ? .32 : .12});
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), wm); wall.userData.own = true;
  wall.rotation.y = Math.PI/2; wall.position.set(wallX, (B.y0 + B.y1)/2, zc); wall.receiveShadow = true; g.add(wall);
  presBg(); presLight(); pres.dirty = true;
}
function presBg(){
  const P = pres.P, tr = pres.bg === 'transparent', useComp = pres.ao && P.composer && !tr;
  P.scene.background = tr ? null : (useComp ? new THREE.Color(pres.bg).convertSRGBToLinear() : new THREE.Color(pres.bg));
  P.renderer.setClearColor(0x000000, tr ? 0 : 1);
  $('#presFrame').style.background = tr ? 'transparent' : pres.bg;
  const dark = pres.bg === '#2A2C2E'; $('#presWm').style.color = dark ? 'rgba(255,255,255,.85)' : 'rgba(27,33,30,.78)';
}
function presLight(){
  if(isOne()){
    const P = pres.P, B = presBounds(), S = Math.max(B.x1 - B.x0, B.y1 - B.y0, B.z1 - B.z0);
    const c = new THREE.Vector3((B.x0 + B.x1)/2, (B.y0 + B.y1)/2, (B.z0 + B.z1)/2);
    // kąt 0° = światło z boku (oś z), 90° = z przodu, od strony pokoju
    const a = pres.la*Math.PI/180, e = pres.le*Math.PI/180, r = S*6;
    P.key.position.set(c.x + Math.abs(Math.sin(a))*Math.cos(e)*r + S*0.6, c.y + Math.sin(e)*r, c.z + Math.cos(a)*Math.cos(e)*r);
    P.key.target.position.copy(c); P.key.target.updateMatrixWorld();
    const sc = P.key.shadow.camera, ext = S*2.6; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = r*0.2; sc.far = r*2.5; sc.updateProjectionMatrix();
    P.fillL.position.set(c.x + r, c.y + r*0.3, c.z - Math.cos(a)*r);
    pres.dirty = true; return;
  }
  const P = pres.P, D = state.drawer, S = Math.max(D.w, D.d), cx = D.w/2, cz = D.d/2;
  const a = pres.la*Math.PI/180, e = pres.le*Math.PI/180, r = S*2.2;
  P.key.position.set(cx + Math.sin(a)*Math.cos(e)*r, Math.sin(e)*r, cz + Math.cos(a)*Math.cos(e)*r);
  P.key.target.position.set(cx, 0, cz); P.key.target.updateMatrixWorld();
  const sc = P.key.shadow.camera, ext = S*1.1; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = r*0.3; sc.far = r*2; sc.updateProjectionMatrix();
  P.fillL.position.set(cx - Math.sin(a)*r, r*0.6, cz - Math.cos(a)*r);
  pres.dirty = true;
}
function presShot(kind){
  pres.shot = kind; document.querySelectorAll('#pShot button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === kind));
  if(isOne()){ presShotOne(kind); return; }
  const P = pres.P, D = state.drawer, B = presBounds();
  let target = new THREE.Vector3((B.x0 + B.x1)/2, D.h*0.3, (B.z0 + B.z1)/2);
  const rad = Math.hypot(B.x1 - B.x0, B.y1 - B.y0, B.z1 - B.z0)/2;
  let az = 28, el = 42, fov = 28, k = 1.02;
  if(kind === 'top'){ az = 0; el = 89.5; fov = 24; k = 0.84; target.y = 0; }
  if(kind === 'front'){ az = 0; el = 24; fov = 30; k = 0.98; }
  if(kind === 'detail'){ az = 22; el = 50; fov = 24; k = 0.5; target = new THREE.Vector3(D.w*0.3, D.h*0.2, D.d*0.62); }
  P.camera.fov = fov;
  const dist = rad / Math.sin(fov*Math.PI/360) * k, A = az*Math.PI/180, E = el*Math.PI/180;
  P.camera.position.set(target.x + Math.sin(A)*Math.cos(E)*dist, target.y + Math.sin(E)*dist, target.z + Math.cos(A)*Math.cos(E)*dist);
  P.camera.near = Math.max(2, dist*0.08); P.camera.far = dist*4; P.camera.updateProjectionMatrix();
  if(P.controls){ P.controls.target.copy(target); P.controls.update(); } else P.camera.lookAt(target);
  presAO(); pres.dirty = true;
}
function presShotOne(kind){
  if((kind === 'top') !== !!pres.stubs) presBuild();
  const P = pres.P, B = presBounds(), o = pres.one;
  let target = new THREE.Vector3((B.x0 + B.x1)/2, (B.y0 + B.y1)/2, (B.z0 + B.z1)/2);
  const rad = Math.hypot(B.x1 - B.x0, B.y1 - B.y0, B.z1 - B.z0)/2;
  // azymut 0° = z boku (widać profil), 90° = od frontu (z pokoju)
  let az = 52, el = 16, fov = 26, k = 1.3;
  if(kind === 'top'){ az = 0; el = 2; fov = 24; k = 1.2; }
  if(kind === 'front'){ az = 72; el = 20; fov = 26; k = 1.35; }
  if(kind === 'detail'){ az = 38; el = 26; fov = 24; k = 0.62; target = new THREE.Vector3(o.spec.off[0], o.spec.off[1], (B.z0 + B.z1)/2); }
  P.camera.fov = fov;
  const dist = rad / Math.sin(fov*Math.PI/360) * k, A = az*Math.PI/180, E = el*Math.PI/180;
  P.camera.position.set(target.x + Math.sin(A)*Math.cos(E)*dist, target.y + Math.sin(E)*dist, target.z + Math.cos(A)*Math.cos(E)*dist);
  P.camera.near = Math.max(1, dist*0.05); P.camera.far = dist*30; P.camera.updateProjectionMatrix();
  if(P.controls){ P.controls.target.copy(target); P.controls.update(); } else P.camera.lookAt(target);
  presAO(); pres.dirty = true;
}
function presAO(){
  const P = pres.P; if(!P.ssao) return;
  const dist = P.camera.position.distanceTo(P.controls ? P.controls.target : new THREE.Vector3());
  P.ssao.kernelRadius = Math.max(6, dist*0.03); P.ssao.minDistance = 0.0015; P.ssao.maxDistance = 0.05;
}
function presRender(){
  const P = pres.P, tr = pres.bg === 'transparent';
  if(pres.ao && P.composer && !tr) P.composer.render(); else P.renderer.render(P.scene, P.camera);
}
// render tylko gdy coś się zmieniło (ruch kamery, ustawienia) — oszczędza kartę graficzną
function presLoop(){
  if(!pres.open) return;
  const moved = pres.P.controls ? pres.P.controls.update() : false;
  if(moved || pres.dirty){ pres.dirty = false; presRender(); }
  requestAnimationFrame(presLoop);
}
const presDirty = () => { pres.dirty = true; };
function presWm(){ $('#presWm').textContent = pres.wm; }
// ustawienia panelu zależne od tego, co fotografujemy
const PRES_UI = {
  layout:{env:'Szuflada', shots:{hero:'Pod kątem', top:'Z góry', front:'Z przodu', detail:'Detal'},
    opts:[['oak','Dąb naturalny'],['walnut','Orzech'],['white','Biały laminat'],['anthracite','Antracyt'],['none','Bez szuflady (same moduły)']]},
  single:{env:'Grzejnik', shots:{hero:'Pod kątem', top:'Z boku', front:'Z przodu', detail:'Zatrzask'},
    opts:[['white','Biały'],['anthracite','Antracyt'],['chrome','Chrom'],['none','Bez grzejnika (sam wieszak)']]},
};
function presUi(){
  const u = PRES_UI[pres.subj];
  $('#pEnvLbl').textContent = u.env;
  $('#pDrawer').innerHTML = u.opts.map(([v,n]) => `<option value="${v}">${n}</option>`).join('');
  document.querySelectorAll('#pShot button').forEach(b => b.textContent = u.shots[b.dataset.v]);
  $('#pDrawer').value = isOne() ? pres.rad : pres.drawer;
}
function openPres(subj = 'layout'){
  if(subj === 'layout' && (!state.drawer || !state.items.length)){ toast('Ułóż najpierw moduły w szufladzie.'); return; }
  if(subj === 'single'){
    pres.one = presData(); if(!pres.one){ toast('Popraw parametry modelu.'); return; }
    // dopóki nie wybrano grzejnika ręcznie: jasny wieszak na antracytowym, ciemny na białym (kontrast na zdjęciu)
    if(!pres.radSet){ const c = new THREE.Color(pres.one.color); pres.rad = (0.2126*c.r + 0.7152*c.g + 0.0722*c.b) > 0.55 ? 'anthracite' : 'white'; }
  }
  // każdy rodzaj ma własne ujęcie i światło — przełączanie nie psuje ustawień drugiego
  if(pres.subj !== subj){
    pres.keep[pres.subj] = {shot:pres.shot, la:pres.la, le:pres.le};
    Object.assign(pres, pres.keep[subj] || (subj === 'single' ? {shot:'hero', la:55, le:40} : {shot:'hero', la:35, le:55}));
    pres.subj = subj;
  }
  $('#presOv').hidden = false; pres.open = true;
  if(!presInit()){ $('#presOv').hidden = true; pres.open = false; return; }
  presUi(); $('#pBg').value = pres.bg; $('#pLightA').value = pres.la; $('#pLightE').value = pres.le;
  $('#pLayers').checked = pres.layers; $('#pAO').checked = pres.ao; $('#pSize').value = pres.size; $('#pWm').value = pres.wm;
  $('#pAO').disabled = !pres.P.composer;
  presLayout(); presBuild(); presShot(pres.shot); presWm(); presInfo(); presLoop();
}
function closePres(){ pres.open = false; $('#presOv').hidden = true; if(isOne()) refreshSingle(); else if(view === '3d') rebuild3d(); }
function presInfo(){
  const {w, h} = presAspect(), cols = new Set();
  if(isOne()){ $('#pInfo').textContent = `Zdjęcie ${w} × ${h} px, renderowane z podwójną rozdzielczością i zmniejszane, żeby krawędzie były gładkie. Kolor: ${rosaName(pres.one.color) || 'własny kolor'}.`; return; }
  state.items.forEach(i => { const t = tpl(i.tid); cols.add(rosaName(state.settings.uniOn ? state.settings.uniColor : t.color) || 'własny kolor'); });
  if(state.settings.tone2On) cols.add((rosaName(state.settings.tone2Color) || 'własny kolor') + ' (pas)');
  $('#pInfo').textContent = `Zdjęcie ${w} × ${h} px, renderowane z podwójną rozdzielczością i zmniejszane, żeby krawędzie były gładkie. Kolory: ${[...cols].join(', ')}.`;
}
async function presSnapshot(){
  const P = pres.P, {w, h} = presAspect(), btn = $('#pShoot');
  btn.disabled = true; $('#presBusy').hidden = false;
  await new Promise(r => setTimeout(r, 30));
  try{
    const maxTex = P.renderer.capabilities.maxTextureSize || 8192, ss = Math.max(1, Math.min(2, Math.floor(maxTex / Math.max(w, h))));
    const pr0 = P.renderer.getPixelRatio(), size0 = P.renderer.getSize(new THREE.Vector2());
    presSetSize(w*ss, h*ss, 1);
    if(P.ssao) P.ssao.kernelRadius *= 1;
    presRender();
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const cx = out.getContext('2d'); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
    cx.drawImage(P.renderer.domElement, 0, 0, w*ss, h*ss, 0, 0, w, h);
    if(pres.wm){
      const fs = Math.round(Math.min(w, h)*0.032), dark = pres.bg === '#2A2C2E';
      cx.font = `600 ${fs}px "Bricolage Grotesque", "Segoe UI", sans-serif`; cx.textAlign = 'right'; cx.textBaseline = 'bottom';
      cx.fillStyle = dark ? 'rgba(255,255,255,.85)' : 'rgba(27,33,30,.78)'; cx.fillText(pres.wm, w - Math.round(w*0.03), h - Math.round(h*0.03));
    }
    presSetSize(size0.x, size0.y, pr0); presRender();
    const blob = await new Promise(r => out.toBlob(r, 'image/png'));
    const D = state.drawer, name = isOne() ? `zdjecie_${pres.one.file}_${pres.shot}_${w}x${h}.png` : `zdjecie_organizer_${D.w}x${D.d}_${pres.shot}_${w}x${h}.png`;
    await offer(name, blob, true);
  }catch(e){ toast('Nie udało się wykonać zdjęcia: ' + (e && e.message || e)); presLayout(); }
  finally{ btn.disabled = false; $('#presBusy').hidden = true; }
}
$('#presBtn').onclick = () => openPres('layout');
$('#sgShoot').onclick = () => openPres('single');
$('#presClose').onclick = closePres;
document.addEventListener('keydown', e => { if(pres.open && e.key === 'Escape') closePres(); });
$('#pShot').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if(b) presShot(b.dataset.v); });
$('#pDrawer').addEventListener('change', e => { if(isOne()){ pres.rad = e.target.value; pres.radSet = true; } else pres.drawer = e.target.value; presBuild(); presShot(pres.shot); });
$('#pBg').addEventListener('change', e => { pres.bg = e.target.value; presBuild(); });
$('#pLightA').addEventListener('input', e => { pres.la = +e.target.value; presLight(); });
$('#pLightE').addEventListener('input', e => { pres.le = +e.target.value; presLight(); });
$('#pLayers').addEventListener('change', e => { pres.layers = e.target.checked; presBuild(); });
$('#pAO').addEventListener('change', e => { pres.ao = e.target.checked; presBg(); pres.dirty = true; });
$('#pSize').addEventListener('change', e => { pres.size = e.target.value; presLayout(); presInfo(); });
$('#pWm').addEventListener('input', e => { pres.wm = e.target.value.trim(); presWm(); });
$('#pShoot').onclick = presSnapshot;

/* ---------- toast ---------- */
let toastT;
function toast(m){ const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3600); }

/* ---------- start ---------- */
/* ---------- modele: przełączanie między układem w szufladzie a pojedynczym modelem ---------- */
function costOf(vol, qty){
  const c = state.settings.cost, w = 1 + (c.waste||0)/100;
  const grams = vol/1000*dens()*w*qty, hours = vol/FLOW/3600*w*qty;
  return {grams, hours, fil: grams/1000*(c.price||0), el: hours*(c.watt||0)/1000*(c.kwh||0), mat: c.mat};
}
function applyModel(id){
  const single = getModel(id).kind !== 'layout';
  if(single && view === '3d') setView('2d');
  document.body.classList.toggle('single-mode', single);
  $('.main').hidden = single; $('#singleView').hidden = !single;
  if(single){ document.querySelectorAll('.overlay').forEach(o => o.hidden = true); showSingle(); }
  else { refresh(); if(!state.drawer) openDrawer(); }
}
mountSingle({offer, toast, helperOk: () => helper.ok, sendBlob, cost: costOf, bed: () => state.settings.bed});
renderModelTabs(applyModel);

load(); bindSettings(); getDl(); refresh();
{ const o = $('#orderNo'), x = $('#orderClr'), sync = () => { x.hidden = !o.value; o.closest('.orderchip').classList.toggle('on', !!orderNo()); };
  o.addEventListener('input', sync); o.addEventListener('keydown', e => { if(e.key === 'Enter') o.blur(); });
  x.onclick = () => { o.value = ''; sync(); o.focus(); }; sync(); }
if(!inClaude){ pingHelper(); if(!desktop.on) setInterval(pingHelper, 8000); }
/* ---------- aktualizacje (aplikacja na PC) ---------- */
// Przy starcie aplikacja sprawdza GitHub Releases; nowa wersja = pasek „Zainstaluj teraz”.
// Kliknięcie numeru wersji w nagłówku sprawdza ponownie na żądanie.
async function checkUpdate(manual){
  const vb = $('#appVer');
  try{
    const u = await desktop.checkUpdate();
    if(!u){ if(manual) toast('Masz najnowszą wersję.'); return; }
    vb.textContent = `v${u.current} → v${u.version}`; vb.classList.add('new');
    $('#updTitle').textContent = `Dostępna wersja ${u.version}`;
    $('#updNotes').textContent = u.notes ? '— ' + String(u.notes).split('\n')[0].slice(0, 120) : '';
    $('#updBar').hidden = false;
  }catch(e){ if(manual) toast('Nie udało się sprawdzić aktualizacji: ' + e); }
}
if(desktop.on){
  const vb = $('#appVer'); vb.hidden = false;
  desktop.version().then(v => {
    if(!vb.classList.contains('new')) vb.textContent = 'v' + v;
    // po aktualizacji: krótka informacja, że nowa wersja działa
    let prev = ''; try{ prev = localStorage.getItem('konfigurator-wersja') || ''; localStorage.setItem('konfigurator-wersja', v); }catch(e){}
    if(prev && prev !== v) setTimeout(() => toast(`Zaktualizowano do wersji ${v}.`), 800);
  }).catch(() => {});
  vb.onclick = () => checkUpdate(true);
  $('#updLater').onclick = () => { $('#updBar').hidden = true; };
  $('#updGo').onclick = async () => {
    const b = $('#updGo'); b.disabled = true; b.textContent = 'Pobieram…'; $('#updLater').hidden = true;
    try{ await desktop.installUpdate(); }
    catch(e){ toast('Aktualizacja nie powiodła się: ' + e); b.disabled = false; b.textContent = 'Spróbuj ponownie'; $('#updLater').hidden = false; }
  };
  setTimeout(() => checkUpdate(false), 2500);
}
if(desktop.on){ document.body.classList.add('desktop'); const jb = $('#jobsBtn'); if(jb){ jb.hidden = false; jb.onclick = () => desktop.openFolder().catch(e => toast('Nie udało się otworzyć folderu: ' + e)); } }
if(getModel(activeModel()).kind !== 'layout') applyModel(activeModel());
else if(!state.drawer) openDrawer();
else { let v = '2d'; try{ v = localStorage.getItem(KEY+'-view') || '2d'; }catch(e){} setView(v); }
