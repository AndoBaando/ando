# iPad-holder til butik (Prusa MK4S) — v2

Parametrisk 3D-model af en **lænende bordstander** til vores **iPad 11 (A16, 2025)**.
iPad'en læner bagover i en se-venlig vinkel, hviler i en slids, og kan lades mens
den sidder i holderen — lavet til en disk i butikken.

Designet i **OpenSCAD** (kode = præcis pasform på mm'en, nemt at ændre ét mål).

![Holder med iPad](renders/iso_ipad.png)

---

## Hvad er nyt i v2 (efter grundig research)

v2 er gennemarbejdet ud fra research af kommercielle retail-stativer (Durable, Bouncepad,
Heckler, Compulocks), 3D-print-styrke/varme, samt iPad 11's præcise hardware-layout:

| Forbedring | Hvorfor |
|-----------|---------|
| **Ventileret ryglæn (grille)** | En iPad der lader permanent bliver varm. Ved **>35 °C sætter iPad'en opladning på pause** ("thermally-limited charging") — en lukket bagplade kan altså *forhindre* den i at lade. Åben grille + luft = køler. Sparer også filament. |
| **Bag-gusset + solidt bundbælte** | Stiver ryglænets rod af — det svageste punkt når en kunde trykker på skærmen (bøjning på tværs af laglinjerne). |
| **Skridsikre fødder** | Forsænkede lommer til selvklæbende gummifødder, så holderen ikke glider på disken. |
| **Kabel-aflastning (throat)** | En indsnævring i kabelrillen klemmer kablet, så et ryk trækker i holderen — ikke i USB-C-porten. |
| **Kort frontlæbe (9 mm)** | Dækker kun rammen (~10,8 mm), ikke skærmen. |
| **Fas på bundkanter** | Mindsker "elefantfod" og skarpe kanter. |
| **Valgfri vægtlomme + skruehuller** | Ekstra stabilitet / fastgørelse til offentligt brug. |

---

## Filer

| Fil | Hvad |
|-----|------|
| `ipad_holder.scad` | Modellen. Alle mål ændres her. |
| `ipad_holder.stl` | Klar til print (fritstående, portrait). |
| `ipad_holder_skruehuller.stl` | Med 4 huller til at skrue fast til disken. |
| `renders/` | Preview-billeder. |

**Mål (default):** ca. **130 mm dyb × 193 mm bred × 144 mm høj** → passer på MK4S-pladen (250×210×220).

---

## ⚠️ Materiale: brug PETG eller ASA — ikke PLA

Dette er den vigtigste anbefaling. iPad'en lader hele dagen og bliver varm, og hvis holderen
står i et vindue med sol, bliver den ekstra varm.

- **PLA** blødgør allerede ved **~55–60 °C** → kan med tiden synke/vride sig i sol + ladevarme. **Undgå.**
- **PETG** (blødgør ~80–85 °C) = det fornuftige minimum. Bedre laghæftning, mere sejt.
- **ASA** (~105 °C, UV-stabil) = bedst hvis holderen står i direkte sol (falmer heller ikke).

---

## Print på Prusa MK4S

- **Orientering:** Print den **som den står** (bunden ned). **Ingen support nødvendig** — ryglænet
  hælder kun 30° fra lodret, ventilations-slidserne er smalle (bro < 15 mm), og kabelrillen er åben nedad.
- **Slicer-indstillinger (belastet del):**
  - Lag: **0,2 mm**
  - Perimetre: **4–5** (perimetre giver mere styrke end infill)
  - Infill: **30 % gyroid** (isotropisk — godt mod bøjning/vridning)
  - Top/bund: **5 lag**
  - Brim: **5 mm** (den høje lænende del + stor flad bund → hjælper vedhæftning)
  - **Elephant-foot compensation: ~0,2 mm** (Advanced-mode)
  - Bed: PLA 60 °C / **PETG ~85 °C**; første lag langsomt (≤50 mm/s); køleblæser lav på første lag (PETG)
- **Farve:** mat, mørk/neutral skjuler laglinjer bedst og ser professionelt ud i en butik.

---

## Efter print — samling & finish (billige tilbehør)

1. **Gummifødder** i de 4 lommer under bunden — skridsikkert. Passer til selvklæbende
   fødder ~Ø12 mm (fx 3M Bumpon SJ5012 12,7×3,5 mm eller generiske silikone-dutter). Lommen er
   2,2 mm dyb, så foden stikker lidt ud.
2. **Filt-/skumpuder (~3 mm, selvklæbende)** på de flader iPad'en rører (ribberne på ryglænet,
   bunden af slidsen, indersiden af frontlæben) — beskytter mod ridser og giver bedre greb.
   *Husk:* to 3 mm puder gør slidsen ~6 mm smallere — mål efter, eller sæt kun pude på ryglænet.
3. **Ladekabel:** brug et **vinkel-USB-C-stik** (fylder mindre i bunden), før kablet ned i rillen
   og pres det forbi "throat"-indsnævringen bagerst → aflastning.
