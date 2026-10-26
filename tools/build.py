#!/usr/bin/env python3
"""Buduje konfigurator: TypeScript -> moduły JS -> jeden plik HTML.

Wynik:
  dist/konfigurator.html          — wersja z bibliotekami z CDN (do podglądu online)
  dist/konfigurator-offline.html  — wszystko w jednym pliku, działa bez internetu
  dist/app/index.html             — to samo, jako strona aplikacji na PC (src-tauri)

Użycie:  python3 tools/build.py
Wymaga: TypeScript (tsc) w PATH.
"""
import base64, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, OUT, DIST, VENDOR = (os.path.join(ROOT, d) for d in ('src', 'build/js', 'dist', 'vendor'))
ENTRY = 'editor/app.js'

CDN = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/'
LIBS = [  # (plik w vendor/, adres CDN)
    ('three.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'),
    ('OrbitControls.js', CDN + 'controls/OrbitControls.js'),
    ('RoomEnvironment.js', CDN + 'environments/RoomEnvironment.js'),
] + [('examples/' + e, CDN + e) for e in (
    'shaders/CopyShader.js', 'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js',
    'postprocessing/ShaderPass.js', 'math/SimplexNoise.js', 'shaders/SSAOShader.js',
    'postprocessing/SSAOPass.js', 'shaders/GammaCorrectionShader.js')]


def extra_libs():
    """Dodatki three.js r128 dla trybu prezentacji: src/prezentacja/biblioteki.txt, jedna ścieżka
    względem examples/js na linię (np. postprocessing/SAOPass.js). Plik musi leżeć w vendor/examples/."""
    p = os.path.join(SRC, 'prezentacja', 'biblioteki.txt')
    if not os.path.exists(p): return []
    have, out = {f for f, _ in LIBS}, []
    for line in open(p, encoding='utf8'):
        e = line.split('#', 1)[0].strip()
        if not e: continue
        if '..' in e or e.startswith('/'): sys.exit(f'biblioteki.txt: niedozwolona ścieżka {e}')
        f = 'examples/' + e
        if f in have: continue
        if not os.path.exists(os.path.join(VENDOR, f)): sys.exit(f'biblioteki.txt: brak pliku vendor/{f} (skopiuj go z pakietu three@0.128.0, examples/js/{e})')
        have.add(f); out.append((f, CDN + e))
    return out


FONTS = [('Bricolage Grotesque', 'bricolage-grotesque', [600, 700]),
         ('IBM Plex Sans', 'ibm-plex-sans', [400, 500, 600]),
         ('IBM Plex Mono', 'ibm-plex-mono', [400, 500])]
LAT = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF"


def compile_ts():
    tsc = shutil.which('tsc')  # w Windows to tsc.cmd
    if not tsc: sys.exit('Brak TypeScript: npm install -g typescript')
    r = subprocess.run([tsc, '-p', ROOT], capture_output=True, text=True, encoding='utf8')
    if r.returncode != 0:
        sys.exit('Błędy TypeScript:\n' + r.stdout + r.stderr)


IMPORT_RE = re.compile(r"^import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s+as\s+(\w+))?\s*from\s*'([^']+)';\s*$", re.M)


def resolve(base, spec):
    return os.path.normpath(os.path.join(os.path.dirname(base), spec)).replace(os.sep, '/')


def transform(name, code):
    """Zamienia moduł ES na funkcję zwracającą obiekt eksportów."""
    deps, exports = [], []

    def imp(m):
        default, names, star, spec = m.groups()
        dep = resolve(name, spec); deps.append(dep)
        ref = f"__mods['{dep}']"; out = []
        if default: out.append(f"const {default} = {ref}.default;")
        if star: out.append(f"const {star} = {ref};")
        if names:
            parts = [p.strip() for p in names.split(',') if p.strip()]
            parts = [p.replace(' as ', ': ') for p in parts if not p.startswith('type ')]
            if parts: out.append(f"const {{ {', '.join(parts)} }} = {ref};")
        return '\n'.join(out)

    code = IMPORT_RE.sub(imp, code)

    def side(m):  # import './plik.js';  — tylko efekt uboczny (np. rejestracja modelu)
        deps.append(resolve(name, m.group(1))); return ''
    code = re.sub(r"^import\s+'([^']+)';\s*$", side, code, flags=re.M)

    def reexp(m):  # export { a, b } from './plik.js';
        dep = resolve(name, m.group(2)); deps.append(dep)
        names = [p.strip() for p in m.group(1).split(',') if p.strip()]
        for p in names:
            src, _, alias = p.partition(' as ')
            exports.append(f"{(alias or src).strip()}: __mods['{dep}'].{src.strip()}")
        return ''
    code = re.sub(r"^export\s*\{([^}]*)\}\s*from\s*'([^']+)';\s*$", reexp, code, flags=re.M)
    if re.search(r"^\s*import\s", code, re.M):
        sys.exit(f'{name}: nieobsługiwana instrukcja import')

    def exp_decl(m):
        exports.append(m.group(2)); return m.group(1)
    code = re.sub(r"^export\s+((?:async\s+)?function\*?\s+(\w+))", exp_decl, code, flags=re.M)
    code = re.sub(r"^export\s+((?:const|let|var|class)\s+(\w+))", exp_decl, code, flags=re.M)
    code = re.sub(r"^export\s+default\s+", "const __default = ", code, flags=re.M)
    if 'const __default = ' in code: exports.append('default: __default')

    def exp_list(m):
        for p in m.group(1).split(','):
            p = p.strip()
            if p: exports.append(p.replace(' as ', ': ') if ' as ' in p else p)
        return ''
    code = re.sub(r"^export\s*\{([^}]*)\};?\s*$", exp_list, code, flags=re.M)
    if re.search(r"^\s*export\s", code, re.M):
        sys.exit(f'{name}: nieobsługiwana instrukcja export')
    # przemianowania "a: b" w eksportach: zamień na "b: a"
    ex = []
    for e in exports:
        if ': ' in e and not e.startswith('default') and '__mods' not in e:
            a, b = e.split(': '); ex.append(f'{b}: {a}')
        else:
            ex.append(e)
    body = f"__mods['{name}'] = (() => {{\n{code}\nreturn {{ {', '.join(ex)} }};\n}})();\n"
    return deps, body


