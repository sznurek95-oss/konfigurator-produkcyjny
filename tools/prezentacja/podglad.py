#!/usr/bin/env python3
"""Podgląd trybu prezentacji: renderuje komplet zdjęć produktowych i składa je w stronę do porównań.

Każde zdjęcie powstaje tak samo jak w aplikacji — przyciskiem „Zrób zdjęcie” (#pShoot) — więc to,
co widać na podglądzie, to dokładnie to, co dostaje sklep.

Użycie:
  python3 tools/build.py                                  # najpierw zbuduj stronę
  python3 tools/prezentacja/podglad.py                    # zdjęcia do build/prezentacja/po/
  python3 tools/prezentacja/podglad.py --tylko wieszak    # tylko ujęcia, których nazwa zawiera „wieszak”
  python3 tools/prezentacja/podglad.py --rozmiar 2000x2000
  python3 tools/prezentacja/podglad.py --po               # dodatkowo JPG 900×900 do docs/prezentacja/po/ (do pull requesta)

Wynik:
  build/prezentacja/po/*.png          — zdjęcia w pełnej rozdzielczości
  build/prezentacja/porownanie.html   — „przed” (docs/prezentacja/przed/*.jpg) obok „po”, z opisem ujęcia

Wymaga: Python 3, Playwright z Chromium (pip install playwright && playwright install chromium).
"""
import argparse, base64, html, os, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PAGE = 'file://' + os.path.join(ROOT, 'dist', 'konfigurator-offline.html')
BEFORE = os.path.join(ROOT, 'docs', 'prezentacja', 'przed')
AFTER_DOCS = os.path.join(ROOT, 'docs', 'prezentacja', 'po')

# Ujęcia: (nazwa pliku, opis, przedmiot, ustawienia). Przedmiot: 'uklad' (szuflada z przykładowym układem),
# 'sztucce' (gotowy układ „Sztućce”), 'wieszak' (biały wieszak), 'wieszak-czarny'.
SHOTS = [
    ('uklad-dab-katem',      'Szuflada dąb, ujęcie pod kątem (główne zdjęcie sklepu)', 'uklad',   dict(shot='hero',   env='oak')),
    ('uklad-dab-gora',       'Szuflada dąb, z góry',                                   'uklad',   dict(shot='top',    env='oak')),
    ('uklad-dab-przod',      'Szuflada dąb, z przodu',                                 'uklad',   dict(shot='front',  env='oak')),
    ('uklad-dab-detal',      'Szuflada dąb, detal (warstwy druku z bliska)',           'uklad',   dict(shot='detail', env='oak')),
    ('uklad-orzech',         'Szuflada orzech',                                        'uklad',   dict(shot='hero',   env='walnut')),
    ('uklad-bialy',          'Szuflada biały laminat',                                 'uklad',   dict(shot='hero',   env='white')),
    ('uklad-antracyt',       'Szuflada antracyt',                                      'uklad',   dict(shot='hero',   env='anthracite')),
    ('uklad-bez-szuflady',   'Same moduły, bez szuflady',                              'uklad',   dict(shot='hero',   env='none')),
    ('uklad-ciemne-tlo',     'Szuflada dąb na ciemnym tle',                            'uklad',   dict(shot='hero',   env='oak', bg='#2A2C2E')),
    ('uklad-bez-warstw',     'Szuflada dąb, bez ścieżek warstw i bez AO',              'uklad',   dict(shot='hero',   env='oak', layers=False, ao=False)),
    ('sztucce-dab-katem',    'Gotowy układ „Sztućce” w dębowej szufladzie',            'sztucce', dict(shot='hero',   env='oak')),
    ('sztucce-dab-detal',    'Gotowy układ „Sztućce”, detal',                          'sztucce', dict(shot='detail', env='oak')),
    ('wieszak-katem',        'Biały wieszak na grzejniku, pod kątem',                  'wieszak', dict(shot='hero')),
    ('wieszak-bok',          'Biały wieszak, z boku (profil)',                         'wieszak', dict(shot='top')),
    ('wieszak-przod',        'Biały wieszak, z przodu',                                'wieszak', dict(shot='front')),
    ('wieszak-zatrzask',     'Biały wieszak, detal zatrzasku',                         'wieszak', dict(shot='detail')),
    ('wieszak-chrom',        'Biały wieszak na chromowanym grzejniku',                 'wieszak', dict(shot='hero', env='chrome')),
    ('wieszak-sam',          'Sam wieszak, bez grzejnika',                             'wieszak', dict(shot='hero', env='none')),
    ('wieszak-czarny-bialy', 'Czarny wieszak na białym grzejniku',                     'wieszak-czarny', dict(shot='hero')),
]


def prepare(pg, subject):
    """Otwiera stronę od zera i ustawia przedmiot zdjęcia. Zwraca selektor przycisku trybu prezentacji."""
    pg.goto(PAGE); pg.wait_for_timeout(300)
    if subject in ('uklad', 'sztucce'):
        pg.fill('#dW', '489'); pg.fill('#dD', '476'); pg.fill('#dH', '80')
        pg.click('#formDrawer button[type=submit]'); pg.wait_for_timeout(200)
        if subject == 'sztucce':
            pg.click('#kitBtn'); pg.click('#kitList [data-k=sztucce]'); pg.click('#kitApply'); pg.wait_for_timeout(200)
        pg.click('#tab3d'); pg.wait_for_timeout(300)
        return '#presBtn'
    pg.click('#modelTabs [data-m=wieszak-grzejnik]'); pg.wait_for_timeout(300)
    if subject == 'wieszak-czarny':
        pg.click('#sgSw button >> nth=0'); pg.wait_for_timeout(100)
    return '#sgShoot'


