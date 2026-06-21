#!/usr/bin/env python3
"""
Fix ALL broken sub-score lines across ALL detail pages.
Strategy: find each broken line (contains 'clas' without 'class' or has duplicated '通过'),
and replace with correct version.
"""
import re, os

models_dir = r"C:\Users\15403\.benchlocal\site\models"

# For each file, list the 3 correct sub-score lines
# (label, score, pass_rate, retry_penalty)
correct = {
    "step37-flash.html": [
        ("ToolCall-15", "100", "15/15 通过 · 100% 🏆", " · 重试 -4"),
        ("BugFind-15", "87", "12/15 通过 · 80%", " · 重试 -2"),
        ("HermesAgent-20", "81", "15/20 通过 · 75%", " · 重试 -4"),
    ],
    "n2mini.html": [
        ("ToolCall-15", "93", "14/15 通过 · 93%", " · 重试 -6"),
        ("BugFind-15", "88", "13/15 通过 · 87%", " · 重试 -11"),
        ("HermesAgent-20", "81", "15/20 通过 · 75%", " · 重试 -10"),
    ],
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
    "dsv4-flash.html": [
        ("ToolCall-15", "100", "15/15 通过 · 100% 🏆", " · 重试 -2"),
        ("BugFind-15", "93.3", "14/15 通过 · 93%", " · 重试 -5"),
        ("HermesAgent-20", "90", "16/20 通过 · 80%", " · 重试 -2"),
    ],
}

color_map = {"ToolCall-15": "#E53E3E", "BugFind-15": "#ED8936", "HermesAgent-20": "#548235"}
grad_map = {"ToolCall-15": "var(--grad)", "BugFind-15": "#ED8936", "HermesAgent-20": "#548235"}

for filename, subs in correct.items():
    path = os.path.join(models_dir, filename)
    if not os.path.isfile(path):
        continue
    
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Find the sub-scores block: from first <div class="sub-score"> to closing </div></div></div>
    # Replace the entire sub-scores container
    sub_start = content.find('<div class="sub-scores">')
    if sub_start < 0:
        print(f"SKIP {filename}: no sub-scores block")
        continue
    
    # Find the closing </div> for sub-scores (3 levels deep)
    # Count div nesting
    pos = sub_start + len('<div class="sub-scores">')
    depth = 1
    while pos < len(content) and depth > 0:
        next_open = content.find('<div', pos)
        next_close = content.find('</div>', pos)
        if next_close < 0:
            break
        if next_open >= 0 and next_open < next_close:
            depth += 1
            pos = next_open + 4
        else:
            depth -= 1
            if depth == 0:
                pos = next_close + 6
            else:
                pos = next_close + 6
    
    old_block = content[sub_start:pos]
    
    # Build new sub-scores block
    new_subs = []
    for label, score, pass_text, retry_text in subs:
        color = color_map[label]
        grad = grad_map[label]
        sub_text = pass_text + retry_text
        width = int(float(score))
        new_subs.append(
            f'      <div class="sub-score"><div class="label">{label}</div>'
            f'<div class="num" style="color:{color}">{score}</div>'
            f'<div class="sub">{sub_text}</div>'
            f'<div class="bar"><div class="bar-fill" style="width:{width}%;background:{grad}"></div></div></div>'
        )
    
    new_block = '    <div class="sub-scores">\n' + '\n'.join(new_subs) + '\n    </div>'
    
    content = content[:sub_start] + new_block + content[pos:]
    
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    
    print(f"✅ {filename}: sub-scores block replaced")
