// Edytor pojedynczego modelu ('single'): formularz budowany automatycznie z opisu parametrów,
// rysunek profilu, podgląd 3D, ilość, kolor, koszt i wysyłka do druku.
// Nowy model typu 'single' działa tu bez żadnych zmian w tym pliku.
import { getModel, listModels, type ModelDef, type Variant } from '../core/model.js';
import { fmt, esc, slug } from '../core/format.js';
import { SERIES, findFil, rosaName, seriesOf } from '../materials/rosa3d.js';
import { stl } from '../export/stl.js';
import { make3mfBlob } from '../export/threemf.js';

declare const THREE: any;

export interface SingleEnv {
  offer(name: string, blob: Blob): Promise<void> | void;
  toast(msg: string): void;
  helperOk(): boolean;
  sendBlob(blob: Blob, name: string, count: number): Promise<void>;
  cost(volMm3: number, qty: number): { grams: number; hours: number; fil: number; el: number; mat: string };
  bed(): number;
}

interface ModelState { params: Variant; color: string; qty: number; saved: Variant[]; preset: string }
const KEY = 'konfigurator-modele-v1';
const $ = (s: string) => document.querySelector(s) as any;
let env: SingleEnv;
let st: { active: string; models: Record<string, ModelState> } = { active: 'wklad-szuflada', models: {} };
let view: '2d' | '3d' = '2d';
let series = 'starter';

function load() { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.models) st = s; } catch (e) { } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { } }
export const activeModel = (): string => st.active;

function ms(m: ModelDef): ModelState {
  if (!st.models[m.id]) {
    const p = m.withDefaults(m.presets[0]);
    st.models[m.id] = { params: p, color: p.color, qty: 4, saved: [], preset: p.id };
  }
  return st.models[m.id];
}

/* ---------- przełącznik modeli ---------- */
export function renderModelTabs(onSwitch: (id: string) => void) {
  const el = $('#modelTabs');
  el.innerHTML = listModels().map(m => `<button type="button" role="tab" data-m="${m.id}" aria-selected="${m.id === st.active}" title="${esc(m.description || '')}">${esc(m.name)}</button>`).join('');
  el.onclick = (e: any) => { const b = e.target.closest('[data-m]'); if (!b || b.dataset.m === st.active) return; st.active = b.dataset.m; save(); renderModelTabs(onSwitch); onSwitch(st.active); };
}

/* ---------- panel ---------- */
function current() { const m = getModel(st.active); return { m, s: ms(m) }; }

function renderForm() {
  const { m, s } = current(), v = s.params;
  const opts = [...m.presets.map(p => ({ id: p.id, name: p.name })), ...s.saved.map(p => ({ id: p.id, name: p.name + ' (mój)' }))];
  $('#sgTitle').textContent = m.name;
  $('#sgDesc').textContent = m.description || '';
  $('#sgPreset').innerHTML = opts.map(o => `<option value="${o.id}" ${o.id === s.preset ? 'selected' : ''}>${esc(o.name)}</option>`).join('') + (opts.some(o => o.id === s.preset) ? '' : '<option value="" selected>— zmieniony —</option>');
  $('#sgDelSaved').hidden = !s.saved.some(x => x.id === s.preset);
  $('#sgFields').innerHTML = Object.entries(m.params).map(([k, d]) => {
    const unit = d.type === 'mm' ? 'mm' : d.type === 'deg' ? '°' : d.type === 'pct' ? '%' : '';
    if (d.type === 'bool') return `<label class="check"><input type="checkbox" data-p="${k}" ${v[k] ? 'checked' : ''}> ${esc(d.label)}</label>`;
    return `<div class="field"><label for="sg_${k}">${esc(d.label)}${unit ? ` (${unit})` : ''}</label>
      <input id="sg_${k}" data-p="${k}" type="number" ${d.min != null ? `min="${d.min}"` : ''} ${d.max != null ? `max="${d.max}"` : ''} step="${d.step || (d.type === 'int' ? 1 : 0.5)}" value="${v[k]}">
      <span class="sg-range">${d.min != null ? `${fmt(d.min)}–${fmt(d.max as number)}${unit ? ' ' + unit : ''}` : ''}</span></div>`;
  }).join('');
  $('#sgQty').value = s.qty;
  $('#sgSeries').value = series;
  renderColors();
}

