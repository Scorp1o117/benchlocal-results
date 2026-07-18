# BenchLocal-Results Runbook

> 适用版本：V1.0+
>
> 工作目录：`C:\Users\15403\.benchlocal`
>
> 网站仓库：`C:\Users\15403\.benchlocal\site`

本文档是 BenchLocal 测试完成后收集数据、生成网站和发布版本的标准流程。日常更新应使用 `publisher/` 工具，不再手工统计重试、复制 summary、维护首页模型数组或批量替换 HTML。

## 1. 目录职责

```text
C:\Users\15403\.benchlocal\
├── runs\                 # BenchLocal 原始运行，按测试包保存
├── by-model\             # 按模型和模式归档的原始 summary
└── site\                 # benchlocal-results GitHub 仓库
    ├── publisher\data\models\  # 网站唯一数据源：规范化快照
    ├── publisher\data\model-sources.json
    ├── data\             # 构建生成的目录与模式对比数据
    ├── models\           # 构建生成的详情页和旧地址跳转
    ├── icons\            # 本地品牌与模型 LOGO
    ├── assets\           # 本地测试方法视觉资源
    └── screenshots\      # README 当前版本截图
```

数据安全原则：

- `runs/` 是原始事实，不修改、不清理。
- `extract` 只读取原始运行；归档采用复制，并在复制后校验 SHA-256。
- 规范化快照是网站内容的唯一数据源，不直接修改生成后的首页分数或详情页表格。
- 正式重测覆盖同一模型同一模式时，必须显式使用 `--replace`。

## 2. 每轮测试顺序

同一模型、同一模式按以下顺序完成：

1. ToolCall-15
2. BugFind-15
3. HermesAgent-20
4. 完成必要重试
5. 确认该模式的三套运行全部结束后再提取

思考与无思考是两轮独立序列。不要在第一种模式尚未完成三套测试时启动并混入第二种模式。

测试期间可随时查看最新状态：

```powershell
cd C:\Users\15403\.benchlocal\site
npm run status
```

只有输出 `Ready: latest runs form one TC → BF → HA sequence.` 后，才可使用 `--latest`。

## 3. 提取与归档

### 自动选择最新完整运行

```powershell
npm run extract -- --latest --variant thinking
```

无思考模式：

```powershell
npm run extract -- --latest --variant no-thinking
```

`--variant` 必填。BenchLocal 模型 ID 通常不能可靠区分思考模式，工具不会猜测。

### 显式指定历史运行

当最新目录不是目标运行时，显式传入三份 summary：

```powershell
npm run extract -- `
  --toolcall ..\runs\toolcall-15\<run-id>\summary.json `
  --bugfind ..\runs\bugfind-15\<run-id>\summary.json `
  --hermes ..\runs\hermesagent-20\<run-id>\summary.json `
  --variant thinking
```

提取器会自动：

1. 确认三份结果属于同一模型且运行未取消。
2. 确认开始时间符合 TC → BF → HA。
3. 从顶层 `scores` 读取 BenchLocal 最终专项分。
4. 从顶层 `resultsByModel` 读取逐题最终结果。
5. 按 `scenario_started` 数量统计 attempts。
6. 仅对最终通过题计算 `attempts - 1` 重试扣分。
7. 写入 `publisher/data/models/<slug>--<variant>.json`。
8. 复制三份 summary 到 `by-model/<模型>/<variant>/` 并校验哈希。

若同一快照已经指向其他 run，提取器会停止。确认属于正式重测后使用：

```powershell
npm run extract -- --latest --variant thinking --replace
```

## 4. 核对模型资料

打开新生成的快照，确认：

- `metadata.displayName`：模型正式名称。
- `metadata.modelFile`：实际测试的 GGUF 文件名。
- `metadata.size`、量化、温度、Top-p、Top-k 和速度数据。
- `metadata.logoPath`：优先使用 `icons/` 内的本地文件。
- `editorial.summary`、`editorial.verdict`：自动文案是否准确；人工文案优先，不会被普通构建覆盖。

来源链接统一维护在：

```text
publisher/data/model-sources.json
```

链接原则：

- `artifactUrl` 使用本次实际测试制品的具体页面。
- `upstreamUrl` 使用能确认的上游模型页面。
- 仅 SC117 或确有必要时填写 `publisherUrl`。
- 无法确认的链接留空，不用作者主页或猜测地址替代。

LOGO 原则：

- 同一品牌只保留一份代表性本地 LOGO。
- 优先透明背景 PNG/SVG；不要为了统一外观强制套方框。
- 新增图片后检查浅色背景和深浅渐变区域的可读性。

## 5. 构建网站

```powershell
npm run build
```

构建顺序：

1. 为缺少文案的快照生成中英文摘要，并匹配本地 LOGO。
2. 生成 `data/catalog.json` 和 `data/comparisons.json`。
3. 按模型合并首页卡片。
4. 按模型生成统一详情页。
5. 为旧 `-thinking.html` 等地址生成兼容跳转。

