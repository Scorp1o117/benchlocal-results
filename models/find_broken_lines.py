#!/usr/bin/env python3
import os, re
models_dir = r"C:\Users\15403\.benchlocal\site\models"
for f in sorted(os.listdir(models_dir)):
    if f.endswith(".html"):
        path = os.path.join(models_dir, f)
        with open(path, "r", encoding="utf-8") as fh:
            lines = fh.readlines()
        for i, line in enumerate(lines):
            if re.search(r'通过 · \d+%[^<]*通过', line) or re.search(r'">\d+/\d+ 通过', line):
                print(f"{f}:{i+1}: {line.rstrip()[:120]}")
