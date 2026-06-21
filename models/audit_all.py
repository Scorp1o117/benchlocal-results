#!/usr/bin/env python3
"""Audit all detail pages for consistency."""
import os

models_dir = r"C:\Users\15403\.benchlocal\site\models"
for f in sorted(os.listdir(models_dir)):
    if f.endswith(".html"):
        path = os.path.join(models_dir, f)
        with open(path, "r", encoding="utf-8") as fh:
            c = fh.read()
        has_rule = "计分规则" in c
        has_adjusted = "重试扣分" in c and "调整后" in c
        # Check big score
        import re
        m = re.search(r'<div class="num">([\d.]+)</div>', c)
        big_score = m.group(1) if m else "?"
        print(f"{f:35s} big={big_score:5s} rule={'YES' if has_rule else 'NO':3s} adj={'YES' if has_adjusted else 'NO':3s}")
