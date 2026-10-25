// Testy gotowych układów szuflad kuchennych: pełne pokrycie, rozmiary modułów, wymiary przegródek.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KITS, buildKit, alloc, lanesW, WALL } from '../build/js/layout/gotowe.js';
import { getModel } from '../build/js/core/model.js';
import { presetFull } from '../build/js/models/wklad-szuflada.js';
import '../build/js/models/index.js';

const model = getModel('wklad-szuflada');
const WS = [189, 289, 339, 389, 413.3, 489, 689, 789, 889];
const DS = [270, 300, 380, 426, 476, 526, 576, 700];
const HS = [35, 45, 60, 83, 120, 185, 230, 260, 320];
const BEDS = [256, 350];
const near = (a, b, e = 0.06) => Math.abs(a - b) <= e;

function check(res, dim, bed, tag) {
  const cap = Math.floor(bed - 6), all = [...res.cells, ...res.gaps];
  let area = 0;
  for (const c of all) {
    area += c.w * c.d;
    assert.ok(c.x >= -0.01 && c.y >= -0.01 && c.x + c.w <= dim.W + 0.06 && c.y + c.d <= dim.D + 0.06, `${tag}: poza szufladą ${JSON.stringify(c)}`);
    assert.ok(c.w >= 19.99 && c.d >= 19.99, `${tag}: za mały moduł ${c.w}×${c.d} (${c.label})`);
  }
  for (const c of res.cells) {
    assert.ok(c.w <= cap + 0.06 && c.d <= cap + 0.06, `${tag}: moduł większy niż stół ${c.w}×${c.d} (${c.label}), cap ${cap}`);
    const v = presetFull({ id: 'x', name: c.label, w: c.w, d: c.d, nx: c.nx, ny: c.ny, divPct: c.divPct, hAuto: true });
    assert.equal(model.validate(v), '', `${tag}: ${c.label} ${c.w}×${c.d} ${c.nx}×${c.ny} — ${model.validate(v)}`);
  }
  assert.ok(near(area, dim.W * dim.D, 0.5 + dim.W * 0.002), `${tag}: pole ${area} ≠ ${dim.W * dim.D}`);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j], ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
    assert.ok(!(ox > 0.06 && oy > 0.06), `${tag}: nakładanie ${a.label} / ${b.label}`);
  }
}

test('każdy układ w każdej szufladzie: albo czytelny powód odmowy, albo 100% pokrycia', () => {
  let ok = 0, refused = 0;
  for (const kit of KITS) for (const W of WS) for (const D of DS) for (const H of HS) for (const bed of BEDS) {
    const dim = { W, D, H }, res = buildKit(kit, dim, bed), tag = `${kit.id} ${W}×${D}×${H} stół ${bed}`;
    const fits = W >= kit.need.W && D >= kit.need.D && H >= kit.need.H && !(kit.minCap && bed - 6 < kit.minCap);
    assert.equal(res.ok, fits, `${tag}: ok=${res.ok}, a powinno być ${fits}`);
    if (!res.ok) { assert.ok(res.reason && res.reason.length > 10, tag); refused++; continue; }
    check(res, dim, bed, tag); ok++;
  }
  assert.ok(ok > 1500 && refused > 200, `ok ${ok}, odmów ${refused}`);
});

test('losowe wymiary: zawsze szczelne pokrycie', () => {
  let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let n = 0; n < 1500; n++) {
    const kit = KITS[Math.floor(rnd() * KITS.length)];
    const dim = { W: Math.round((kit.need.W + rnd() * 800) * 10) / 10, D: Math.round((kit.need.D + rnd() * 400) * 10) / 10, H: Math.round((kit.need.H + rnd() * 280) * 10) / 10 };
    const bed = [220, 256, 300, 350][Math.floor(rnd() * 4)];
    const res = buildKit(kit, dim, bed);
    if (kit.minCap && bed - 6 < kit.minCap) { assert.ok(!res.ok && res.reason.includes('stół'), res.reason); continue; }
    assert.ok(res.ok, `${kit.id} ${JSON.stringify(dim)}: ${res.reason}`);
    check(res, dim, bed, `${kit.id} ${JSON.stringify(dim)} stół ${bed}`);
  }
});

