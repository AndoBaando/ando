"""Henter offentlige produktdata (products.json) fra uniqperler.com, side for side, med pause og genoptagelse.
Brug: python3 -I fetch.py <outdir> <bw|all>
Gemmer hver side som <outdir>/<kind>_pNNN.json og samlet <outdir>/<kind>.json.
"""
import json, os, sys, time, urllib.request, urllib.error
out, kind = sys.argv[1], sys.argv[2]
BASE = "https://www.uniqperler.com"
PATH = {"bw": "/collections/black-week-15-automatisk/products.json", "all": "/products.json"}[kind]
page, items = 1, []
while True:
    fn = f"{out}/{kind}_p{page:03d}.json"
    if os.path.exists(fn):
        prods = json.load(open(fn))
    else:
        url = f"{BASE}{PATH}?limit=250&page={page}"
        wait = 10
        while True:
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "bw2026-pricetool"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    prods = json.load(r).get("products", [])
                break
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    print("429, venter", wait, "sek", file=sys.stderr); time.sleep(wait); wait = min(wait * 2, 120); continue
                raise
        json.dump(prods, open(fn, "w"))
        time.sleep(2.5)
    if not prods:
        break
    items.extend(prods)
    print(kind, "side", page, "->", len(prods), "i alt", len(items), file=sys.stderr)
    page += 1
json.dump(items, open(f"{out}/{kind}.json", "w"))
print(kind, "færdig:", len(items), "varer")