function renderColors() {
  const { s } = current(), list = SERIES[series].list;
  $('#sgSw').innerHTML = list.map(([c, n]) => `<button type="button" data-c="${c}" style="background:${c}" title="Rosa3D ${SERIES[series].name} ${n}" aria-label="Rosa3D ${SERIES[series].name} ${n}" aria-pressed="${c.toLowerCase() === s.color.toLowerCase()}"></button>`).join('');
  $('#sgColor').value = s.color;
  $('#sgColorName').textContent = rosaName(s.color) || 'własny kolor';
}

function update(full = true) {
  const { m, s } = current(), err = m.validate(s.params);
  $('#sgErr').textContent = err;
  $('#sgShoot').disabled = $('#sgStl').disabled = $('#sg3mf').disabled = !!err;
  if (err) { $('#sgStats').innerHTML = ''; return; }
  const spec = m.spec(s.params, { drawerH: null, tol: 0, label: false });
  const mesh = m.mesh(spec), H = m.height(s.params, { drawerH: null }), fp = m.footprint(s.params);
  const c = env.cost(mesh.vol, s.qty), bed = env.bed();
  const fits = Math.max(fp.w, fp.d) <= bed && H <= bed;
  $('#sgStats').innerHTML = `<div class="sg-grid">
      <span>Wymiar na stole</span><b>${fmt(fp.w)} × ${fmt(fp.d)} × ${fmt(H)} mm</b>
      <span>Masa (${s.qty} szt., ${esc(c.mat)})</span><b>${fmt(c.grams, 0)} g</b>
      <span>Szacowany czas</span><b>${fmt(c.hours, 1)} h</b>
      <span>Koszt filamentu + prądu</span><b>${(c.fil + c.el).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł</b>
    </div>
    ${fits ? '' : `<p class="warnline">Większy niż stół drukarki (${bed} mm).</p>`}
    <p class="hint" style="margin:0">${esc(m.printNote || '')}</p>`;
  $('#sgBambu').hidden = !env.helperOk();
  if (view === '2d') draw2d(m, spec); else if (full) build3d(m, spec);
}

/* ---------- rysunek profilu ---------- */
function draw2d(m: ModelDef, spec: any) {
  const o = m.outline2d ? m.outline2d(spec) : { polys: [], guides: [], dims: [] };
  const all = [...o.polys.flat(), ...(o.guides || []).flatMap(g => [[g.cx - g.r, g.cy - g.r], [g.cx + g.r, g.cy + g.r]])];
  if (!all.length) { $('#sgSvg').innerHTML = ''; return; }
  const x0 = Math.min(...all.map(p => p[0])), x1 = Math.max(...all.map(p => p[0])), y0 = Math.min(...all.map(p => p[1])), y1 = Math.max(...all.map(p => p[1]));
  const S = Math.max(x1 - x0, y1 - y0), pad = S * 0.18, fs = S / 26;
  // oś y w górę: odwracamy w SVG
  const Y = (y: number) => y1 + y0 - y;
  let s = `<defs><pattern id="sgGrid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="var(--line)" stroke-width="0.15"/></pattern></defs>`;
  s += `<rect x="${x0 - pad}" y="${y0 - pad}" width="${x1 - x0 + 2 * pad}" height="${y1 - y0 + 2 * pad}" fill="url(#sgGrid)"/>`;
  for (const g of o.guides || []) s += `<circle cx="${g.cx}" cy="${Y(g.cy)}" r="${g.r}" fill="var(--floor)" stroke="var(--wall)" stroke-width="0.6" stroke-dasharray="2 1.5"/>
      <text x="${g.cx}" y="${Y(g.cy) + fs * 0.35}" text-anchor="middle" font-size="${fs * 0.9}" fill="var(--muted)" font-family="IBM Plex Sans, sans-serif">${esc(g.label || '')} ø${fmt(g.r * 2)}</text>`;
  const { s: ms_ } = current();
  for (const p of o.polys) s += `<path d="M${p.map(q => `${q[0]} ${Y(q[1])}`).join('L')}Z" fill="${ms_.color}" fill-opacity=".9" stroke="var(--ink)" stroke-width="0.35" stroke-linejoin="round"/>`;
  for (const d of o.dims || []) s += `<g stroke="var(--muted)" stroke-width="0.3" fill="var(--muted)"><path d="M${d.x1} ${Y(d.y1)}L${d.x2} ${Y(d.y2)}M${d.x1 - 1.5} ${Y(d.y1)}H${d.x1 + 1.5}M${d.x2 - 1.5} ${Y(d.y2)}H${d.x2 + 1.5}"/>
      <text transform="translate(${d.x1 - 1.6} ${(Y(d.y1) + Y(d.y2)) / 2}) rotate(-90)" text-anchor="middle" font-size="${fs * 0.85}" stroke="none" font-family="IBM Plex Mono, monospace">${esc(d.text)}</text></g>`;
  // wymiary całkowite
  const fp = m.footprint(current().s.params);
  s += `<g fill="var(--muted)" font-family="IBM Plex Mono, monospace" font-size="${fs}"><text x="${(x0 + x1) / 2}" y="${y1 + pad * 0.7}" text-anchor="middle">${fmt(fp.w)} × ${fmt(fp.d)} mm (widok z boku)</text></g>`;
  const svg = $('#sgSvg');
  svg.setAttribute('viewBox', `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`);
  svg.innerHTML = s;
}

