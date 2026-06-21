#!/usr/bin/env python3
"""Fix broken sub-score lines by replacing the entire sub-scores block."""
import re, os

models_dir = r"C:\Users\15403\.benchlocal\site\models"

# Correct sub-score blocks for each file
# Format: (filename, old_pattern, new_block)
# We search for the sub-scores div and replace the whole thing

fixes = {
    "qwen36-35b.html": [
        # BugFind line is broken
        ('<div class="sub-score"><div class="label">BugFind-15</div><div class="num" style="color:#ED8936">80.7</div><div clas11/15 通过 · 73% · 重试 -4通过 · 73%</div>',
         '<div class="sub-score"><div class="label">BugFind-15</div><div class="num" style="color:#ED8936">94</div><div class="sub">14/15 通过 · 93% · 重试 -4</div>'),
        # HermesAgent line is broken  
        ('<div class="sub-score"><div class="label">HermesAgent-20</div><div class="num" style="color:#548235">76</div><13/20 通过 · 65% · 重试 -6">13/20 通过 · 65%</div>',
         '<div class="sub-score"><div class="label">HermesAgent-20</div><div class="num" style="color:#548235">83</div><div class="sub">16/20 通过 · 80% · 重试 -6</div>'),
    ],
    "qwen36-27b.html": [
        # HermesAgent line is broken
        ('<div class="sub-score"><div class="label">HermesAgent-20</div><div class="num" style="color:#548235">82.8</div><div clas14/20 通过 · 70% · 重试 -2通过 · 70%</div>',
         '<div class="sub-score"><div class="label">HermesAgent-20</div><div class="num" style="color:#548235">82.8</div><div class="sub">14/20 通过 · 70% · 重试 -2</div>'),
    ],
    "qwen36-35b-thinking.html": [
        # BugFind line might be broken
        ('<div class="sub-score"><div class="label">BugFind-15</div><div class="num" style="color:#ED8936">88.7</div><div clas',
         '<div class="sub-score"><div class="label">BugFind-15</div><div class="num" style="color:#ED8936">88.7</div><div class="sub">'),
    ],
    "qwenpaw-flash-9b.html": [
        # Already fixed, but verify
        ('<div class="sub-score"><div class="label">HermesAgent-20</div><div class="num" style="color:#548235">80</div><div clas',
         '<div class="sub-score"><div class="label">HermesAgent-20</div><div class="num" style="color:#548235">80</div><div class="sub">'),
    ],
}

for filename, replacements in fixes.items():
    path = os.path.join(models_dir, filename)
    if not os.path.isfile(path):
        continue
    
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    fixed = 0
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)
            fixed += 1
            print(f"  FIXED in {filename}")
        else:
            print(f"  SKIP in {filename}: pattern not found")
    
    if fixed > 0:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"✅ {filename}: {fixed} fixes")
    else:
        print(f"  {filename}: no changes")
