// Czcionka blokowa do napisów na wydrukach: tylko pionowe i poziome kreski,
// bez styków po skosie, więc bryła z napisem zostaje szczelna.
export const GLYPHS: Record<string, string[]> = {
  '0': ['###', '# #', '# #', '# #', '###'], '1': ['## ', ' # ', ' # ', ' # ', '###'], '2': ['###', '  #', '###', '#  ', '###'],
  '3': ['###', '  #', '###', '  #', '###'], '4': ['# #', '# #', '###', '  #', '  #'], '5': ['###', '#  ', '###', '  #', '###'],
  '6': ['###', '#  ', '###', '# #', '###'], '7': ['###', '  #', '  #', '  #', '  #'], '8': ['###', '# #', '###', '# #', '###'],
  '9': ['###', '# #', '###', '  #', '###'], '.': [' ', ' ', ' ', ' ', '#'],
  'x': ['     ', '     ', '#   #', '## ##', ' ### ', '## ##', '#   #']
};

/** Prostokąty napisu w jednostkach piksela (x w prawo, y w dół), wysokość 5 px (znak x: 7 px w skali 5/7). */
export function textRuns(str: string): { runs: [number, number, number, number][]; w: number; h: number } {
  const runs: [number, number, number, number][] = []; let cx = 0;
  for (const ch of str) {
    const gl = GLYPHS[ch]; if (!gl) continue;
    const sc = ch === 'x' ? 5 / 7 : 1, w = gl[0].length;
    gl.forEach((row, ry) => {
      let k = 0;
      while (k < row.length) {
        if (row[k] !== '#') { k++; continue; }
        let e = k; while (e < row.length && row[e] === '#') e++;
        runs.push([cx + k * sc, ry * sc, cx + e * sc, (ry + 1) * sc]); k = e;
      }
    });
    cx += w * sc + 1;
  }
  return { runs, w: cx - 1, h: 5 };
}
