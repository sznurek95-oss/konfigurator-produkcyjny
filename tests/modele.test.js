// Testy silnika modeli: każdy wariant musi dawać szczelną bryłę o rozsądnych wymiarach.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getModel, listModels } from '../build/js/core/model.js';
import '../build/js/models/index.js';
import { badEdges } from '../build/js/geometry/heightmesh.js';

const ctx = (o = {}) => ({ drawerH: 70, tol: 0.5, label: true, ...o });

test('rejestr zawiera wkład do szuflady jako model domyślny', () => {
  assert.equal(getModel().id, 'wklad-szuflada');
  assert.ok(listModels().length >= 1);
});

for (const m of listModels()) {
  for (const p of m.presets) {
    const v = m.withDefaults(p);
    test(`${m.name} / ${v.name}: parametry poprawne`, () => assert.equal(m.validate(v), ''));
    test(`${m.name} / ${v.name}: bryła szczelna (z napisem i bez)`, () => {
      for (const label of [true, false]) {
        const mesh = m.mesh(m.spec(v, ctx({ label })));
        assert.ok(mesh.pos.length > 0);
        assert.equal(badEdges(mesh), 0);
        assert.ok(mesh.vol > 0);
      }
    });
    if (m.splitHeight(v, ctx(), 5) != null) test(`${m.name} / ${v.name}: podział na dwa kolory szczelny i bez strat objętości`, () => {
      const spec = m.spec(v, ctx()), z = m.splitHeight(v, ctx(), 5);
      const full = m.mesh(spec), lo = m.mesh(spec, { at: z, part: 'lo' }), hi = m.mesh(spec, { at: z, part: 'hi' });
      assert.equal(badEdges(lo), 0); assert.equal(badEdges(hi), 0);
      assert.ok(Math.abs(full.vol - lo.vol - hi.vol) < 1e-6);
    });
  }
}

test('wkład: walidacja odrzuca za wąskie przegródki, normalizacja je naprawia', () => {
  const m = getModel('wklad-szuflada');
  const v = m.withDefaults({ id: 't', name: 't', color: '#000', w: 40, d: 40, nx: 6, ny: 1 });
  assert.match(m.validate(v), /za wąskie/);
  const fixed = m.normalize({ ...v });
  assert.equal(m.validate(fixed), '');
  assert.ok(fixed.nx < 6);
});

test('wkład: wysokość „auto” = szuflada − 3 mm', () => {
  const m = getModel('wklad-szuflada');
  const v = m.withDefaults({ id: 't', name: 't', color: '#000', w: 50, d: 50, nx: 1, ny: 1 });
  assert.equal(m.height(v, { drawerH: 70 }), 67);
  assert.equal(m.height({ ...v, hAuto: false, h: 40 }, { drawerH: 70 }), 40);
});

test('rejestr zawiera wieszak na grzejnik jako model pojedynczy', () => {
  const m = getModel('wieszak-grzejnik');
  assert.equal(m.kind, 'single');
  assert.ok(m.outline2d && m.scene3d);
});

test('wieszak: skrajne wartości parametrów dają poprawną, szczelną bryłę mieszczącą się na stole P1S', () => {
  const m = getModel('wieszak-grzejnik');
  for (const D of [12, 40]) for (const G of [8, 80]) for (const T of [3, 8]) for (const [L, alpha] of [[15, 10], [80, 75], [35, 40]]) {
    const v = m.withDefaults({ id: 't', name: 't', color: '#000', D, G, T, L, alpha });
    const err = m.validate(v);
    if (err) { assert.match(err, /nachodzi/); continue; }
    const g = m.spec(v), mesh = m.mesh(g);
    assert.equal(badEdges(mesh), 0, `D${D} G${G} T${T} L${L} a${alpha}`);
    assert.ok(g.size.w <= 256 && g.size.d <= 256, 'nie mieści się na stole');
    assert.ok(Math.abs(mesh.vol - Math.abs(require_area(g.poly)) * v.W) < 1e-3);
  }
});
function require_area(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }

test('wieszak: wewnętrzny promień zatrzasku = rurka/2 + luz (pasuje na rurkę)', () => {
  const m = getModel('wieszak-grzejnik');
  const v = m.withDefaults({ id: 't', name: 't', color: '#000', D: 22, c: 0.3 });
  const g = m.spec(v), [ox, oy] = g.off;
  const inner = Math.min(...g.poly.map(([x, y]) => Math.hypot(x - ox, y - oy)));
  assert.ok(Math.abs(inner - (22 / 2 + 0.3)) < 0.05, `promień ${inner}`);
});
