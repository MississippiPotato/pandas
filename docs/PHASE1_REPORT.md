# Phase 1 · 数据引擎与本地验收

日期：2026-10-15。Phase 0已获用户同意；用户要求已落实为仅浅色：白/浅灰蓝背景、青绿强调，无主题切换或系统深色适配。原设计SVG与预览也已更新。

## 实现内容

- 原生ESM + Vite 8.3.4 + D3 7.9.0，package-lock锁定依赖。无前端框架、Python后端或第二图表库。
- 通用列式Dataset、稳定fieldId/rowId、只读源、严格CSV/TSV/JSON导入、类型推断/确认与显式coerce。
- 16种可执行操作：filter、sort、dropna、fillna、dedup、cast、rename、select、derive、group、pivot_table、pivot、merge、concat、rolling、resample。另有profile、describe/分位数、类别计数、duplicated、Pearson相关查询。
- 统一Session和DAG重放、预览/提交分离、undo/redo、上游编辑原子重算、源hash核对的流程导入/导出、CSV导出及pandas脚本生成。
- Worker串行接收变更命令，主线程请求版本隔离迟到响应；全量计算留在Worker，主线程接收前50行与画像。
- 浏览器验收页提供真实上传/字段类型确认、NBA表加载、基本清洗/筛选/分组入口、历史和下载；D3绘制真实缺失率。它是Phase 1验收入口，并非最终Dashboard或完整Studio。

## 结果与证据

| 验证 | 结果 | 位置 |
|---|---|---|
| 引擎与历史 | 33个测试通过：缺失/零/false/日期/引号/Unicode/主键/空表/关联扩张/重放/不可变性等 | `npm test`，tests/engine、tests/integration |
| 生成代码的独立执行 | 22个pandas对照案例通过；本机pandas **2.3.3**，不是最初引用文档的3.0.6 | output/phase1/pandas-parity.json 与逐案例.py |
| NBA规范化 | 6表，38项完整性/计数/统计公式/哈希校验通过 | public/data/nba/2025-26-nov/manifest.json；output/phase1/nba-validation.json |
| 实际CSV下载 | 分组结果A=5、B=20、缺失组=40，导出数据可读 | output/phase1/browser-export.csv |
| 浏览器交互 | 12项检查通过，pageerror为0，桌面/390px截图成功 | output/phase1/browser-validation.json |
| 构建 | Vite生产构建通过；Worker独立打包，data相对路径 | npm run build / dist |
| 仅浅色 | 根CSS固定color-scheme:light，无主题开关；浏览器模拟系统dark偏好仍浅色 | src/styles/tokens.css；浏览器检查脚本 |

浏览器检查用Playwright技能与本机Chrome；脚本为 `scripts/browser-verify.pw.js`，运行方法为Playwright CLI已打开本地页后 `run-code --filename scripts/browser-verify.pw.js`。记录保存在 `output/phase1/browser-cli.txt`；截图位于 `output/playwright/phase1-desktop.png` 与 `phase1-mobile.png`。这证明已演示的基础操作路径，不代表50项覆盖矩阵全部通过。

截图最初全页捕获超时，改为关闭动画的视口截图后成功。未使用渲染设计稿冒充运行截图。

## 性能实测

本机i9-13980HX、Node v22.15.0、100,000行×20列、1次cold+5次warm：

- 筛选warm最大值（本次5样本的p95取最大值）：约233ms。
- 分组warm最大值：约204ms。

记录包括质量报告和代码生成成本，见 `output/phase1/benchmark.json`。最初分组约1,260ms，改为按列及行索引聚合，移除了全表行对象物化。**这些是Node数据引擎测量，不是浏览器交互、首屏或公网性能。**

## 数据发现与未完成边界

- 默认快照：2025年11月219场、30队、498名名单内球员、5,698个球员比赛记录、438条球队比赛记录、39,092次投篮。
- 12条源出场时间含`:60`。保留minutes_raw，显式进位，并将每条原值/结果写入manifest；不能当作源文件已修正。
- 坐标单位/方向/篮筐原点未完成核验，球场仍禁用；保留全部真实raw坐标，没有虚构x_ft或裁掉远投。
- 尚未完成官方比赛结果外部独立抽查。现有统计证明冻结表内部一致，不代表全部NBA事实经独立验证。
- 公开再分发状态仍为pending-upstream-review；本地数据已生成，尚未创建仓库或部署Pages。
- 分组resample可计算但pandas代码标记unavailable；复杂参数拒绝执行或明确标记。pandas面板需要配套输入/helper定义，不是无前提的一行等价代码。
- 通用引擎当前在Worker中执行，但JSON解析/内建sort仍无法中途协作取消；后续Studio要接入终止Worker与源重建的取消体验。没有宣称全部性能/可访问性目标达成。

## 下一阶段

Phase 2把已通过计算验证的能力接成完整浅色Studio：字段画像与管理、清洗前后变化、复合条件构建器、可视分组/透视、双表关联/拼接、历史编辑与质量报告、流程导入界面。随后Phase 3再实现D3 brush与图表联动；NBA首页在核心操作链通过后制作。