同一模型拥有 thinking 与 no-thinking 时，只显示一张首页卡片和一个详情页，两种模式数据仍分别完整保存。

## 6. 发布前门禁

每次发布必须执行：

```powershell
npm run build
npm run check
```

`check` 应全部通过，并至少确认：

- 规范化快照、run ID、场景 ID 和 SHA-256 合法且唯一。
- 能力上限、重试和实用得分可以确定性重算。
- 生成数据、首页与详情页和当前快照一致。
- 本地 HTML 链接、模型卡片、详情页和兼容跳转完整。
- 没有长尾浮点数、重复 HTML ID 或脚本语法错误。
- 图片具有 alt，外部新窗口链接具有安全属性。
- 运行时没有远程字体、图片或脚本依赖。

可选外链检查：

```powershell
npm run audit:external
```

Hugging Face 的 `429` 通常是临时限流，只警告；明确的 `404/410` 必须修复。

## 7. 本地预览

不要直接以 `file://` 作为最终验证方式。启动本地 HTTP 服务：

```powershell
cd C:\Users\15403\.benchlocal
python -m http.server 8765 --bind 127.0.0.1 --directory site
```

打开 `http://127.0.0.1:8765/`，至少检查：

- 首页首屏、模型环、聚光模型和排行榜。
- 全部/思考/无思考筛选以及各排序项。
- 新模型 LOGO、名称、GGUF 文件名和来源链接。
- 双模式切换、分数长条、50 题表格和展开项。
- 中文/英文切换及刷新后的语言保持。
- 桌面和窄屏布局；系统减少动态效果时页面仍可用。
- 浏览器控制台没有错误，本地资源没有 404。

页面截图仅保留当前版本需要的 `hero.png`、`leaderboard.png`、`detail.png`；历史截图移出仓库归档。

## 8. V1 计分口径

```text
能力上限 = ToolCall × 0.3 + BugFind × 0.3 + HermesAgent × 0.4
实用得分 = 能力上限 - 所有最终通过题的额外重试次数
```

- 专项分使用 summary 顶层 `scores`，不能从逐题结果简单平均。
- 最终逐题结果使用顶层 `resultsByModel`，不能把第一次 attempt 当成最终结果。
- attempts 使用 `scenario_started` 事件数量。
- 首次通过不扣分；重试后通过每额外尝试一次扣 1 分。
- 最终未通过的题不重复扣除重试成本。
- UI 分数统一格式化，禁止直接展示浮点长尾。

## 9. GitHub 正式发布

发布前确认工作区只包含本轮内容：

```powershell
git status -sb
git diff --check
git diff --stat
```

然后提交并推送：

```powershell
git add --all
git commit -m "release: BenchLocal-Results v1.0.0"
git push origin main
git tag -a v1.0.0 -m "BenchLocal-Results v1.0.0"
git push origin v1.0.0
```

使用 `RELEASE_NOTES_v1.0.0.md` 创建对应 GitHub Release。发布后确认：

- GitHub Actions 验证通过。
- GitHub Pages 已部署提交对应版本。
- `https://scorp1o117.github.io/benchlocal-results/` 显示新版首页。
- 新详情页、旧地址跳转、CSS、JS、图片均返回成功。
- README 截图和 Release 链接显示正常。

不要在检查失败时创建标签或 Release；修复后重新运行完整门禁。

## 10. 旧数据迁移

仅在导入旧站模型时使用：

```powershell
npm run audit:migration
npm run migrate:unique
```

若 `by-model/` 不足以唯一匹配，可从完整 `runs/` 重建候选：

```powershell
npm run match:runs
npm run migrate:runs
npm run build
npm run check
```

迁移报告和候选理由分别保存在：

- `publisher/data/migration-audit.json`
- `publisher/data/run-matches.json`

存在多解、缺包、取消运行或分数不一致时，不要强行自动迁移。

## 11. 禁止事项与常见故障

- 不用正则或字符串替换批量修改生成 HTML、CSS 或 JS 数据数组。
- 不手工维护首页第二份模型排序数组；首页排序直接读取卡片数据。
- 不从事件中的中间 `run_finished` 分数代替顶层最终 `scores`。
- 不在思考/无思考三套测试混合时使用 `--latest`。
- 不覆盖或清理 `runs/` 原始数据。
- 不把无法确认的模型主页当作具体测试制品链接。
- 不在 `npm run check` 失败或页面未预览时推送发布。

若页面数据不正确，按以下顺序定位：

1. 检查对应规范化快照。
2. 检查快照记录的 run ID 和原始 summary。
3. 运行 `npm run build` 重新生成页面。
4. 运行 `npm run check` 查看具体一致性错误。
5. 最后才检查 CSS 或浏览器渲染；不要先手改生成 HTML。

更详细的命令参数与数据字段定义见 [`publisher/README.md`](publisher/README.md)。
