// Testy automatycznego wypełniania: każdy obszar musi być pokryty w 100%, bez nakładania i bez modułów < 20 mm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tileRect, freeRects, absorbThin, mulberry, MINSZ } from '../build/js/layout/autofill.js';

const SIZES = [[50, 50], [50, 150], [100, 100], [100, 250], [150, 100]]
  .flatMap(([w, d], i) => [{ tid: 'p' + (i + 1), rot: 0, w, d }, { tid: 'p' + (i + 1), rot: 1, w: d, d: w }]);

function check(R, cells) {
  let area = 0;
  for (const c of cells) {
    const b = c.box; area += b.w * b.d;
    assert.ok(b.w >= MINSZ - 1e-9 && b.d >= MINSZ - 1e-9, `moduł ${b.w}×${b.d} < ${MINSZ} mm`);
    assert.ok(b.x >= R.x - 1e-9 && b.y >= R.y - 1e-9 && b.x + b.w <= R.x + R.w + 1e-9 && b.y + b.d <= R.y + R.d + 1e-9, 'poza obszarem');
  }
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const a = cells[i].box, b = cells[j].box;
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
    assert.ok(!(ox > 0.01 && oy > 0.01), 'moduły nachodzą na siebie');
  }
  assert.ok(Math.abs(area - R.w * R.d) < 1e-6, `pokrycie ${(area / (R.w * R.d) * 100).toFixed(3)}%`);
}

for (const [w, d] of [[400, 480], [413, 487.5], [600, 520], [310, 95], [20, 20], [255.5, 61], [999, 1001]]) {
  for (const strat of ['mix', 'big', 'small']) {
    test(`obszar ${w}×${d} mm, strategia ${strat}: 100% bez nakładania`, () => {
      const R = { x: 0, y: 0, w, d };
      check(R, tileRect(R, SIZES, strat, mulberry(7)).cells);
    });
  }
}

test('wolne miejsce wokół ułożonych modułów: wąskie szczeliny dołączane do sąsiadów', () => {
  const R = { x: 0, y: 0, w: 410, d: 480 };
  const kept = [{ box: { x: 0, y: 0, w: 400, d: 100 }, changed: false }, { box: { x: 0, y: 100, w: 100, d: 250 }, changed: false }];
  const rects = absorbThin(freeRects(R, kept.map(k => k.box)), kept);
  assert.equal(rects.filter(r => r._stuck).length, 0);
  const cells = rects.flatMap(r => tileRect(r, SIZES, 'mix', mulberry(3)).cells);
  const keptArea = kept.reduce((a, k) => a + k.box.w * k.box.d, 0);
  const area = cells.reduce((a, c) => a + c.box.w * c.box.d, 0);
  assert.ok(Math.abs(area + keptArea - R.w * R.d) < 1e-6);
  assert.ok(kept.some(k => k.changed), 'szczelina 10 mm powinna poszerzyć ułożony moduł');
});