/* ---------- podgląd 3D ---------- */
let R3: any = null;
function init3d() {
  if (R3) return true;
  if (typeof THREE === 'undefined') return false;
  const host = $('#sgHost'), renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); host.appendChild(renderer.domElement);
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, 1, 5000);
  if (THREE.RoomEnvironment) { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture; pm.dispose(); }
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f8c, scene.environment ? 0.08 : 0.75));
  const key = new THREE.DirectionalLight(0xffffff, scene.environment ? 0.72 : 0.65); key.position.set(80, 120, 140); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = key.shadow.camera.bottom = -150; key.shadow.camera.right = key.shadow.camera.top = 150; key.shadow.bias = -0.0005;
  scene.add(key); const fill = new THREE.DirectionalLight(0xffffff, 0.12); fill.position.set(-80, 40, -60); scene.add(fill);
  const group = new THREE.Group(); scene.add(group);
  const controls = THREE.OrbitControls ? new THREE.OrbitControls(camera, renderer.domElement) : null;
  if (controls) { controls.enableDamping = true; controls.dampingFactor = 0.12; }
  R3 = { renderer, scene, camera, controls, group, host, fitted: '' };
  new ResizeObserver(() => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }).observe(host);
  const loop = () => { if (view === '3d' && !$('#singleView').hidden) { if (controls) controls.update(); renderer.render(scene, camera); } requestAnimationFrame(loop); };
  loop();
  return true;
}
function build3d(m: ModelDef, spec: any) {
  if (!init3d()) return;
  const { s } = current(), g = R3.group;
  while (g.children.length) { const c = g.children.pop(); if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }
  const mesh = m.mesh(spec), bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(mesh.pos, 3)); bg.computeVertexNormals();
  const matte = (findFil(s.color) || ({} as any)).matte;
  const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(s.color).convertSRGBToLinear(), metalness: 0, ...(matte ? { roughness: 0.9, envMapIntensity: 0.17 } : { roughness: 0.45, clearcoat: 0.12, clearcoatRoughness: 0.35, envMapIntensity: 0.14 }) });
  const obj = new THREE.Mesh(bg, mat); obj.castShadow = obj.receiveShadow = true; g.add(obj);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(bg, 25), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })); g.add(edges);
  const sc = m.scene3d ? m.scene3d(spec) : { cylinders: [] };
  const metal = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#EDEDEA').convertSRGBToLinear(), roughness: 0.35, clearcoat: 0.4, envMapIntensity: 0.4 });
  for (const c of sc.cylinders) {
    const cy = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r, c.len, 48), metal);
    cy.rotation.x = Math.PI / 2; cy.position.set(c.x, c.y, (spec.W || 0) / 2); cy.receiveShadow = cy.castShadow = true; g.add(cy);
  }
  const box = new THREE.Box3().setFromObject(obj), ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
  const key = st.active + ':' + Math.round(size);
  if (R3.fitted !== key) {
    R3.camera.position.set(ctr.x + size * 0.9, ctr.y + size * 0.35, ctr.z + size * 1.5);
    if (R3.controls) { R3.controls.target.copy(ctr); R3.controls.update(); }
    R3.fitted = key;
  }
}

/* ---------- eksport ---------- */
function fileBase() { const { m, s } = current(); return `${slug(m.name)}_${slug(s.params.name || m.labelText(s.params, { drawerH: null }, true))}`; }
function exports3mf() {
  const { m, s } = current(), spec = m.spec(s.params, { drawerH: null, tol: 0, label: false });
  return make3mfBlob([{ name: s.params.name || m.name, parts: [{ name: s.params.name || m.name, mesh: m.mesh(spec) }], size: m.footprint(s.params), qty: s.qty }], env.bed(), `${m.name} ×${s.qty}`);
}

