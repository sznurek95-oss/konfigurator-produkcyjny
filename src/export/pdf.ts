// @ts-nocheck — przeniesione 1:1; strony rysowane na canvas zapisujemy jako PDF ze zdjęciami JPEG.
export function jpegBytes(canvas){ const b64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1], bin = atob(b64), u = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i] = bin.charCodeAt(i); return u; }
export function buildPdf(pages, title){
  const enc = new TextEncoder(), chunks = [], offs = []; let len = 0;
  const push = d => { const u = typeof d === 'string' ? enc.encode(d) : d; chunks.push(u); len += u.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'.replace(/[\u0080-ÿ]/g,'A'));
  const n = pages.length, kids = pages.map((_, i) => `${3 + i*3} 0 R`).join(' ');
  const hexTitle = 'FEFF' + [...title].map(ch => ch.charCodeAt(0).toString(16).padStart(4,'0')).join('');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`));
  pages.forEach((pg, i) => {
    const pn = 3 + i*3, W = (pg.w/25.4*72).toFixed(2), H = (pg.h/25.4*72).toFixed(2), img = jpegBytes(pg.c);
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(pn, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${pn+2} 0 R >> >> /Contents ${pn+1} 0 R >>`));
    obj(pn+1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(pn+2, () => { push(`<< /Type /XObject /Subtype /Image /Width ${pg.c.width} /Height ${pg.c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`); push(img); push('\nendstream'); });
  });
  const info = 3 + n*3;
  obj(info, () => push(`<< /Title <${hexTitle}> /Producer (Konfigurator szuflady) >>`));
  const xref = len;
  let x = `xref\n0 ${info+1}\n0000000000 65535 f \n`;
  for(let i=1;i<=info;i++) x += String(offs[i]).padStart(10,'0') + ' 00000 n \n';
  push(x + `trailer\n<< /Size ${info+1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, {type:'application/pdf'});
}
