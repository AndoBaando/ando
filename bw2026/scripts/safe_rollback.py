"""Laver en SIKKER tilbagerulnings-CSV til BW2026 ud fra butikkens nuværende data.

En variant sættes kun tilbage til sin originale pris, hvis den stadig står præcis som efter
Black Week-importen (pris = BW-pris og sammenligningspris = original pris) OG varen ikke er
tagget restsalg eller auktion nu. Varianter, der er ændret siden (fx flyttet til restsalg med
ny pris), bevarer deres nuværende pris og sammenligningspris.
Alle varianter af en vare kommer med i filen, så Shopify-importen ikke sletter varianter.

Brug: python3 -I safe_rollback.py <all.json fra products.json> <backup_originale_priser.csv> <ud.csv>
"""
import csv, json, sys
from decimal import Decimal
src, backup, out = sys.argv[1:4]
plan = {r["variant_id"]: r for r in csv.DictReader(open(backup, encoding="utf-8"))}
prods = json.load(open(src))
HDR = ["Handle", "Title", "Option1 Name", "Option1 Value", "Option2 Name", "Option2 Value", "Option3 Name", "Option3 Value", "Variant Price", "Variant Compare At Price"]
D = lambda x: Decimal(str(x)).quantize(Decimal("0.01"))
rows, restored, kept, kept_list = [], 0, 0, []
seen_plan = set()
for p in prods:
    vids = [str(v["id"]) for v in p["variants"]]
    if not any(v in plan for v in vids):
        continue
    tags = {t.strip().lower() for t in (p.get("tags") or [])}
    blocked = bool(tags & {"restsalg", "auktion"})
    opts = [o["name"] for o in p.get("options", [])]
    prow, any_restore = [], False
    for i, v in enumerate(p["variants"]):
        vid = str(v["id"]); seen_plan.add(vid)
        price = D(v["price"]); cap = D(v["compare_at_price"]) if v.get("compare_at_price") not in (None, "") else None
        r = plan.get(vid)
        if r and not blocked and price == D(r["ny_pris"]) and cap == D(r["original_pris"]):
            new_p, new_c = r["original_pris"], (r["original_sammenligningspris"] or "")
            any_restore = True; restored += 1
        else:
            new_p, new_c = str(price), (str(cap) if cap is not None else "")
            if r:
                kept += 1; kept_list.append((p["handle"], vid, str(price), str(cap), r["ny_pris"], "restsalg/auktion" if blocked else "pris ændret"))
        base = [p["handle"], p["title"] if i == 0 else ""]
        for n in range(3):
            val = v.get(f"option{n+1}") or ""
            base += [(opts[n] if n < len(opts) else "") if (i == 0 and val) else "", val]
        prow.append(base + [new_p, new_c])
    if any_restore:
        rows.extend(prow)
with open(out, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f); w.writerow(HDR); w.writerows(rows)
missing = [v for v in plan if v not in seen_plan]
print(f"Sættes tilbage: {restored} varianter | bevares som nu (ændret siden importen): {kept} | ikke fundet i butikken nu: {len(missing)}")
for k in kept_list[:20]: print("  bevares:", k)