def shoot(pg, opts, size, path):
    if 'env' in opts: pg.select_option('#pDrawer', opts['env'])
    pg.select_option('#pBg', opts.get('bg', '#F4F4F2'))
    pg.set_checked('#pLayers', opts.get('layers', True))
    if pg.is_enabled('#pAO'): pg.set_checked('#pAO', opts.get('ao', True))
    pg.click(f"#pShot [data-v={opts['shot']}]"); pg.select_option('#pSize', size); pg.wait_for_timeout(400)
    # WebView/Playwright może anulować pobranie blob URL w trybie headless.
    # Przechwytujemy wyłącznie link zdjęcia i zapisujemy te same bajty PNG z eksportu aplikacji.
    pg.evaluate('window.__presPng = null')
    pg.click('#pShoot')
    pg.wait_for_function('window.__presPng instanceof Promise', timeout=300000)
    encoded = pg.evaluate('async () => await window.__presPng')
    with open(path, 'wb') as f: f.write(base64.b64decode(encoded))


def page_html(rows, out_dir):
    def img(src): return f'<a href="{src}"><img src="{src}" loading="lazy"></a>' if src else '<div class="none">brak</div>'
    cards = []
    for name, desc, before, after, secs in rows:
        cards.append(f'<section><h2>{html.escape(desc)} <small>{name} · {secs:.1f} s</small></h2>'
                     f'<div class="pair"><figure>{img(before)}<figcaption>przed</figcaption></figure>'
                     f'<figure>{img(after)}<figcaption>po</figcaption></figure></div></section>')
    return ('<!doctype html><meta charset="utf-8"><title>Tryb prezentacji — porównanie</title><style>'
            'body{font:14px system-ui;margin:20px;background:#15181d;color:#e6e9ee}h1{font-size:20px}'
            'h2{font-size:15px;margin:22px 0 8px}small{color:#8c95a4;font-weight:400}'
            '.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}img{width:100%;display:block;border-radius:6px}'
            'figcaption{color:#8c95a4;font-size:12px;margin-top:4px}.none{aspect-ratio:1;display:grid;place-items:center;border:1px dashed #444;border-radius:6px;color:#8c95a4}'
            f'</style><h1>Tryb prezentacji — przed i po</h1><p>Zdjęcia „po”: {html.escape(out_dir)}</p>' + ''.join(cards))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(ROOT, 'build', 'prezentacja', 'po'))
    ap.add_argument('--rozmiar', default='1080x1080', help='rozmiar zdjęcia z listy w aplikacji (domyślnie 1080x1080)')
    ap.add_argument('--tylko', default='', help='renderuj tylko ujęcia, których nazwa zawiera ten tekst')
    ap.add_argument('--przed', action='store_true', help='(tylko właściciel projektu) zapisz wynik jako nowe zdjęcia „przed”')
    ap.add_argument('--po', action='store_true', help='zapisz też JPG 900×900 do docs/prezentacja/po/ (do pull requesta)')
    a = ap.parse_args()
    if not os.path.exists(PAGE[7:]): sys.exit('Brak dist/konfigurator-offline.html — uruchom najpierw: python3 tools/build.py')
    from playwright.sync_api import sync_playwright
    os.makedirs(a.out, exist_ok=True)
    shots = [s for s in SHOTS if a.tylko in s[0]]
    rows, errors = [], []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for name, desc, subject, opts in shots:
            ctx = b.new_context(viewport={'width': 1400, 'height': 1000}, accept_downloads=True)
            pg = ctx.new_page(); pg.on('pageerror', lambda e, n=name: errors.append(f'{n}: {e}'))
            pg.add_init_script("""(() => {
              const nativeClick = HTMLAnchorElement.prototype.click;
              HTMLAnchorElement.prototype.click = function(){
                if(this.download && this.download.startsWith('zdjecie_')){
                  const url = this.href;
                  window.__presPng = fetch(url).then(r => r.blob()).then(blob => new Promise(resolve => {
                    const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob);
                  }));
                  return;
                }
                return nativeClick.call(this);
              };
            })();""")
            pg.set_default_timeout(120000)  # programowa grafika (SwiftShader) bywa bardzo wolna
            t0 = time.time()
            try:
                btn = prepare(pg, subject); pg.click(btn); pg.wait_for_timeout(1500)
                path = os.path.join(a.out, name + '.png'); shoot(pg, opts, a.rozmiar, path)
                print(f'OK   {name}  ({time.time() - t0:.1f} s)')
            except Exception as e:
                path = None; errors.append(f'{name}: {e}'); print(f'BŁĄD {name}: {str(e)[:200]}')
            rows.append((name, desc, path, time.time() - t0)); ctx.close()
        b.close()
    for flag, target in ((a.przed, BEFORE), (a.po, AFTER_DOCS)):
        if not flag: continue
        from PIL import Image
        os.makedirs(target, exist_ok=True)
        for name, _, path, _ in rows:
            if path: Image.open(path).convert('RGB').resize((900, 900), Image.LANCZOS).save(os.path.join(target, name + '.jpg'), quality=86, optimize=True)
        print('Zapisano JPG:', target)
    report = os.path.join(os.path.dirname(a.out), 'porownanie.html')
    rel = lambda p: os.path.relpath(p, os.path.dirname(report)) if p and os.path.exists(p) else None
    open(report, 'w', encoding='utf8').write(page_html(
        [(n, d, rel(os.path.join(BEFORE, n + '.jpg')), rel(p), s) for n, d, p, s in rows], a.out))
    print('Porównanie:', report)
    if errors:
        print('\nBłędy:\n' + '\n'.join(errors)); sys.exit(1)


if __name__ == '__main__':
    main()