test('alloc: stałe, elastyczne, ograniczenia, części opcjonalne', () => {
  const sum = a => a.reduce((x, y) => x + y, 0);
  assert.deepEqual(alloc(100, [{ fix: 30 }, { fr: 1 }, { fr: 1 }]).map(Math.round), [30, 35, 35]);
  const lim = alloc(300, [{ fr: 1, max: 50 }, { fr: 1 }]);
  assert.ok(near(lim[0], 50) && near(lim[1], 250));
  const drop = alloc(100, [{ fix: 80 }, { fix: 60, opt: true }]);
  assert.ok(drop[1] === 0 && near(drop[0], 100), JSON.stringify(drop));
  const shrink = alloc(100, [{ fix: 80 }, { fix: 80 }]);
  assert.ok(near(sum(shrink), 100) && near(shrink[0], 50));
  const mins = alloc(100, [{ fix: 90 }, { fr: 1, min: 30 }]);
  assert.ok(mins[1] >= 29.99 && near(sum(mins), 100));
});

test('sztućce: przegródki 50–70 mm, nóż mieści się w rzędzie stołowym', () => {
  for (const W of [189, 289, 339, 389, 413.3, 489, 689, 889]) for (const D of [380, 426, 476, 526]) {
    const res = buildKit(KITS.find(k => k.id === 'sztucce'), { W, D, H: 70 }, 256);
    const lanes = res.cells.filter(c => c.zone === 'cutlery');
    assert.ok(lanes.length > 0);
    for (const c of lanes) {
      const lane = (c.w - (c.nx + 1) * WALL) / c.nx;
      assert.ok(lane >= 50 && lane <= 72, `${W}×${D}: przegródka ${lane.toFixed(1)} mm`);
      assert.ok(c.d - 2 * WALL >= 232, `${W}×${D}: rząd za krótki ${c.d}`);
      assert.equal(c.hMax, 45);
    }
    for (const c of res.cells.filter(c => c.zone === 'short')) {
      assert.ok(c.d - 2 * WALL >= 145, `${W}×${D}: rząd łyżeczek za płytki ${c.d}`);
      if (c.label.includes('deserowe')) assert.ok(c.d - 2 * WALL >= 190, `${W}×${D}: deserowe w ${c.d}`);
    }
    // liczba przegródek na szerokość: 3–6 w jednym rzędzie
    const total = lanes.reduce((a, c) => a + c.nx, 0);
    assert.ok(total >= 3 && total <= 6, `${W}: ${total} przegródek`);
  }
});

test('szerokość 339 i 489: 5 oraz 6 przegródek na sztućce, kolumna obok na drobiazgi', () => {
  const kit = KITS.find(k => k.id === 'sztucce');
  const lanesOf = r => r.cells.filter(c => c.zone === 'cutlery').reduce((a, c) => a + c.nx, 0);
  assert.equal(lanesOf(buildKit(kit, { W: 339, D: 476, H: 70 }, 256)), 5);
  const wide = buildKit(kit, { W: 489, D: 476, H: 70 }, 256);
  assert.equal(lanesOf(wide), 6);
  assert.ok(wide.cells.some(c => c.zone === 'small' && c.x > 350));
});

test('sztućce: rzędu noży nie wolno ciąć — za mały stół daje czytelną odmowę', () => {
  const r = buildKit(KITS.find(k => k.id === 'sztucce'), { W: 400, D: 480, H: 70 }, 220);
  assert.ok(!r.ok && /stół/.test(r.reason));
  for (const D of [270, 300, 380, 394, 395, 426, 444, 445, 476, 526, 700]) {
    const res = buildKit(KITS.find(k => k.id === 'sztucce'), { W: 400, D, H: 70 }, 256);
    for (const c of res.cells) assert.ok(c.d - 2 * WALL >= 36.79, `${D}: ${c.label} ${c.d}`);
  }
});

