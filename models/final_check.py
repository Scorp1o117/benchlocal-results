#!/usr/bin/env python3
import os, re
models_dir = r"C:\Users\15403\.benchlocal\site\models"
for f in sorted(os.listdir(models_dir)):
    if f.endswith(".html"):
        path = os.path.join(models_dir, f)
        with open(path, "r", encoding="utf-8") as fh:
            c = fh.read()
        broken = re.findall(r"<div clas[^>]*class", c)
        mangled = re.findall(r"通过 · \d+%[^<]*通过", c)
        quote_leak = re.findall(r'">\d+/\d+ 通过', c)
        if broken or mangled or quote_leak:
            print(f"{f}: BROKEN clas={len(broken)} mangled={len(mangled)} quote={len(quote_leak)}")
        else:
            print(f"{f}: OK")
