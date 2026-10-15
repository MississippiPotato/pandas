# NBA DataLab · 页面结构与设计系统

Phase 1 更新规格，2026-10-15；用户已审查通过Phase 0并要求仅浅色；不是完成的网页。配套 [DESIGN_BOARD.svg](DESIGN_BOARD.svg) 是静态布局审查图，所有图形为占位示意，不表示已加载NBA统计。

## 1. 视觉方向

采用 **Court & Lab**：仅浅色，以白色与浅灰蓝为基础、精细网格、青绿数据强调、蓝色比较对象、少量篮球暖橙。产品视觉围绕“观察数据→发现问题→做一次操作→看结果→保留流程”。首页突出篮球数据语境，工作台提供高密度但有层次的操作空间。

不依赖球员大照片或球队logo；自绘几何球场、线条与图例。背景避免持续动效，真正的数据图是视觉中心。桌面优先1440×900；最小桌面1024；移动390也能导入、选择字段、数字范围筛选、预览和导出。

## 2. 四页面与导航

| 页面 / hash route | 用户任务 | 首屏组成 | 可执行动作 / 数据口径 |
|---|---|---|---|
| Overview / `#/overview` | 理解默认数据并选择入口 | 文字品牌+真实赛季/月范围、3张关键卡、主趋势图、精选球员/球队比较、双入口 | 探索NBA/上传数据，点击趋势范围进入带同一source/node的Explore；卡片从引擎计算 |
| NBA Explore / `#/nba` | 回答球员/球队/时间/空间问题 | 球员/球队/趋势/投篮tabs；范围chips；主图+明细+统计侧栏 | 指标/队员选择、brush、窗口设置、FGM/FGA，发送当前节点到Studio |
| Data Studio / `#/studio` | 任意表完整分析 | 数据/字段左栏、联动图/表中心、操作右栏、流程底栏 | 导入多表、清洗、filter/group/pivot/join/time、预览提交、undo/redo、代码与导出 |
| Visualization Gallery / `#/gallery` | 选图表与字段并继续分析 | 图类型卡片、字段要求与说明、当前表预览 | 用当前数据打开Studio并带chartSpec；没有默认固定示例结果替代用户数据 |

来源/范围/已知限制作为全站可打开的“数据说明”抽屉，不另建空内容页面。数据管理、导入和配置导出集中在Studio，也可通过全局上传按钮进入，避免两套功能。

Overview只使用3张并列关键卡（比赛数、球员数、球队数；投篮数在加载后显示），每张都有范围和解释；缺数据用加载骨架或“未加载”，不用0代替。主趋势以真实日期和每日/每周比赛或得分统计构成，图表标题显示聚合口径。图的点击进入可继续操作的分析，而不只是跳页。

NBA专属场均/投篮预设都是公共引擎配置；NBA字段映射只放adapter。Studio当前任意表不符合球场角色时，球场入口显示所缺字段与坐标定义要求，不生成假球场图。

## 3. Data Studio 桌面结构

```text
┌ 全站导航  Overview · NBA Explore · Data Studio · Gallery  | 中文/EN ┐
├ 当前数据 · 范围 · 版本 | 导入 | 撤销 重做 | 导出                    ┤
├──────────────┬────────────────────────────────┬────────────────┤
│ 数据集 240px │ 统计摘要 / 已提交n / 临时选择n   │ 配置 288px     │
│ 多表列表     │                                │ 操作type       │
│ 字段列表     │ 主图（scatter/bar/pivot等）      │ 字段槽/参数    │
│ 类型/缺失率  │                                │ 解释/约束      │
│              │ 次图 histogram/missing/timeline │ 前后变化预览   │
│ 操作目录     │                                │ 取消 / 应用    │
│ 搜索/分类    │ 数据表分页  / 统计结果           │                │
├──────────────┴────────────────────────────────┴────────────────┤
│ 流程：源 → 清洗 → 范围 → 分组 → 透视  | 所选节点参数           │
│ 数据变化 / pandas 代码 / 质量报告                               │
└────────────────────────────────────────────────────────────────┘
```