4. **Offentlig brug:** print `..._skruehuller.stl` og skru holderen fast, og/eller sæt `weight_pocket=true`
   og fyld hulrummene med stål-hagl/sand (se parametre).

---

## iPad-pleje i butik (fra Apple)

- **Slå 80 %-opladningsgrænse til:** Indstillinger → Batteri → Batteritilstand → 80 %-grænse.
  Permanent 100 % + varme er den typiske årsag til at kiosk-iPads får "svulmende" batteri.
- **Ventilation:** hold bagsiden fri (det gør grillen) — undtag aldrig en varm iPad i et lukket rum.
- **Rengøring:** 70 % isopropyl-alkohol-servietter på skærmen; **sprøjt aldrig væske** direkte
  (designet undgår sprækker der leder væske ned i port/højttaler).

---

## Vinkel — hvad er optimalt?

Skærmen skal stå ~vinkelret på synslinjen. Tommelfingerregel: **hældning bagover fra lodret ≈
hvor mange grader synslinjen falder under vandret.**

| Situation | `lean_angle` (fra lodret) |
|-----------|---------------------------|
| Skærm i ~øjenhøjde, mest til at kigge på | 12–20° |
| **Disk, kunde står og kigger ned (default)** | **30°** |
| Lav disk / kunde helt tæt på | 35–45° |

Læner du mere tilbage: gør `lip_height` **lavere** (ellers dækker læben skærm) og `base_depth`
**dybere** (ellers vælter den). Modellen skriver kontroltal i konsollen (F5): læbe-dækning + tyngdepunkt.

---

## Orientering: portrait vs. landscape

- **Portrait (default):** USB-C i bunden → renest kabelføring. Godt til info/sign-up/kasse.
- **Landscape:** iPad 11'ens **frontkamera sidder på den lange kant** → i landscape sidder det
  øverst som et webcam. **Vælg landscape hvis I laver FaceTime/videoopkald** i butikken.
  *Bemærk:* en iPad på tværs er 248,6 mm bred — en fuldbredde-holder (~262 mm) er **for bred til
  MK4S-pladen**. Til landscape: sæt `orientation="landscape"` og reducér `extra_width` (fx til 0) og
  evt. `vent_span`, så holderen bliver smallere end iPad'en (iPad'en hænger så lidt ud over siderne).

---

## Tilpas designet

Åbn `ipad_holder.scad`, ret tallene, tryk **F5** (preview) / **F6** (render), **F7** = ny STL.

| Parameter | Betydning | Tip |
|-----------|-----------|-----|
| `slot_thickness` | Tykkelsen slidsen passer til | Bar iPad ≈ **7,6** (7,2+slip), tyndt cover ≈ **12** (default), robust ≈ **18**. Mål jeres cover! |
| `lean_angle` | Grader fra lodret | 30 = default. Se vinkel-tabellen. |
| `orientation` | `"portrait"` / `"landscape"` | Se afsnit ovenfor. |
| `support_frac` | Hvor højt ryglænet støtter | 0,5 = halvvejs. Højere = mere støtte, mere filament. |
| `lip_height` | Frontkantens højde | Hold < 10,8 × cos(vinkel) → dækker kun rammen. |
| `vent` / `vent_slot_w` / `vent_rib` | Ventilations-grille | `vent=false` for massivt ryglæn. |
| `feet` / `foot_d` / `foot_depth` | Fod-lommer | Tilpas til jeres gummifødder. |
| `base_depth` | Fundamentets dybde | Større = mere stabilt mod vip. |
| `screw_holes` | Huller til fastskruning | `true` til offentlig brug. |
| `weight_pocket` | Lukkede hulrum til vægt | `true` → fyld med stål-hagl/sand via **print-pause** (pause når hulrummet er ved at lukke, hæld i, fortsæt). |
| `show_device` | Tegn "spøgelses-iPad" | Kun preview — tjek pasform. |

**Tolerancer:** FDM-nøjagtighed er ~±0,15 mm. En snug-men-aftagelig pasform ligger på ~0,2–0,4 mm
samlet slip. PETG skal have ~0,05 mm mere pr. side end PLA. Print gerne et lille test-stykke af
slidsen og juster i 0,1 mm-trin før hele delen.

---

## Hvorfor OpenSCAD og ikke "noget med AI/MCP"?
Til en **funktionel del med præcise pasninger** (en iPad-slids på 0,x mm) er parametrisk kode det
rigtige værktøj: reproducerbart, nemt at ændre ét mål, og eksporterer en ren, vandtæt STL direkte.
Text-to-3D / mesh-AI er upræcist til den slags. Der var heller ingen CAD-MCP i sessionen — så
OpenSCAD er både det bedste og det mest direkte valg.

---

### Kilder (research)
iPad 11-specs (Apple/EveryMac/GSMArena), thermally-limited charging & batteri-grænse (Apple support),
retail-stativer (Bouncepad, Heckler, Compulocks, Durable), print-styrke/varme/tolerancer
(Prusa KB, All3DP, Snapmaker, Xometry m.fl.). Fuld liste i commit-historikken.
