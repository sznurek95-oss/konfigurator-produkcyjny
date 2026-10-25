#!/usr/bin/env python3
"""Plik latest.json dla automatycznych aktualizacji aplikacji (Tauri updater).

Użycie (w GitHub Actions): python tools/latest_json.py <wersja> <plik .sig> <adres instalatora>
Opis zmian brany jest ze zmiennej NOTES (opis commita).
"""
import datetime, json, os, sys

version, sig_path, url = sys.argv[1:4]
print(json.dumps({
    'version': version,
    'notes': os.environ.get('NOTES', '').strip(),
    'pub_date': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    'platforms': {'windows-x86_64': {'signature': open(sig_path, encoding='utf8').read().strip(), 'url': url}},
}, ensure_ascii=False, indent=2))