1440宽：外边距24、gap16、左栏240、右栏288；中间可伸缩，图表min-width320。全站导航56px，工作工具条48px；中心图表约320–400px高，次图160–200px，表格最少200px；流程96–128px且可折叠。不得强行在900px高度内把所有文字压成9px。Studio采用区域滚动，顶部与导出操作固定可见。

点击字段先看到画像；配置面板只显示当前操作。空工作台提供“加载NBA默认数据”和“上传CSV/TSV/JSON”，以及支持的格式和规模，不先展示一屏没有作用的按钮。

## 4. 必须打通的交互细节

- **图形选择状态**：青绿轮廓+选区chips+“临时选择 n/N”条；灰色背景表示提交前总体；“应用筛选”与“清除选择”紧邻。零行结果保留条件和一键撤回，不清空操作历史。
- **清洗状态**：点missing条→右侧展示constant/mean/median/mode/drop→前后缺失率和分布→受影响行预览→用户应用。点击图不自动删除数据。
- **分组/透视**：字段既可拖放也可用原生选择器/键盘加入；显示keys/metric/agg。类别过多时给出缩小范围方案及实际类别数，不能偷偷取top10冒充全表。
- **关联**：选两表→映射复合键→选择how/validate→D3匹配条图+未匹配键/预计输出数→提交。输出行数扩张醒目显示；变换后名称后缀可编辑。
- **时间**：先选日期/排序/分组字段，后选粒度或行数window；显示UTC、min_periods与“按场次/行数”区别，不把5场平均写成5天平均。
- **异常值**：箱线图外点提供查看/保留/排除；预览IQR边界与样本数，不把NBA真实高得分自动当脏数据。
- **流程**：节点显示类型、参数摘要、before→after；点节点可查看结果、编辑/禁用；上游编辑失败以具体节点和字段定位，保留前次成功结果。
- **代码**：可复制pandas脚本与查看语义；unsupported参数明确说明。不以SQL或不可执行伪代码冒充pandas等价结果。
- **导出**：菜单区分当前已提交表、临时选区、分析结果、图表、流程配置；每项显示范围/行数。导出默认选择已提交表，避免用户无意导出临时选区。

## 5. Design tokens

| 类别 | token | 值 / 使用 |
|---|---|---|
| 背景 | bg-canvas / bg-surface / bg-raised | `#F5F7FB` / `#FFFFFF` / `#EEF3F8` |
| 边界 | border-subtle / border-active | `#D5DEE9` / `#0F766E` |
| 文本 | text-primary / secondary / muted | `#102139` / `#33465D` / `#52647B` |
| 品牌/选区 | accent-teal | `#0F766E`；选区使用浅青绿；实色按钮文字用白色 |
| 对比系列 | accent-blue | `#1D4ED8` |
| 篮球/警示 | accent-orange | `#B45309`；少量标签/预览警告 |
| 错误 | danger | `#B91C1C` + icon/文字；不靠红色单独表达 |
| 正文 | font-ui | Inter（选用时本地woff2锁许可）/system-ui，中文Microsoft YaHei/PingFang SC/Noto Sans SC fallback |
| 数字 | font-numeric | 同正文字体 + tabular-nums；code用系统monospace |
| 层级 | display/h1/h2/body/small | 40/28/20/14/12px；body line-height1.55；表格最低12px |
| 间距 | space | 4/8/12/16/24/32/48px |
| 圆角 | radius | 控件6px、卡片10px、抽屉12px；chip999px |
| 控件 | size | desktop36px常规按钮，重要操作40px；触屏主要目标44px |
| 动画 | motion | hover120ms、状态180ms、图形变换240ms；reduce-motion关闭非必要过渡 |

图表专用色：类别固定palette（teal/blue/orange/violet/pink/slate），可切至色觉友好方案；顺序数据用单向蓝青色阶；相关矩阵用围绕0对称的分歧色阶并固定−1…1。高基数使用“其他”汇总必须说明且提供完整表。篮球命中用实心圆，未中用叉号，同时颜色辅助，不能只用红绿。

用户已明确要求仅浅色。没有深色模式、主题切换按钮或按系统偏好自动变深色的逻辑；CSS固定 color-scheme: light。

## 6. 图表共同规范

