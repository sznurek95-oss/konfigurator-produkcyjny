# Instrukcje dla agentów AI

Konfigurator produkcyjny: jedna strona HTML (TypeScript → `tools/build.py` → `dist/`) plus aplikacja Windows
(Tauri, `src-tauri/`). Opis projektu: `README.md`. Język projektu, komentarzy i komunikatów: polski.

## Zadania wydzielone

Niektóre prace są wydzielone do osobnej strefy. Jeśli dostałeś takie zadanie, zmieniasz **tylko** pliki ze strefy.
Reszta repozytorium jest zamrożona, także przy „drobnych poprawkach przy okazji”.

| Zadanie | Instrukcja | Strefa | Strażnik |
| --- | --- | --- | --- |
| Wygląd zdjęć w trybie prezentacji | `docs/prezentacja/ZADANIE.md` | `src/prezentacja/`, `tools/prezentacja/`, `docs/prezentacja/` (bez `przed/`), nowe pliki w `vendor/examples/` | `python3 tools/strefa_prezentacji.py` |

Przy zadaniu wydzielonym:

- Zacznij od przeczytania instrukcji zadania w całości.
- Pracuj na osobnej gałęzi i oddaj pracę pull requestem do `main`. Nie wypychaj do `main`, bo każdy push do `main` buduje i publikuje instalator.
- Przed oddaniem uruchom strażnika i testy wymienione w instrukcji.
- Gdy coś wymaga zmiany poza strefą, nie rób jej: opisz to w notatkach zadania.

## Zawsze

- Nie zmieniaj geometrii modeli ani eksportu STL/3MF bez wyraźnego polecenia. `python3 tools/porownaj_ze_stara.py` pilnuje, żeby pliki do druku były identyczne.
- Nie dodawaj zależności pobieranych z internetu w czasie działania: wersja offline musi działać bez sieci.
- Nie commituj kluczy ani haseł (podpis aktualizacji jest w sekretach GitHub Actions).
