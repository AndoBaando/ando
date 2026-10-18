# Perle-krog (S-krog) til stativstangen

Lille S-krog i stil med IKEA's, lavet til vores stativstang (**Ø 22,2 mm**, målt med skydelære).
Den store top-krog går om stangen, og den lille hage forneden holder perlebundterne.

![Oversigt](renders/oversigt.png)

---

## Nøgletal

| | |
|---|---|
| Størrelse | **51 × 53 × 6 mm** (IKEA's er 60 mm høj) |
| Top-krog (om stangen) | **Ø 24 mm indvendig**: 1,8 mm luft om stangen, så den er let at hænge på og tage af |
| Hage (til bundter) | **Ø 12 mm indvendig**, åbning ind i hagen 8,5 mm |
| Vægt | **ca. 4 g PETG** pr. krog |
| Printtid (MK4S, 0,20 mm SPEED) | **ca. 8 min pr. krog**, 20 stk ≈ 2 t 40 min (80 g) |
| Pris | ca. 1 kr. i filament pr. krog |
| Bæreevne (beregnet) | brud ved ca. **5 kg**, så **hæng max ca. 2 kg** pr. krog (fx 40 perlestrenge à 50 g) |

## Det smarte: hagen er "hældnings-kompenseret"

En S-krog hænger altid skævt: stangens centrum og hagens centrum lægger sig lodret under
hinanden (se højre billede). Det gør, at en almindelig S-krogs nederste hage bliver drejet, så
bundterne lettere glider af. Modellen regner selv hældningen ud (ca. 43°) og lader hagen bue
ekstra rundt. Når krogen hænger, står hagen derfor som en dyb kop med spidsen pegende lige op.

---

## Filer

| Fil | Hvad |
|-----|------|
| `perle_krog.stl` | Klar til print. 1 krog, ligger fladt. |
| `perle_krog.scad` | Modellen (OpenSCAD). Alle mål kan ændres øverst i filen. |
| `renders/` | Preview-billeder. |

---

## Print (Prusa MK4S)

- **Orientering:** fladt, som STL'en ligger. **Ingen support.** Så følger laglinjerne krogens
  form, og belastningen går *langs* perimetrene. Det er den stærkeste måde at printe en krog på.
- **Profil:** `0.20mm SPEED`
- **Perimetre: 5.** Det er det vigtigste, fordi krogen så bliver massiv. Infill er ligegyldigt.
- **Top/bund:** 4 lag
- **Brim:** ikke nødvendigt
- **Mange på én gang:** marker krogen i PrusaSlicer, tryk **+** for flere kopier og **A** for at arrangere.
  Der kan sagtens ligge 20–30 på pladen.

### Materiale: PETG (anbefalet)

- **PETG** er sejt. Overbelastes den, bøjer den, før den knækker, og den "kryber" mindre end PLA
  ved konstant belastning. Det er det rigtige til kroge, der hænger med vægt hele tiden.
- **PLA** kan bruges til lette bundter (under ca. 1 kg), men PLA er sprødt og siger "knæk" uden varsel.

### Test først

Print 2–3 stk og hæng **4 kg** på én test-krog i et døgn (fx en pose med perler eller en vandflaske).
Holder den uden at åbne sig synligt, er I godt dækket ind med de 2 kg i daglig brug.

---

## Justering (i `perle_krog.scad`)

| Parameter | Default | Hvad |
|---|---|---|
| `rod_d` | 22,2 | Stangens diameter. Mål en anden stang og skriv tallet her. |
| `rod_clearance` | 1,8 | Luft om stangen. Mindre = sidder strammere. |
| `thick` | 6 | Krogens tykkelse. **8 = ca. 33 % stærkere** (ca. 5,3 g). |
| `wall` | 5 | Godsbredde. 6 = ca. 40 % stærkere, men lidt større krog. |
| `hook_d` | 12 | Hagens indvendige Ø. Gør den større, hvis bundternes løkker er tykke. |
| `shank` | 25 | Skaftets længde. 35 = hænger mere lodret (ca. 33°), ca. +0,4 g. |
| `top_tip` | 6 | Top-spidsens længde. Længere = falder sværere af stangen. |

Åbn filen i OpenSCAD, ret tallet, tryk **F6** (render) og **F7** (eksportér STL).
Konsollen viser hældning og åbninger, så du kan se, at stangen stadig kan komme ind.
