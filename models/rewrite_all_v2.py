#!/usr/bin/env python3
"""Rewrite all summaries - handle both formats."""
import re, os

models_dir = r"C:\Users\15403\.benchlocal\site\models"

new_summaries = {
    "qwen36-35b.html": (
        "Qwen3.6-35B 无思考版调整后 73.5 分（原始 90.5，重试 17 次）。TC=97、BF=94、HA=83，三项子分都不低，但 17 次重试拉低了最终成绩。基础知识扎实，简单题秒杀，复杂场景需要多次尝试。",
        "一句话评价：不爱动脑的学霸——基础题秒杀，复杂题需要反复尝试，17次重试是最大扣分项。"
    ),
    "qwen36-35b-thinking.html": (
        "Qwen3.6-35B 思考版调整后 81.2 分（原始 87.2，重试 6 次）。ToolCall 满分 100，BugFind 88.7，思考模式提升了工具调用和 debug 能力。重试仅 6 次，稳定性不错。",
        "一句话评价：突然开窍的学霸——思考模式让工具调用从 83.3 飙到 100，但 HA-14 反而不如无思考版。"
    ),
    "gemma4-26b.html": (
        "Gemma-4 无思考版调整后 82.7 分（原始 88.7，重试 6 次）。HermesAgent 84.8 是所有模型中最高的，Agent 场景综合能力强。14.4GB 体积适中，MoE 架构高效。",
        "一句话评价：闷声发大财——HA 全场最高但没人注意，Agent 能力被低估的选手。"
    ),
    "gemma4-26b-thinking.html": (
        "Gemma-4 思考版调整后 83.6 分（原始 91.6，重试 8 次）。BugFind 96 分全场最高，BF-10 Trap 题是唯一通过的模型。HermesAgent 87 分同样全场最高。思考模式让 debug 和 Agent 能力大幅提升。",
        "一句话评价：黑马之王——BugFind 全场最高、HA 全场最高，思考模式的天花板级表现。"
    ),
    "qwenpaw-flash-9b.html": (
        "QwenPaw-Flash-9B 调整后 64.4 分（原始 88.4，重试 24 次）。ToolCall 满分 100，90.3 t/s 输出速度全场最快。但 9B 参数量天花板明显，BugFind 和 HA 都需要大量重试（24次），稳定性不足。",
        "一句话评价：经济适用型——7.9GB 体积、90.3t/s 全场最快，但 24 次重试暴露了 9B 参数量的天花板。"
    ),
    "qwen36-27b.html": (
        "Qwen3.6-27B 无思考版调整后 84.4 分（原始 87.4，重试 3 次）。仅 3 次重试就拿到原始分，稳定性全场最佳之一。11.9GB IQ3_M 量化体积全场最小，ToolCall 96.7、BugFind 84.2、HA 82.8 三项均衡。",
        "一句话评价：闷声干大事——11.9GB 最小体积、仅 3 次重试、三项均衡，稳定性和性价比兼得。"
    ),
    "qwen36-27b-thinking.html": (
        "Qwen3.6-27B 思考版调整后 73.9 分（原始 91.9，重试 18 次）。原始分极高但 BugFind 重试了 14 次，严重拉低调整后成绩。ToolCall 满分、HA 84.8，思考模式让部分能力提升但稳定性下降。",
        "一句话评价：终极答案的代价——原始 91.9 分全场最高，但 18 次重试让调整后仅 73.9。"
    ),
    "dsv4-flash.html": (
        "DeepSeek-V4-Flash 调整后 85.0 分（原始 94.0，重试 9 次）。作为 API 大模型，284B MoE（13B 激活）在参数量和训练数据上远超本地小模型，成绩在预期范围内。ToolCall 满分、BF 93.3、HA 90，三项都很强。",
        "一句话评价：API 大模型的正常水平——284B 参数量的优势明显，本页成绩仅供参考。"
    ),
}

for filename, (main_text, final_text) in new_summaries.items():
    path = os.path.join(models_dir, filename)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Pattern 1: has <p class="final">
    m1 = re.search(r'(<div class="roast-conclusion">\s*<p>)(.*?)(</p>\s*<p class="final">)(.*?)(</p>)', content, re.DOTALL)
    if m1:
        content = content[:m1.start(2)] + main_text + content[m1.end(2):m1.start(4)] + final_text + content[m1.end(4):]
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"✅ {filename}: pattern1 rewritten")
        continue
    
    # Pattern 2: only <p> without class="final"
    m2 = re.search(r'(<div class="roast-conclusion">\s*<p>)(.*?)(</p>)', content, re.DOTALL)
    if m2:
        # Replace with main + final in single <p>
        combined = main_text + " " + final_text
        content = content[:m2.start(2)] + combined + content[m2.end(2):]
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"✅ {filename}: pattern2 rewritten")
    else:
        print(f"❌ {filename}: no pattern found")
