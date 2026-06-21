#!/usr/bin/env python3
"""
Precise matching: for each (model, pack), scan ALL runs and find the one 
whose final score matches the website score exactly.
Then count retries from that specific run.
"""
import json, os, re
from collections import defaultdict

base = r"C:\Users\15403\.benchlocal\runs"
packs = ["toolcall-15", "bugfind-15", "hermesagent-20"]

def get_final_score_and_retries(path):
    """Get final score (from run_finished scores) and retry count from summary.json."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    # Final score: from run_finished event's scores field
    final_score = None
    for ev in reversed(data["events"]):
        if ev["type"] == "run_finished":
            scores = ev.get("scores", {})
            for k, v in scores.items():
                final_score = v["totalScore"]
            break
    
    # Retries: count per scenario
    seen = {}
    for ev in data["events"]:
        if ev["type"] == "scenario_result":
            sid = ev["scenarioId"]
            if sid not in seen:
                seen[sid] = []
            seen[sid].append(ev["result"]["score"])
    
    retry_pass = 0
    total_retries = 0
    for sid, scores in seen.items():
        runs = len(scores)
        if runs > 1 and scores[-1] == 100:
            retry_pass += 1
            total_retries += (runs - 1)
    
    return final_score, total_retries, retry_pass, len(seen)

# Website models with exact scores
website_models = [
    {"name": "Step-3.7-Flash (思考)",        "search": "Step-3.7-Flash-APEX-I-Mini",   "tc": 100, "bf": 87, "ha": 81,  "orig": 88.8},
    {"name": "Nex-N2-Mini (思考)",           "search": "Nex-N2-mini-abliterated",       "tc": 93,  "bf": 88, "ha": 81,  "orig": 87.2},
    {"name": "Qwen3.6-35B (无思考)",         "search": "Qwen3.6-35B-A3B-uncensored",   "tc": 83.3,"bf": 80.7,"ha": 76, "orig": 79.6},
    {"name": "Qwen3.6-35B (思考)",           "search": "Qwen3.6-35B-A3B",              "tc": 100, "bf": 88.7,"ha": 76.5,"orig": 87.2},
    {"name": "Gemma-4 (无思考)",             "search": "gemma-4-26B-A4B-it-qat",       "tc": 96.7,"bf": 86, "ha": 84.8,"orig": 88.7},
    {"name": "Gemma-4 (思考)",               "search": "gemma-4-26B-A4B-it-qat",       "tc": 93.3,"bf": 96, "ha": 87,  "orig": 91.6},
    {"name": "QwenPaw-Flash-9B (思考)",      "search": "QwenPaw-Flash-9B-MTP-heretic", "tc": 100, "bf": 84, "ha": 80,  "orig": 87.2},
    {"name": "Qwen3.6-27B (无思考)",         "search": "Qwen3.6-27B",                  "tc": 96.7,"bf": 84.2,"ha": 82.8,"orig": 87.4},
    {"name": "Qwen3.6-27B (思考)",           "search": "Qwen3.6-27B",                  "tc": 100, "bf": 93.3,"ha": 84.8,"orig": 91.9},
    {"name": "DeepSeek-V4-Flash (API)",      "search": "deepseek-v4-flash-free",        "tc": 100, "bf": 93.3,"ha": 90,  "orig": 94.0},
]

# Pre-scan all runs: pack -> [(label, dirname, path)]
all_runs = defaultdict(list)
for pack in packs:
    pack_dir = os.path.join(base, pack)
    for d in sorted(os.listdir(pack_dir), reverse=True):
        sf = os.path.join(pack_dir, d, "summary.json")
        if not os.path.isfile(sf):
            continue
        with open(sf, "r", encoding="utf-8") as f:
            raw = f.read()
        m = re.search(r'"label":\s*"([^"]+)"', raw)
        if m:
            all_runs[pack].append((m.group(1), d, sf))

# Process each model
results = []

for wm in website_models:
    print(f"\n{'='*60}")
    print(f"  {wm['name']}")
    print(f"{'='*60}")
    
    pack_results = {}
    ok = True
    
    for pack in packs:
        target = wm[pack.replace("toolcall-15","tc").replace("bugfind-15","bf").replace("hermesagent-20","ha")]
        key = pack.split("-")[0][:2]  # tc, bf, ha
        
        found = False
        for rlabel, dname, rpath in all_runs[pack]:
            if wm["search"].lower() in rlabel.lower():
                score, retries, rp, nq = get_final_score_and_retries(rpath)
                if score is not None and abs(score - target) < 0.5:
                    pack_results[key] = {"score": score, "retries": retries}
                    print(f"  ✅ {pack}: score={score}, retries={retries} [{dname[:45]}]")
                    found = True
                    break
        
        if not found:
            print(f"  ❌ {pack}: 未找到 score={target} 的 run")
            ok = False
    
    if ok:
        total_r = sum(v["retries"] for v in pack_results.values())
        adj = wm["orig"] - total_r
        results.append({
            "name": wm["name"],
            "tc": pack_results["tc"]["score"],
            "bf": pack_results["bf"]["score"],
            "ha": pack_results["ha"]["score"],
            "orig": wm["orig"],
            "tc_r": pack_results["tc"]["retries"],
            "bf_r": pack_results["bf"]["retries"],
            "ha_r": pack_results["ha"]["retries"],
            "total_r": total_r,
            "adjusted": adj,
        })
        print(f"  → 原始={wm['orig']}, 重试扣分=-{total_r}, 调整后={adj}")

# Final ranking
results.sort(key=lambda x: x["adjusted"], reverse=True)

print(f"\n\n{'='*90}")
print(f"  🏆 最终排行榜（重试扣分后，每次重试 -1 分）")
print(f"{'='*90}")
print(f"{'#':<3} {'模型':<35} {'TC':>5} {'BF':>5} {'HA':>5} {'原始':>6} {'扣分':>5} {'调整后':>7}")
print("─" * 82)
for i, r in enumerate(results, 1):
    print(f"{i:<3} {r['name']:<35} {r['tc']:>5.1f} {r['bf']:>5.1f} {r['ha']:>5.1f} {r['orig']:>6.1f}  -{r['total_r']:<3} {r['adjusted']:>7.1f}")

print(f"\n重试扣分明细:")
for r in results:
    if r['total_r'] > 0:
        parts = []
        if r['tc_r']: parts.append(f"TC-{r['tc_r']}")
        if r['bf_r']: parts.append(f"BF-{r['bf_r']}")
        if r['ha_r']: parts.append(f"HA-{r['ha_r']}")
        print(f"  {r['name']}: {' + '.join(parts)} = -{r['total_r']}分")
    else:
        print(f"  {r['name']}: 0 次重试 ✨")