test('przyprawy: stojące gdy ≥ 120 mm, przegródki nie węższe niż 54 mm', () => {
  const kit = KITS.find(k => k.id === 'przyprawy');
  for (const W of [189, 339, 489, 889]) for (const D of [380, 476]) {
    const up = buildKit(kit, { W, D, H: 120 }, 256), lie = buildKit(kit, { W, D, H: 119 }, 256);
    for (const c of up.cells.filter(c => c.label === 'Przyprawy stojące')) {
      assert.ok((c.w - (c.nx + 1) * WALL) / c.nx >= 53.99 && (c.d - (c.ny + 1) * WALL) / c.ny >= 53.99, `${W}×${D}: ${c.w}×${c.d} ${c.nx}×${c.ny}`);
    }
    assert.ok(up.cells.some(c => c.label === 'Przyprawy stojące'));
    assert.ok(lie.cells.length > 0 && lie.cells.every(c => c.label === 'Przyprawy leżące'));
    for (const c of lie.cells) assert.ok((c.d - (c.ny + 1) * WALL) / c.ny >= 119.99 && (c.w - (c.nx + 1) * WALL) / c.nx >= 53.99, `leżące ${c.w}×${c.d} ${c.nx}×${c.ny}`);
  }
});

test('zapasy: komórki na puszki ≥ 80 mm i słoiki ≥ 95 mm', () => {
  const kit = KITS.find(k => k.id === 'zapasy');
  for (const W of [289, 339, 489, 889]) for (const D of [380, 476, 576]) {
    for (const c of buildKit(kit, { W, D, H: 150 }, 256).cells) {
      const need = c.label.startsWith('Puszki') ? 80 : 95;
      assert.ok((c.w - (c.nx + 1) * WALL) / c.nx >= need - 0.01 && (c.d - (c.ny + 1) * WALL) / c.ny >= need - 0.01, `${W}×${D} ${c.label} ${c.w}×${c.d} ${c.nx}×${c.ny}`);
    }
  }
});

test('talerze: stojaki dopiero gdy szuflada wyższa niż talerz, stos wolny przy stole 256 mm, moduł przy stole ≥ 300', () => {
  const kit = KITS.find(k => k.id === 'talerze');
  assert.ok(!buildKit(kit, { W: 489, D: 476, H: 260 }, 256).cells.some(c => c.zone === 'plates'), 'talerz 27 cm nie stoi w szufladzie 260 mm');
  for (const W of [400, 489, 689, 889]) for (const D of [400, 476, 526]) {
    const racks = buildKit(kit, { W, D, H: 290 }, 256);
    assert.ok(racks.cells.some(c => c.label === 'Talerze obiadowe' && c.nx === 7), `${W}×${D}`);
    assert.equal(racks.gaps.length, 0);
    for (const c of racks.cells.filter(c => c.zone === 'plates')) {
      assert.ok(c.d - 2 * WALL >= 240 && (c.w - (c.nx + 1) * WALL) / c.nx >= 25.99 && c.hMax === 60, `${W}×${D} ${c.label} ${c.w}×${c.d}`);
    }
  }
  const flat = buildKit(kit, { W: 489, D: 476, H: 120 }, 256);
  assert.equal(flat.gaps.length, 1);
  assert.ok(flat.gaps[0].w >= 289.9 && flat.gaps[0].d >= 289.9);
  assert.ok(flat.notes.some(n => n.includes('Wolne miejsce')));
  const big = buildKit(kit, { W: 489, D: 476, H: 120 }, 350);
  assert.equal(big.gaps.length, 0);
  assert.ok(big.cells.some(c => c.label.startsWith('Talerze obiadowe') && c.w >= 289.9));
  // kubek z uchem: przegródka 95 × 125 w jednej z orientacji
  for (const c of flat.cells.filter(c => c.label.startsWith('Kubki'))) {
    const a = (c.w - (c.nx + 1) * WALL) / c.nx, b = (c.d - (c.ny + 1) * WALL) / c.ny;
    assert.ok(Math.min(a, b) >= 94.99 && Math.max(a, b) >= 124.99, `${c.w}×${c.d} ${c.nx}×${c.ny}`);
  }
});

