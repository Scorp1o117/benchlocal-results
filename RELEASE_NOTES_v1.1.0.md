# BenchLocal-Results V1.1.0

V1.1.0 在 V1.0 基础上加入 **Hy3-IQ1_M** 单模式评测结果，更新首页模型环、首页数据集硬件说明、详情页 metadata 与摘要文案，并新增 2026-07-20 更新日志条目。

## 本轮新增模型

- **Hy3-IQ1_M**：83.3 GB 的 IQ1_M 极低比特量化模型，单模式（default）完整结果。
  - 能力上限 94.4、实用得分 91.4
  - ToolCall 100 · BugFind 100 · HermesAgent 86
  - 50 题中最终通过 45 题，成功题累计重试 3 次
  - 采样：`temp=0.6 · top_p=0.9 · top_k=40`
  - 速度：In 50 t/s · Out 12 t/s
  - 运行硬件：AMD Ryzen™ AI Max+ 395

## 数据与展示

- 规范化快照：`publisher/data/models/hy3-iq1-m--default.json`
- 归档：`by-model/Hy3-IQ1_M/default/`，SHA-256 已校验
- 首页模型环新增 Hy3-IQ1_M orbit-node，LOGO 来自 `icons/hy3-iq1-m.png`
- 首页数据集硬件说明追加本轮运行环境（保留旧条目以便历史对照）
- 详情页 metadata 同步补全 size、speed、sampling、hardware
- 详情页 summary 与 verdict 采用基于本次数据的稳定版描述

## 发布前校验

```powershell
npm run build
npm run check
```

- `npm test`：4/4 通过
- `validate:data`：24 个变体快照全部合法
- `validate:generated`：catalog、comparisons 全部由最新快照生成
- `validate:pages`：16 个规范页面 + 7 个旧地址兼容跳转
- `validate:merged-homepage`：16 张合并卡片，计数 16 models / 24 configurations
- `validate:site`：0 警告，所有本地资源齐全