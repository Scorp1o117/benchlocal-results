#!/usr/bin/env python3
"""Find and fix ALL broken sub-score lines in all detail pages."""
import re, os

models_dir = r"C:\Users\15403\.benchlocal\site\models"

# Known correct data for each model's sub-scores
# filename -> [(label, score, pass_rate_text, retry_text), ...]
correct_subs = {
    "qwen36-35b.html": [
        ("ToolCall-15", "97", "15/15 通过 · 100%", " · 重试 -7"),
        ("BugFind-15", "94", "14/15 通过 · 93%", " · 重试 -4"),
        ("HermesAgent-20", "83", "16/20 通过 · 80%", " · 重试 -6"),
    ],
    "qwen36-35b-thinking.html": [
        ("ToolCall-15", "100", "15/15 通过 · 100% 🏆", " · 重试 -1"),
        ("BugFind-15", "88.7", "12/15 通过 · 80%", " · 重试 -1"),
        ("HermesAgent-20", "76.5", "13/20 通过 · 65%", " · 重试 -4"),
    ],
    "qwen36-27b.html": [
        ("ToolCall-15", "96.7", "14/15 通过 · 93%", " · 重试 -1"),
        ("BugFind-15", "84.2", "12/15 通过 · 80%", ""),
        ("HermesAgent-20", "82.8", "14/20 通过 · 70%", " · 重试 -2"),
    ],
    "qwen36-27b-thinking.html": [
        ("ToolCall-15", "100", "15/15 通过 · 100% 🏆", ""),
        ("BugFind-15", "93.3", "14/15 通过 · 93%", " · 重试 -14"),
        ("HermesAgent-20", "84.8", "16/20 通过 · 80%", " · 重试 -4"),
    ],
    "gemma4-26b.html": [
        ("ToolCall-15", "96.7", "14/15 通过 · 93%", " · 重试 -3"),
        ("BugFind-15", "86", "13/15 通过 · 87%", ""),
        ("HermesAgent-20", "84.8", "16/20 通过 · 80%", " · 重试 -3"),
    ],
    "gemma4-26b-thinking.html": [
        ("ToolCall-15", "93.3", "14/15 通过 · 93%", ""),
        ("BugFind-15", "96", "15/15 通过 · 100% 🏆", " · 重试 -3"),
        ("HermesAgent-20", "87", "16/20 通过 · 80%", " · 重试 -5"),
    ],
    "qwenpaw-flash-9b.html": [
        ("ToolCall-15", "100", "15/15 通过 · 100% 🏆", " · 重试 -4"),
        ("BugFind-15", "88", "13/15 通过 · 87%", " · 重试 -6"),
        ("HermesAgent-20", "80", "12/20 通过 · 60%", " · 重试 -14"),
    ],
    "dsv4-flash.html": [
        ("ToolCall-15", "100", "15/15 通过 · 100% 🏆", " · 重试 -2"),
        ("BugFind-15", "93.3", "14/15 通过 · 93%", " · 重试 -5"),
        ("HermesAgent-20", "90", "16/20 通过 · 80%", " · 重试 -2"),
    ],
}

for filename, subs in correct_subs.items():
    path = os.path.join(models_dir, filename)
    if not os.path.isfile(path):
        print(f"SKIP {filename}: not found")
        continue
    
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    fixed = 0
    for label, score, pass_text, retry_text in subs:
        correct_sub_text = pass_text + retry_text
        # Build the correct sub-score div
        correct_div = f'<div class="sub-score"><div class="label">{label}</div><div class="num" style="color:{{"ToolCall-15":"#E53E3E","BugFind-15":"#ED8936","HermesAgent-20":"#548235"}[label]}">{score}</div><div class="sub">{correct_sub_text}</div><div class="bar"><div class="bar-fill" style="width:{int(float(score))}%;background:{{"ToolCall-15":"var(--grad))","BugFind-15":"#ED8936","HermesAgent-20":"#548235"}[label]}"></div></div></div>'
        
        # Find the broken div for this label
        # Pattern: anything containing the label name followed by broken HTML
        broken_pattern = rf'<div class="sub-score"><div class="label">{re.escape(label)}</div>.*?</div>\s*</div>\s*</div>'
        m = re.search(broken_pattern, content, re.DOTALL)
        if m:
            # Check if it's actually broken
            old = m.group(0)
            if "clas" in old or old.count("通过") > 1 or '"<' in old:
                content = content[:m.start()] + correct_div + content[m.end():]
                fixed += 1
                print(f"  FIXED {label}: broken -> correct")
            else:
                print(f"  OK   {label}")
        else:
            print(f"  ?    {label}: pattern not found")
    
    if fixed > 0:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"✅ {filename}: {fixed} fixes applied")
    else:
        print(f"  {filename}: no fixes needed")
