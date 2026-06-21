#!/usr/bin/env python3
"""Extract current summaries from all detail pages for review."""
import re, os

models_dir = r"C:\Users\15403\.benchlocal\site\models"
skip = ["step37-flash.html", "n2mini.html"]

for f in sorted(os.listdir(models_dir)):
    if f.endswith(".html") and f not in skip:
        path = os.path.join(models_dir, f)
        with open(path, "r", encoding="utf-8") as fh:
            c = fh.read()
        # Extract roast-conclusion content
        m = re.search(r'class="roast-conclusion">\s*<p>(.*?)</p>', c, re.DOTALL)
        if m:
            text = re.sub(r'<[^>]+>', '', m.group(1)).strip()
            print(f"\n=== {f} ===")
            print(text[:200])