每张图必须显示：问题型标题、当前输入表/范围、聚合函数、x/y单位、legend、n与null处理、Tooltip、数据来源入口、可用操作提示。所有数字来自selector/engine，不在HTML写死。

轴数字按locale格式化，内部计算保持原精度；显示舍入不参与统计。小样本命中率显示“命中/出手”及n，不以非常亮的色块暗示稳定结论。柱形数值轴通常从0开始；截断轴需明显说明。时间粒度、单位、百分比0–1/0–100转换保持一致。

chart lifecycle规划为 `create(container) / update(viewSnapshot,chartSpec) / resize() / destroy()`；destroy清除事件与观察器，切语言和页面不留下旧brush。scale域由提交态决定，selection只改变高亮/前景，防止交互漂移。SVG export包括标题/轴/图例；Canvas export要提供同范围PNG，SVG策略明确。

Gallery的bar、line、scatter、histogram、box、heatmap、corr、area与distribution共享同一字段role校验和D3模块。没有numeric字段时给出可用图或类型转换入口，不显示“生成成功”空图。

## 7. 中英一致性

zh-CN/en-US单一键体系，按common/data/operation/chart/nba拆资源；同一DOM/组件/逻辑。原始用户字段名不翻译，系统字段解释翻译；NBA缩写PTS/FG%保留且Tooltip解释。

错误对象保存code/params，不存中文消息，语言切换重新format。包括导入异常、tooltip、legend、aria、空态、加载、导出标题/来源文本都需覆盖。用Intl格式化数值/日期，ISO源日期避免时区偏移。

键集合必须完全相等；语言切换前后比较activeNodeId、sourceHash、rowIds、selectionDraft和historyCursor完全不变。英文长标签以换行/空间适配，不裁成无法理解的按钮。

术语：Dataset/数据集、Field/字段、Filter/筛选、Group & aggregate/分组聚合、Pivot/透视、Join/关联、Missing/缺失、Selection/选区、Apply/应用、Preview/预览、Rolling window/滚动窗口、Resample/时间重采样。

## 8. Responsive与无障碍

≥1280三栏；1024–1279左栏200px、右栏drawer；768–1023字段/配置切换drawer，中心主图与表上下堆叠；<768四页导航折成菜单，field/config full-height sheet，画布单列，分页表在自身区域横向滚动，页面不能横溢。

移动brush提供数字min/max输入的等价替代；所有拖拽有选择器替代，pivot槽/join键不用只允许鼠标拉线。键盘可完成导入、选字段、清洗、筛选、提交、undo与导出；焦点清晰，表单有label，结果更新用aria-live摘要，不为每个数据点狂刷消息。

对比目标普通正文≥4.5:1、图形/大字≥3:1；Phase0只有token计算，页面与hover/disabled实际对比待浏览器验证。tooltip支持键盘，Canvas提供文本概要/同范围表格。时间动画可暂停/减少。

## 9. 状态验收与视觉门槛

| 状态 | 应有内容 | 数据行为 |
|---|---|---|
| 初始空 | 默认NBA/上传入口、格式说明 | 没有装饰性假统计 |
| 加载/执行 | 明确数据/操作名、进度或等待、取消 | 旧结果标识；成功前不混新旧版本 |
| 预览 | before/after、受影响行/字段、取消/应用 | 原pipeline尚未变 |
| 选择 | n/N、chips、清除/应用 | 全联动同一viewSnapshot |
| 0行结果 | 条件说明、调整或撤销 | 不显示0%命中率等无分母数字 |
| 无支持字段 | 所需类型/字段，映射或转换入口 | 不造数据、不生成空的成功图 |
| 错误 | 文件/字段/节点定位与恢复入口 | 上个成功结果保留；失败未提交 |
| 超预算 | 实际与支持规模、可缩小方式 | 不截断后假装全量分析 |

Phase2以真实非NBA分析流程的桌面/移动截图检查密度与可用性；Phase4检验首页/NBA/Gallery完整度；Phase5对中文英文、1440/1024/390、hover/focus/loading/error/empty/selection逐项验收。截图仅证明布局，结果正确性用行集合与黄金对照证明。

