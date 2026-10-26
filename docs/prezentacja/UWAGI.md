# Uwagi — zdjęcia produktowe (stan po v0.3.12)

## Co weszło z pracy Codexa (gałąź `prezentacja-wyglad`, 26.10.2026)

- Drobniejsze, spokojniejsze usłojenie drewna z krótkimi włóknami i delikatną wypukłością (bump map).
- Słabszy relief warstw PLA (mniej mory w miniaturach), odrobinę bardziej satynowy połysk.
- Ciepłe światło główne i chłodne wypełniające.
- `tools/prezentacja/podglad.py` zapisuje bajty PNG z przycisku „Zrób zdjęcie” zamiast przez pobieranie (headless Chromium na Windows anulował pobrania blob URL).

## Czego nie przeniesiono i dlaczego

- Światło konturowe (rim) i większe `envMapIntensity` — zdjęcia były prześwietlone (blady dąb, wypalona biel uchwytu).
- Render ≥ 2000 px bez nadpróbkowania — schodki na krawędziach przegródek. Zostaje render 2× i zmniejszanie (o ile pozwala `maxTextureSize`).
- Mniejszy `bias` / `normalBias` cieni — znikał cień wieszaka na ścianie.
- `shadow.radius` — przy `PCFSoftShadowMap` w three r128 nie działa.
- Zwalnianie materiałów: Codex zwalniał też materiał PLA z pamięci podręcznej (wieszak). Teraz zwalniane są tylko obiekty z `userData.ownMat`.

## Dodane przy przeglądzie

- Cień na podłożu studia jest rysowany (płótno + rozmycie): ciemny cień kontaktowy przy bryle i miękki cień rzucony
  w stronę przeciwną do światła (`presGround`). Zastąpił twardy cień z mapy cieni, który w ujęciu z góry wyglądał
  jak przesunięta szara kartka. Działa na jasnym, ciemnym i przezroczystym tle, odświeża się przy zmianie światła.
- Uchwyt szuflady: okrągły reling na dwóch nóżkach zamiast prostopadłościanu.

## Do zrobienia dalej (z listy w ZADANIE.md)

- Zaokrąglone krawędzie modułów (geometria przychodzi z kontraktu — można rozważyć wygładzanie normalnych w shaderze).
- Deski szuflady z fazkami, prowadnice, kolektory grzejnika (wymagają danych w kontrakcie).
- Stałe marginesy kadru i ujęcie „detal” wybierające ciekawy fragment zamiast stałego punktu.
