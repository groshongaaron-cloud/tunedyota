# Summarize GMC product statuses from a productstatuses JSON dump.
# Usage: python gmc-status-summary.py <path-to-json>
import json, sys
from collections import Counter

d = json.load(open(sys.argv[1], encoding="utf-8-sig"))
rows = d.get("resources", [])
print("products:", len(rows))
issues = Counter()
states = Counter()
for p in rows:
    for ds in p.get("destinationStatuses", []):
        if ds.get("destination") == "Shopping":
            states[ds.get("status")] += 1
    for it in p.get("itemLevelIssues", []):
        issues[(it.get("code"), it.get("servability"), it.get("description"))] += 1
print("Shopping status counts:", dict(states))
for (code, serv, desc), n in issues.most_common():
    print(f"{n:3d}  [{serv}] {code}: {desc}")
