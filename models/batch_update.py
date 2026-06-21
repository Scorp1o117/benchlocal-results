#!/usr/bin/env python3
"""Batch update all detail pages: add rule box, update big scores, update sub-score retry info."""
import re, os

models_dir = r"C:\Users\15403\.benchlocal\site\models"

# All model data: filename -> (big_score, orig, penalty, retries_detail, tc, tc_retry, bf, bf_retry, ha, ha_retry)
model_data = {
    "step37-flash.html":           (78.8, 88.8, 10, "TC-4 + BF-2 + HA-4",  100, 4,  87,  2,  81,  4),
    "n2mini.html":                 (60.2, 87.2, 27, "",                    93,  6,  88,  11, 81,  10),
    "qwen36-35b.html":            (73.5, 90.5, 17, "TC-7 + BF-4 + HA-6",  97,  7,  94,  4,  83,  6),
    "qwen36-35b-thinking.html":   (81.2, 87.2, 6,  "TC-1 + BF-1 + HA-4",  100, 1,  88.7,1,  76.5,4),
    "gemma4-26b.html":            (82.7, 88.7, 6,  "TC-3 + BF-0 + HA-3",  96.7,3,  86,  0,  84.8,3),
    "gemma4-26b-thinking.html":   (83.6, 91.6, 8,  "TC-0 + BF-3 + HA-5",  93.3,0,  96,  3,  87,  5),
    "qwenpaw-flash-9b.html":      (64.4, 88.4, 24, "TC-4 + BF-6 + HA-14", 100, 4,  88,  6,  80,  14),
    "qwen36-27b.html":            (84.4, 87.4, 3,  "TC-1 + BF-0 + HA-2",  96.7,1,  84.2,0,  82.8,2),
    "qwen36-27b-thinking.html":   (73.9, 91.9, 18, "TC-0 + BF-14 + HA-4", 100, 0,  93.3,14, 84.8,4),
    "dsv4-flash.html":            (85.0, 94.0, 9,  "TC-2 + BF-5 + HA-2",  100, 2,  93.3,5,  90,  2),
}

rule_box_template = '''  <div style="max-width:1280px;margin:16px auto 0;padding:0 48px">
    <div style="background:#F1F5F9;border-radius:12px;padding:16px 20px;font-size:13px;color:#64748B;line-height:1.8">
      <strong style="color:#1A202C">📊 计分规则</strong> — 加权总分 = ToolCall×0.3 + BugFind×0.3 + HermesAgent×0.4，再扣除重试惩罚分。
      <strong>重试扣分</strong>：每道题首次通过不扣分，重试后才通过的题目每重试 1 次扣 1 分，重试后仍失败的不参与扣分。
      <strong>公式</strong>：最终分 = 原始加权分 − Σ(每题重试次数)。
      <span style="color:#E53E3E;font-weight:600">本模型共重试 {retries} 次{detail}</span>
    </div>
  </div>'''

for filename, (big, orig, penalty, detail, tc, tc_r, bf, bf_r, ha, ha_r) in model_data.items():
    if filename == "step37-flash.html":
        continue  # Already done
    
    path = os.path.join(models_dir, filename)
    if not os.path.isfile(path):
        print(f"SKIP {filename}: file not found")
        continue
    
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    changed = []
    
    # 1. Add rule box after score-row closing div (if not present)
    if "计分规则" not in content:
        detail_str = f"（{detail}）" if detail else ""
        rule_box = rule_box_template.format(retries=penalty, detail=detail_str)
        
        # Find the closing </div>\n</section> of the score-row section
        # Insert rule box after the score-row section
        score_end = content.find('</section>')
        if score_end > 0:
            # Find the </div> before </section>
            insert_pos = content.rfind('</div>', 0, score_end) + len('</div>')
            content = content[:insert_pos] + '\n' + rule_box + '\n' + content[insert_pos:]
            changed.append("added rule box")
    
    # 2. Update big score
    old_big = re.search(r'<div class="num">([\d.]+)</div>\s*<div class="sub">', content)
    if old_big:
        old_val = old_big.group(1)
        if float(old_val) != big:
            content = content[:old_big.start(1)] + str(big) + content[old_big.end(1):]
            changed.append(f"big score {old_val}->{big}")
    
    # 3. Update sub (formula line) under big score
    old_sub = re.search(r'(<div class="sub">)(TC×0\.3[^<]*)(</div>)', content)
    if old_sub:
        new_sub_text = f"原始 {orig} − 重试扣分 {penalty}"
        content = content[:old_sub.start(2)] + new_sub_text + content[old_sub.end(2):]
        changed.append("updated formula line")
    
    # 4. Update sub-score retry info in bar labels
    # TC: add retry info
    tc_retry_str = f" · 重试 -{tc_r}" if tc_r > 0 else ""
    bf_retry_str = f" · 重试 -{bf_r}" if bf_r > 0 else ""
    ha_retry_str = f" · 重试 -{ha_r}" if ha_r > 0 else ""
    
    # Find and update sub-score divs - they have pattern: <div class="sub">XX/YY 通过 · ZZ%</div>
    # We need to add retry info to the sub text
    sub_pattern = r'(<div class="sub">)([\d]+/[\d]+ 通过 · [\d]+%)(</div>)'
    subs = list(re.finditer(sub_pattern, content))
    retry_strs = [tc_retry_str, bf_retry_str, ha_retry_str]
    for i, m in enumerate(subs):
        if i < 3 and retry_strs[i]:
            new_sub = m.group(2) + retry_strs[i]
            content = content[:m.start(2)] + new_sub + content[m.end(2):]
            changed.append(f"sub-score {i} retry info")
    
    if changed:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"✅ {filename}: {', '.join(changed)}")
    else:
        print(f"  {filename}: no changes needed")