def bundle():
    mods, order, seen = {}, [], set()

    def visit(name, stack=()):
        if name in seen: return
        if name in stack: sys.exit('Cykliczne importy: ' + ' -> '.join(stack + (name,)))
        path = os.path.join(OUT, name)
        code = open(path, encoding='utf8').read()
        deps, body = transform(name, code)
        for d in deps: visit(d, stack + (name,))
        seen.add(name); order.append(name); mods[name] = body
    visit(ENTRY)
    return "(() => {\n'use strict';\nconst __mods = {};\n" + ''.join(mods[n] for n in order) + "})();\n", order


def font_css():
    faces = []
    for fam, sl, ws in FONTS:
        for w in ws:
            for sub, rng in (('latin', LAT), ('latin-ext', EXT)):
                p = os.path.join(VENDOR, 'fonts', f'{sl}-{sub}-{w}-normal.woff2')
                if not os.path.exists(p): continue
                b = base64.b64encode(open(p, 'rb').read()).decode()
                faces.append(f'@font-face{{font-family:"{fam}";font-style:normal;font-weight:{w};font-display:swap;src:url(data:font/woff2;base64,{b}) format("woff2");unicode-range:{rng}}}')
    return '\n'.join(faces)


def main():
    LIBS.extend(extra_libs())
    compile_ts()
    js, order = bundle()
    if '</script' in js.lower(): sys.exit('Kod zawiera </script>')
    tpl = open(os.path.join(SRC, 'index.html'), encoding='utf8').read()
    os.makedirs(DIST, exist_ok=True)

    online = tpl.replace('<!--SCRIPTS-->', ''.join(f'<script src="{url}"></script>\n' for _, url in LIBS) + '<script>\n' + js + '</script>\n')
    open(os.path.join(DIST, 'konfigurator.html'), 'w', encoding='utf8').write(online)

    off = re.sub(r'<link rel="preconnect"[^>]*>\n', '', tpl)
    off = re.sub(r'<link rel="stylesheet" href="https://fonts.googleapis.com[^>]*>\n', '', off)
    off = off.replace('<style>\n', '<style>\nhtml,body{margin:0}img{max-width:100%}[hidden]{display:none!important}\n' + font_css() + '\n', 1)
    libs = ''
    for f, _ in LIBS:
        code = open(os.path.join(VENDOR, f), encoding='utf8').read()
        if '</script' in code.lower(): sys.exit(f + ' zawiera </script>')
        libs += '<script>\n' + code + '\n</script>\n'
    off = off.replace('<!--SCRIPTS-->', libs + '<script>\n' + js + '</script>\n')
    i = off.index('</style>') + len('</style>')
    off = ('<!doctype html>\n<html lang="pl">\n<head>\n<meta charset="utf-8">\n'
           '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
           + off[:i] + '\n</head>\n<body>\n' + off[i:] + '\n</body>\n</html>\n')
    if re.search(r'(src|href)="https?://', off): sys.exit('Wersja offline odwołuje się do internetu')
    open(os.path.join(DIST, 'konfigurator-offline.html'), 'w', encoding='utf8').write(off)
    os.makedirs(os.path.join(DIST, 'app'), exist_ok=True)  # strona aplikacji na PC (Tauri)
    open(os.path.join(DIST, 'app', 'index.html'), 'w', encoding='utf8').write(off)
    print('Moduły:', ', '.join(order))
    print('dist/konfigurator.html', len(online.encode()) // 1024, 'KB;', 'dist/konfigurator-offline.html', len(off.encode()) // 1024, 'KB')


if __name__ == '__main__':
    main()
