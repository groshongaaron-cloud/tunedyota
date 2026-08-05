# Per-product GMC status detail. Usage: python gmc-status-detail.py <json>
import json, sys

d = json.load(open(sys.argv[1], encoding="utf-8-sig"))
for p in d.get("resources", []):
    codes = sorted({i.get("code") for i in p.get("itemLevelIssues", [])})
    print(f"{p.get('productId','?'):45s} | {p.get('title','')[:60]:60s} | {', '.join(codes)}")
