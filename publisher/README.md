# BenchLocal 发布工具

这一目录把 BenchLocal 的原始运行结果转换为可审计的模型快照。它只读取
`runs/`，不会修改原始运行；归档采用复制并在复制后校验 SHA-256。

## 一次测试完成后的标准流程

在 `site/` 目录执行：

```powershell
npm run status
```

它会显示三个测试包的最新模型、分数和时间，并明确提示当前是否已经形成一轮完整的
TC → BF → HA 序列；运行新模式期间可用它避免提前提取。

三项都完成后执行：

```powershell
npm run extract -- --latest --variant thinking
```

`--latest` 会分别选择三个测试包中目录名最新且包含 `summary.json` 的运行，然后验证
三者确实属于同一个模型，并检查开始时间符合 TC → BF → HA 顺序；只要新模式还只跑完
部分测试，就会停止，避免把两种模式混在一起。

也可以显式指定三份结果：

```powershell
npm run extract -- `
  --toolcall ..\runs\toolcall-15\<run-id>\summary.json `
  --bugfind ..\runs\bugfind-15\<run-id>\summary.json `
  --hermes ..\runs\hermesagent-20\<run-id>\summary.json `
  --variant thinking
```

命令会：

1. 验证三份结果属于同一个模型且运行未取消。
2. 从顶层 `scores` 读取 BenchLocal 最终分数。
3. 从顶层 `resultsByModel` 读取逐题最终结果。
4. 按 `scenario_started` 统计 attempts。
5. 只对最终 `status === "pass"` 的题计算 `attempts - 1` 重试扣分。
6. 写入 `publisher/data/models/<slug>--<variant>.json`。
7. 将三份原始 summary 复制到 `../by-model/<模型名>/<variant>/` 并校验哈希。

`--variant` 是必填项，因为 BenchLocal 的模型 ID 通常不包含思考模式，工具不会猜测。
快照文件名固定为 `<slug>--<variant>.json`，因此 thinking 与 no-thinking 可以并存。

使用 `--no-archive` 可以只生成快照；使用 `--archive <path>` 可以覆盖默认归档根目录。
归档目标已存在时，只有内容哈希完全相同才会视为成功，避免静默覆盖。
同一 `<slug>--<variant>.json` 已指向其他 run 时也会停止；确认是正式重测后才使用
`--replace` 显式更新。

随后生成网站数据目录、合并后的首页卡片和快照驱动的详情页：

```powershell
npm run build
```

它会写入 `data/catalog.json`。当同一模型同时存在 thinking 与 no-thinking 快照时，
`data/comparisons.json` 会自动包含两种模式的分数、重试和专项差值。
构建会先执行 `enrich:editorial`：按模型品牌匹配 `icons/` 中的本地 LOGO，并仅为空白
`editorial.summary` / `editorial.verdict` 生成基于最终成绩的中英文摘要；人工填写的文案不会
被覆盖。需要重新生成所有自动文案时可显式执行 `npm run enrich:editorial -- --force`。

`build:homepage` 会按模型合并首页卡片：同时拥有 thinking 与 no-thinking 的模型只显示
一张双模式卡片。`build:pages` 同样按模型生成统一详情页，旧的 `-thinking.html` 链接会
生成到统一页面的兼容跳转。单独执行 `npm run build:data`、`npm run build:homepage` 或
`npm run build:pages` 仍然可用。

## 数据职责

- `suites.*.totalScore`：直接来自 BenchLocal 顶层最终 `scores`，不可由逐题简单平均替代。
- `suites.*.initialTotalScore`：首次 `run_finished` 时的分数，仅用于观察首轮表现。
- `results[].firstAttempt`：事件流里的第一次结果。
- `results[].score/status`：顶层 `resultsByModel` 的最终结果。
- `results[].attempts`：同题 `scenario_started` 的数量。
- `results[].retries`：最终通过时为 `attempts - 1`，否则为零。
- `scoring.maxScore`：TC×0.3 + BF×0.3 + HA×0.4。
- `scoring.effectiveScore`：maxScore − 成功题重试次数之和。
- `editorial`：保留给人工填写的模型资料、双语总结和结论。`metadata.displayName`
  是正式模型名，`metadata.modelFile` 是实际 GGUF 文件名；未提供 `logoPath` 时详情页
  会保留 LOGO 占位，后续把图片路径写入 `logoPath` 即可自动渲染。
- `publisher/data/model-sources.json`：按 slug 记录本次测试制品、上游模型与发布者链接。
  构建时会写入 `metadata.artifactUrl`、`upstreamUrl` 和 `publisherUrl`；无法确认的具体
  制品链接保持为空，不以作者主页或猜测地址代替。

## 发布前检查

```powershell
npm run build
npm run check
```

检查包括：

- 重试、汇总数、权重和双评分重新计算；
- 模型 slug、runId、SHA-256 和场景 ID 唯一性；
- 所有 HTML 内联 JavaScript 的语法；
- 本地链接、模型卡片、详情页和首页数据条数；
- 快照生成的详情页是否与当前目录数据一致；
- 重复 HTML id、Hero 模型数量和未定义 CSS 变量。

检查通过后再本地预览和提交。工具不会自动 commit、push 或发布。

## 旧站迁移

```powershell
npm run audit:migration
npm run migrate:unique
```

迁移审计用能力上限、实用得分、重试数和 TC/BF/HA 三项分数组成指纹，将 `by-model/`
归档与首页配置匹配。只有唯一匹配的完整归档才会自动写入规范化快照；缺包、已取消、
分数不一致或多解条目都会留在 `publisher/data/migration-audit.json` 等待处理。

首页的排序数据直接读取合并卡片的 `data-*` 属性，不再维护第二份 JavaScript 模型数组。
模式筛选会保留包含该模式的双模式卡片；排序则使用卡片中两种模式的最佳对应指标。
模型正式名称、GGUF 文件名、标签与 LOGO 来源统一记录在快照 `metadata` 中。

若 `by-model/` 归档不足以唯一匹配，可从完整 `runs/` 重建：

```powershell
npm run match:runs
npm run migrate:runs
npm run build
```

匹配器优先要求专项分、综合分、重试和最终结果数量全部一致；重复运行采用时间最紧密的
TC/BF/HA 组合。旧页面若使用逐题平均值，则仅在模型身份一致、48 小时内形成完整运行簇、
综合分差不超过 1.5 且各专项显示差不超过 3.1 时兼容匹配，并优先 TC → BF → HA 顺序。
规则、候选 runId 和拒绝原因写入 `publisher/data/run-matches.json`。

`npm run build` 会用已迁移快照生成 15 张模型卡片（当前对应 23 个配置）、目录和统一
详情页；`npm run check` 会检查首页、详情页及兼容跳转是否仍与快照一致。
