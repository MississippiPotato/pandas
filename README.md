# pandas 可视分析工作台

原生 JavaScript + D3.js 的中英双语 **pandas Visual Analysis Workbench**。用可视交互完成 pandas 风格的数据选择、清洗、统计和变换；支持自定义表格，NBA 是内置默认示例。**固定浅色界面**。浏览器使用 JavaScript 计算，等价 pandas 代码供导出复现；没有 Python 后端或上传服务。

访问：[GitHub Pages](https://MississippiPotato.github.io/pandas/) · [源代码](https://github.com/MississippiPotato/pandas)

本次 pandas 改造已获用户授权发布到上述 GitHub Pages 地址。运行版本、工作流结果与线上核验见 [交付记录](docs/DELIVERY.md)；此前 NBA 版本的发布记录单独保留。

## 可以做什么

- **Overview**：pandas 定位、进入工作台/导入数据主入口、六类任务与方法说明；NBA 快照与真实趋势作为示例。
- **NBA Explore**：球员、球队、时间与真实投篮空间；选区可正式提交并带到工作台。
- **Data Studio**：加载与查看、选择与排序、清洗与类型、分组与统计、关联与重塑、时间与窗口。方法和解释直接可见；详细参数/限制可展开，配置自动更新预览及等价代码。
- **Gallery**：11 种 D3 图形入口，使用当前数据并支持重新映射字段。

23 个注册变换：`filter`, `sort`, `dropna`, `fillna`, `dedup`, `cast`, `rename`, `select`, `derive`, `group`, `pivot_table`, `pivot`, `merge`, `concat`, `rolling`, `resample`, `cut`, `qcut`, `rank`, `cumsum`, `transform`, `melt`, `date_part`。异常值检查通过显式 IQR 筛选调用同一引擎。

所有变换先预览再提交。分组展示“拆分—计算—合并”、指标与输入样本数；缺失处理展示逐字段前后数量/比例和同坐标分布；关联展示两表、键、匹配、重复键和行数扩张；滚动展示排序后原始值与结果的同图对比。流程步骤显示任务与 pandas 方法，可查看参数、变化、图形和代码。

图形临时选择、尚未确认的配置与已应用数据明确区分；表格、统计和图形查询共享当前范围。CSV 分为已应用结果与临时选区；完整 Python 脚本只导出已应用的依赖流程。支持分析结果 / SVG / PNG / 流程 JSON / 项目包导出及 IndexedDB 本机保存。支持编辑、撤销、重做、依赖重算；切回源表另开分支后撤销，会返回该分支实际使用的输入。

## 本地运行

Node.js ≥22.12：

```sh
npm ci
npm run dev
npm test
npm run data:validate
npm run build
npm run preview
```

独立 pandas 对照只用于开发验收，不参与网站运行：

```sh
python -m pip install pandas==2.3.3 numpy==2.2.6
npm run test:pandas
```

GitHub Actions 在 `main` 推送后运行引擎测试、真实 pandas 对照、数据核验与 Vite 构建，仅将 `dist/` 部署到 Pages。构建基路径由 `PAGES_BASE` 控制；当前仓库为 `/pandas/`。

## 数据范围与语义

默认数据是 **2025 年 11 月常规赛有限历史快照**：219 场、30 队、498 名名单球员、5,698 条球员比赛名单记录（4,784 条实际出场）、438 条球队逐场记录、39,092 次投篮。不是整赛季、实时或生涯统计。

来源：SportsDataverse，上游 NBA.com/Stats。六张规范表、字段类型、资产 URL、字节数与 SHA-256 位于 [manifest](public/data/nba/2025-26-nov/manifest.json)。3 场 NBA 官方计分员 PDF 抽查共 81 项数值匹配；不代表逐条独立验证所有记录。

投篮球场叠加按 SportsDataverse 定义：单位 0.1 英尺，篮筐原点，不再次翻转主客方向。保留负坐标、原点与 6 次越过半场的投篮。点图最多显示 5,000 个确定性样本并保留边界/远投；区域统计、筛选与导出仍使用全量。缺失矩阵最多展示前 80 行/40 字段，类别条形图展示前 15 组，完整结果可导出。

SportsDataverse README 有 CC BY 4.0 标记，其软件 LICENSE 为 MIT；NBA 上游数据适用范围尚有单独条款。**再分发适用范围仍标记 `pending-upstream-review`**；教学用途与可下载事实不等于 NBA 授权。来源与核验边界见 [数据核验](docs/DATA_VERIFICATION.md)，网站说明中也保留披露。

## 实现边界

单次导入 ≤50 MiB、≤100,000 行、≤200 字段、≤5,000,000 单元格。CSV / TSV 使用严格 UTF-8；JSON 只接受扁平记录数组；XLSX 读取所选非空工作表及公式缓存值，不执行 Excel 公式，不支持旧 `.xls`。

这不是完整 pandas 兼容层。只支持白名单参数和安全表达式；不支持任意 Python/UDF、通用 MultiIndex、横向 concat、偏移/居中窗口或本地 DST 日历。滚动窗口按行，日期按 UTC，标准差默认 `ddof=1`。等频分箱的导出脚本明确重放记录的边界，避免浮点边界与原生 `pd.qcut` 的差异；透视结果使用显式平列辅助函数。

## 结构与验收

```text
src/core/       纯函数、统计、操作注册、Session / DAG / 历史、pandas 代码
src/data/       严格解析、类型与 NBA 适配
src/workers/    串行计算与一致的分析查询
src/services/   Worker 通信、文件解析
src/ui/         页面、操作表单、导入导出与恢复
src/charts/     D3 图形、刷选、SVG/PNG 导出
src/i18n/      中英文文案
public/data/    经过核验的有限演示快照
tests/         边界、关系、时间、回放与通用数据样例
```

操作元数据集中在 `src/ui/operation-catalog.js`；`src/core/operation-preview.js` 生成只读预览统计；`src/ui/preview-feedback.js` 与 `src/charts/operation-feedback.js` 呈现操作反馈。字段和可用图形由当前 schema 决定，通用分析不依赖 NBA 字段。原 `#/overview`、`#/studio`、`#/nba`、`#/gallery` 路由保留。

[交付与验收记录](docs/DELIVERY.md) · [50 项 pandas 功能映射](docs/PANDAS_COVERAGE.md) · [数据源核验](docs/DATA_VERIFICATION.md)

Phase 0/1 文档保留为历史设计与证据，当前实现以本 README 和交付记录为准。原始调研下载、浏览器输出和构建产物不进入发布包。
