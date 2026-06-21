#!/usr/bin/env python3
"""Extract and display all sub-score lines from each detail page."""
import re, os

models_dir = r"C:\Users\15403\.benchlocal\site\models"
for f in sorted(os.listdir(models_dir)):
    if f.endswith(".html"):
        path = os.path.join(models_dir, f)
        with open(path, "r", encoding="utf-8") as fh:
            c = fh.read()
        
        # Find all sub-score blocks
        subs = re.findall(r'<div class="sub-score">(.*?)</div>\s*</div>', c, re.DOTALL)
        
        print(f"\n=== {f} ({len(subs)} sub-scores) ===")
        for i, s in enumerate(subs):
            # Extract label, num, and sub text
            label = re.search(r'class="label">(.*?)</div>', s)
            num = re.search(r'class="num"[^>]*>([\d.]+)</div>', s)
            sub = re.search(r'<div class="sub">(.*?)</div>', s)
            if label and num and sub:
                print(f"  {label.group(1)}: {num.group(1)} | {sub.group(1)}")
            else:
                print(f"  [{i}] PARSE ERROR: {s[:100]}")
