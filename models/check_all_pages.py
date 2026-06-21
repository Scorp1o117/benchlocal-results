#!/usr/bin/env python3
import os, re

models_dir = r"C:\Users\15403\.benchlocal\site\models"
for f in sorted(os.listdir(models_dir)):
    if f.endswith(".html"):
        path = os.path.join(models_dir, f)
        with open(path, "r", encoding="utf-8") as fh:
            c = fh.read()
        
        issues = []
        
        # Check sub-score divs for mangled HTML
        subs = re.findall(r'<div class="sub">(.*?)</div>', c)
        for i, s in enumerate(subs):
            if "通过" in s and ("clas" in s or s.count("通过") > 1 or s.count("重试") > 1):
                issues.append(f"  sub[{i}] MANGLED: {s[:80]}")
        
        # Check big score
        big = re.search(r'class="num">([\d.]+)</div>', c)
        
        # Check retry penalty text
        retry_text = re.search(r'重试扣分 (\d+)', c)
        
        # Check formula line
        formula = re.search(r'原始 ([\d.]+) − 重试扣分 (\d+)', c)
        
        print(f"\n=== {f} ===")
        if big:
            print(f"  big score: {big.group(1)}")
        if formula:
            print(f"  formula: orig={formula.group(1)} penalty={formula.group(2)}")
        if issues:
            for iss in issues:
                print(f"  ISSUE: {iss}")
        else:
            print(f"  sub-scores: OK")