test('nazwa z ⌀ odpowiada rzeczywistemu wnętrzu przegródki', () => {
  for (const kit of KITS) for (const W of [400, 489, 889]) for (const D of [400, 476, 526]) for (const H of [120, 260, 300]) {
    const r = buildKit(kit, { W, D, H }, 256); if (!r.ok) continue;
    for (const c of r.cells) {
      assert.ok(!c.label.includes('{d}'), c.label);
      const m = c.label.match(/⌀ do (\d+) cm/); if (!m || c.zone === 'lids' || c.label.startsWith('Patelnie ⌀') && c.nx > 1) continue;
      const inner = Math.min((c.w - (c.nx + 1) * WALL) / c.nx, (c.d - (c.ny + 1) * WALL) / c.ny);
      assert.ok(+m[1] * 10 <= inner + 0.01, `${kit.id} ${W}×${D}×${H}: ${c.label} w ${inner.toFixed(1)} mm`);
    }
  }
});

test('garnki: stojaki na pokrywki i patelnie tylko w wysokiej szufladzie, strefy z niskimi ściankami', () => {
  const kit = KITS.find(k => k.id === 'garnki');
  const high = buildKit(kit, { W: 489, D: 476, H: 260 }, 256), low = buildKit(kit, { W: 489, D: 476, H: 240 }, 256);
  const lids = high.cells.find(c => c.zone === 'lids'), pans = high.cells.find(c => c.label.startsWith('Patelnie') && c.nx === 3);
  assert.ok(lids && lids.nx === 5 && lids.label === 'Pokrywki ⌀ do 25 cm' && pans);
  assert.ok((lids.w - 6 * WALL) / 5 >= 44.99 && (pans.w - 4 * WALL) / 3 >= 59.99 && lids.d - 2 * WALL >= 240 && lids.hMax === 60);
  assert.ok(!low.cells.some(c => c.zone === 'lids'));
  assert.ok(low.cells.length >= 4 && low.cells.every(c => c.w <= 250 && c.d <= 250 && c.hMax === 40));
  assert.ok(low.cells.some(c => c.label === 'Garnki ⌀ do 23 cm'), low.cells.map(c => c.label).join());
});

test('szerokości lanesW zgodne z modułami z biblioteki', () => {
  assert.equal(lanesW(5, 58), 299.6);
  assert.equal(lanesW(4, 64), 264);
});

test('przybory i drobiazgi: długie rzeczy mają pełną długość', () => {
  for (const W of [190, 289, 389, 489]) for (const D of [300, 380, 476, 526]) {
    const p = buildKit(KITS.find(k => k.id === 'przybory'), { W, D, H: 70 }, 256);
    // korytka na długie przybory: jedna linia od tyłu do frontu (moduły jeden za drugim, te same x)
    const long = p.cells.filter(c => c.label === 'Przybory długie');
    const xs = new Set(long.map(c => c.x + '|' + c.w));
    for (const k of xs) { const col = long.filter(c => c.x + '|' + c.w === k); assert.ok(Math.abs(col.reduce((a, c) => a + c.d, 0) - D) < 0.06, `${W}×${D} kolumna ${k}`); }
    const d = buildKit(KITS.find(k => k.id === 'drobiazgi'), { W, D, H: 50 }, 256);
    if (!d.ok) { assert.ok(W < 200); continue; }
    const sc = d.cells.filter(c => c.label.startsWith('Nożyczki')), depth = Math.max(...sc.map(c => c.y + c.d)) - Math.min(...sc.map(c => c.y));
    assert.ok(depth >= 205, `${W}×${D}: korytko na nożyczki ${depth}`);
  }
});

test('wynik deterministyczny', () => {
  for (const kit of KITS) {
    const a = buildKit(kit, { W: 489, D: 476, H: 120 }, 256), b = buildKit(kit, { W: 489, D: 476, H: 120 }, 256);
    assert.deepEqual(a, b);
  }
});
