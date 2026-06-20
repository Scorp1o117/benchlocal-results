<div align="center">
  <h1>⚡ BenchLocal 模型测试数据库</h1>
  <p>基于 <a href="https://github.com/stevibe/BenchLocal">BenchLocal</a> 的本地模型基准测试成绩展示</p>
  <p><a href="https://scorp1o117.github.io/benchlocal-results/">🌐 在线查看</a></p>
</div>

---

## 📊 测试概览

基于 BenchLocal 桌面应用，在同一硬件环境下对多个 LLM 模型进行本地推理基准测试。

| 测试项目 | 题数 | 说明 |
|----------|------|------|
| [ToolCall-15](https://github.com/stevibe/ToolCall-15) | 15 | 工具调用测试，覆盖参数提取、多轮上下文、并行调用等 |
| [BugFind-15](https://github.com/stevibe/BugFind-15) | 15 | 跨语言代码调试，含 Trap 陷阱题，难度 Easy~Expert |
| [HermesAgent-20](https://github.com/stevibe/HermesAgent-20) | 20 | Agent 场景测试，覆盖记忆管理、技能创建、调度投递等 |

**加权总分** = ToolCall×0.3 + BugFind×0.3 + HermesAgent×0.4

**测试标准**：错题可不断重试，直到多次重试后分数不再增加为止。

## 🏆 模型排行榜

| # | 模型 | 总分 | ToolCall | BugFind | HermesAgent | 备注 |
|---|------|------|----------|---------|-------------|------|
| 1 | DeepSeek-V4-Flash (思考·API) | **94.0** | 100 | 93.3 | 90 | OpenCode API，作为参考 |
| 2 | Qwen3.6-27B (思考) | 91.9 | 100 | 93.3 | 84.8 | IQ3_M 量化 |
| 3 | Gemma-4 (思考) | 91.6 | 93.3 | 96 | 87 | Q4_K_XL 量化 |
| 4 | Gemma-4 (无思考) | 88.7 | 96.7 | 86 | 84.8 | |
| 5 | Qwen3.6-27B (无思考) | 87.4 | 96.7 | 84.2 | 82.8 | |
| 6 | Qwen3.6-35B (思考) | 87.2 | 100 | 88.7 | 76.5 | MoE (3B active) |
| 7 | QwenPaw-Flash-9B (思考) | 87.2 | 100 | 84 | 80 | |
| 8 | Qwen3.6-35B (无思考) | 79.6 | 83.3 | 80.7 | 76 | |
| 9 | Step-3.7-Flash (思考) | 79.5 | 93 | 78 | 70 | 198B MoE (11B active) |
| 10 | Nex-N2-Mini (思考) | 75.7 | 90 | 68.7 | 71 | |

## 🔧 测试环境

- **硬件**：RTX 5070 Ti 16GB + 128GB RAM，MoE模型部分专家层offload到CPU
- **推理后端**：llama.cpp
- **模型下载**：[HF: SC117](https://huggingface.co/SC117)

## 📁 文件结构

```
├── index.html              # 首页（排行榜 + 排序筛选）
├── models/                 # 模型详情页
│   ├── step37-flash.html
│   ├── n2mini.html
│   ├── qwen36-35b.html
│   ├── qwen36-35b-thinking.html
│   ├── gemma4-26b.html
│   ├── gemma4-26b-thinking.html
│   ├── qwenpaw-flash-9b.html
│   ├── qwen36-27b.html
│   ├── qwen36-27b-thinking.html
│   └── dsv4-flash.html
└── icons/                  # 模型图标（@lobehub/icons）
```

## 🚀 本地开发

```bash
git clone https://github.com/Scorp1o117/benchlocal-results.git
cd benchlocal-results
# 用任意 HTTP 服务器打开
python -m http.server 8000
```

## 📄 License

MIT
