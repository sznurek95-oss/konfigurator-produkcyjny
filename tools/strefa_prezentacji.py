#!/usr/bin/env python3
"""Strażnik zadania „dopracuj tryb prezentacji”: sprawdza, czy zmiany nie wychodzą poza wydzieloną strefę.

Porównuje bieżący stan (zatwierdzone zmiany + niezatwierdzone pliki) z gałęzią bazową i wypisuje
każdy plik zmieniony poza strefą. Kod wyjścia 1 = naruszenie.

Strefa (wolno zmieniać i dodawać):
  src/prezentacja/**            — kod, panel i style trybu prezentacji, lista dodatków three.js
  tools/prezentacja/**          — narzędzie podglądu zdjęć
  docs/prezentacja/** oprócz przed/  — instrukcja, notatki, zdjęcia „po”
Tylko NOWE pliki (bez zmian w istniejących):
  vendor/examples/**            — dodatkowe moduły three.js r128 z examples/js (np. postprocessing/SAOPass.js)

Wszystko inne jest zamrożone, w szczególności: src/editor/prezentacja-kontrakt.ts (kontrakt danych),
src/editor/**, src/index.html, src/models/**, src/export/**, src/layout/**, tests/**, tools/*.py, src-tauri/**, .github/**.

Użycie:  python3 tools/strefa_prezentacji.py [--baza origin/main]
"""
import argparse, fnmatch, subprocess, sys

ZONE = ['src/prezentacja/*', 'tools/prezentacja/*', 'docs/prezentacja/*']
FROZEN_IN_ZONE = ['docs/prezentacja/przed/*']
ADD_ONLY = ['vendor/examples/*']


def git(*a):
    return subprocess.run(['git', *a], capture_output=True, text=True, check=True).stdout


def match(path, pats):
    return any(fnmatch.fnmatch(path, p) for p in pats)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--baza', default='origin/main', help='gałąź, od której zaczęto pracę (domyślnie origin/main)')
    a = ap.parse_args()
    base = git('merge-base', a.baza, 'HEAD').strip()
    changes = {}
    # zatwierdzone zmiany od rozgałęzienia + zmiany w drzewie roboczym + nowe pliki nieśledzone
    for line in git('diff', '--name-status', '-M', base).splitlines() + git('diff', '--name-status', '-M', '--cached', base).splitlines():
        st, *paths = line.split('\t')
        for p in paths: changes.setdefault(p, st[0])
    for p in git('ls-files', '--others', '--exclude-standard').splitlines():
        changes.setdefault(p, 'A')
    bad = []
    for p, st in sorted(changes.items()):
        if match(p, ZONE) and not match(p, FROZEN_IN_ZONE):
            continue
        if match(p, ADD_ONLY) and st == 'A':
            continue
        why = 'tylko nowe pliki' if match(p, ADD_ONLY) else 'poza strefą prezentacji'
        bad.append(f'  {st}  {p}   ({why})')
    print(f'Zmienione pliki od {base[:8]}: {len(changes)}')
    if bad:
        print('NARUSZENIE STREFY — te zmiany trzeba cofnąć albo uzgodnić z właścicielem projektu:')
        print('\n'.join(bad))
        sys.exit(1)
    print('OK: wszystkie zmiany mieszczą się w strefie trybu prezentacji.')


if __name__ == '__main__':
    main()