/* ---------- start ---------- */
export function mountSingle(e: SingleEnv) {
  env = e; load();
  const firstSingle = listModels().find(x => x.kind === 'single');
  if (firstSingle) series = seriesOf(ms(getModel(getModel(st.active).kind === 'single' ? st.active : firstSingle.id)).color);
  $('#sgFields').addEventListener('input', (ev: any) => {
    const f = ev.target.closest('[data-p]'); if (!f) return;
    const { s } = current(); s.params[f.dataset.p] = f.type === 'checkbox' ? f.checked : parseFloat(String(f.value).replace(',', '.'));
    s.preset = ''; save(); renderFormHeader(); update();
  });
  $('#sgPreset').addEventListener('change', (ev: any) => {
    const { m, s } = current(), id = ev.target.value, p = [...m.presets, ...s.saved].find(x => x.id === id); if (!p) return;
    s.params = m.withDefaults(p); s.color = p.color || s.color; s.preset = id; series = seriesOf(s.color); save(); renderForm(); update();
  });
  $('#sgSave').onclick = () => {
    const { m, s } = current(), name = String($('#sgName').value || '').trim();
    if (!name) { env.toast('Wpisz nazwę wariantu.'); return; }
    const err = m.validate(s.params); if (err) { env.toast(err); return; }
    const id = 'u' + Date.now().toString(36), v = { ...JSON.parse(JSON.stringify(s.params)), id, name, color: s.color };
    s.saved.push(v); s.preset = id; s.params = { ...s.params, id, name }; save(); $('#sgName').value = ''; renderForm(); env.toast(`Zapisano wariant „${name}”.`);
  };
  $('#sgDelSaved').onclick = () => {
    const { m, s } = current(); s.saved = s.saved.filter(x => x.id !== s.preset);
    s.params = m.withDefaults(m.presets[0]); s.preset = m.presets[0].id; save(); renderForm(); update(); env.toast('Usunięto wariant.');
  };
  $('#sgQty').addEventListener('input', (ev: any) => { const n = parseInt(ev.target.value, 10); if (n > 0 && n <= 200) { current().s.qty = n; save(); update(false); } });
  $('#sgSeries').addEventListener('change', (ev: any) => { series = ev.target.value; renderColors(); });
  $('#sgSw').addEventListener('click', (ev: any) => { const b = ev.target.closest('[data-c]'); if (!b) return; current().s.color = b.dataset.c; save(); renderColors(); update(); });
  $('#sgColor').addEventListener('input', (ev: any) => { current().s.color = ev.target.value; save(); renderColors(); update(); });
  $('#sgTabs').addEventListener('click', (ev: any) => {
    const b = ev.target.closest('[data-v]'); if (!b) return; view = b.dataset.v;
    document.querySelectorAll('#sgTabs button').forEach((x: any) => x.setAttribute('aria-selected', String(x.dataset.v === view)));
    $('#sgView2d').hidden = view !== '2d'; $('#sgView3d').hidden = view !== '3d'; update();
  });
  $('#sgStl').onclick = () => {
    const { m, s } = current(), spec = m.spec(s.params, { drawerH: null, tol: 0, label: false });
    env.offer(fileBase() + '.stl', new Blob([stl(m.mesh(spec), s.params.name || m.name) as BlobPart], { type: 'model/stl' }));
  };
  $('#sg3mf').onclick = () => env.offer(`${fileBase()}_x${current().s.qty}.3mf`, exports3mf());
  $('#sgBambu').onclick = () => env.sendBlob(exports3mf(), `${fileBase()}_x${current().s.qty}.3mf`, current().s.qty);
}
function renderFormHeader() {
  const { m, s } = current(), opts = [...m.presets, ...s.saved];
  const sel = $('#sgPreset');
  if (!opts.some(o => o.id === s.preset) && !sel.querySelector('option[value=""]')) sel.insertAdjacentHTML('beforeend', '<option value="" selected>— zmieniony —</option>');
  if (!s.preset) sel.value = '';
  $('#sgDelSaved').hidden = !s.saved.some(x => x.id === s.preset);
}
/** Pokazuje edytor dla aktywnego modelu (wywołuje aplikacja po przełączeniu). */
export function showSingle() { renderForm(); update(); }
export function refreshSingle() { if (!$('#singleView').hidden) update(false); }
