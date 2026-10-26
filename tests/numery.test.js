// Numery pozycji wytłoczone w dnie modułu (A1, B3…): czcionka bez styków po skosie, bryła szczelna.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GLYPHS, ROW_LETTERS, textRuns } from '../build/js/geometry/text.js';
import { getModel } from '../build/js/core/model.js';
import '../build/js/models/index.js';
import { badEdges } from '../build/js/geometry/heightmesh.js';

const model = getModel('wklad-szuflada');

test('każdy znak czcionki: żadnych pikseli stykających się tylko narożnikiem', () => {
  for (const [ch, rows] of Object.entries(GLYPHS)) {
    const at = (r, c) => (rows[r] || '')[c] === '#';
    for (let r = 0; r + 1 < rows.length; r++) for (let c = 0; c + 1 < rows[0].length; c++) {
      const a = at(r, c), b = at(r, c + 1), d = at(r + 1, c), e = at(r + 1, c + 1);
      assert.ok(!((a && e && !b && !d) || (b && d && !a && !e)), `znak „${ch}”, wiersz ${r}, kolumna ${c}`);
    }
    assert.ok(rows.every(rw => rw.length === rows[0].length), `znak „${ch}”: równa szerokość wierszy`);
  }
});

test('litery rzędów mają znaki w czcionce i nie ma wśród nich I, O ani liter z ukosami', () => {
  for (const ch of ROW_LETTERS) assert.ok(GLYPHS[ch], ch);
  for (const ch of 'IOKNQVWXYZ') assert.ok(!ROW_LETTERS.includes(ch), ch);
  assert.ok(textRuns('B12 100x100').runs.length > 20);
});

test('napis z numerem pozycji: szczelna bryła dla typowych modułów', () => {
  const sizes = [[50, 50, 1, 1], [50, 150, 1, 1], [100, 100, 2, 2], [100, 250, 3, 1], [150, 100, 3, 2], [244.5, 238, 1, 1], [58.6, 241, 1, 1]];
  for (const [w, d, nx, ny] of sizes) for (const code of ['A1', 'B12', 'M3', 'AA7']) for (const label of [true, false]) {
    const v = model.withDefaults({ id: 'x', name: 't', w, d, nx, ny, color: '#888888' });
    const g = model.spec(v, { drawerH: 70, tol: 0.5, label, code });
    assert.ok(g.engrave && g.engrave.length, `${w}×${d} ${code}: brak napisu`);
    const mesh = model.mesh(g);
    assert.equal(badEdges(mesh), 0, `${w}×${d} ${code} (wymiar ${label}): nieszczelna bryła`);
  }
});

test('bez numeru pozycji napis jest taki sam jak wcześniej (pliki do druku bez zmian)', () => {
  const v = model.withDefaults({ id: 'x', name: 't', w: 100, d: 100, nx: 2, ny: 2, color: '#888888' });
  const a = model.spec(v, { drawerH: 70, tol: 0.5, label: true });
  const b = model.spec(v, { drawerH: 70, tol: 0.5, label: true, code: undefined });
  assert.deepEqual(a.engrave, b.engrave);
  assert.equal(model.spec(v, { drawerH: 70, tol: 0.5, label: false }).engrave, undefined);
});
