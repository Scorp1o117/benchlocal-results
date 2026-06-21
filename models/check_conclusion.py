#!/usr/bin/env python3
"""Check only roast-conclusion sections for comparison language."""
import re, os

models_dir = r"C:\Users\15403\.benchlocal\site\models"
keywords = ["之前", "上次", "进步", "暴涨", "从.*涨到", "相比", "对比", "老毛病", "依然", "仍然"]

for f in sorted(os.listdir(models_dir)):
    if f.endswith(".html"):
        path = os.path.join(models_dir, f)
        with open(path, "r", encoding="utf-8") as fh:
            c = fh.read()
        
        # Extract only roast-conclusion content
        m = re.search(r'class="roast-conclusion">(.*?)</div>\s*</div>', c, re.DOTALL)
        if m:
            conclusion = m.group(1)
            found = []
            for kw in keywords:
                if re.search(kw, conclusion):
                    found.append(kw)
            if found:
                print(f"{f:35s} CONCLUSION has: {found}")
            else:
                print(f"{f:35s} CONCLUSION CLEAN")
        else:
            print(f"{f:35s} NO CONCLUSION FOUND")
