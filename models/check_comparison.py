#!/usr/bin/env python3
import os, re

models_dir = r"C:\Users\15403\.benchlocal\site\models"
keywords = ["之前", "上次", "进步", "暴涨", "从.*涨到", "相比", "对比", "老毛病", "依然", "仍然"]
for f in sorted(os.listdir(models_dir)):
    if f.endswith(".html") and f not in ["step37-flash.html", "n2mini.html"]:
        path = os.path.join(models_dir, f)
        with open(path, "r", encoding="utf-8") as fh:
            c = fh.read()
        found = []
        for kw in keywords:
            if re.search(kw, c):
                found.append(kw)
        if found:
            print(f"{f:35s} has: {found}")
        else:
            print(f"{f:35s} CLEAN")
