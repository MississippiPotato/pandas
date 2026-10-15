# NBA DataLab

原生 JavaScript + D3.js 的中英双语可视化分析工作台。**固定浅色界面**。所有用户数据在浏览器处理，无 Python 后端，无上传服务。

访问：[GitHub Pages](https://MississippiPotato.github.io/pandas/) · [源代码](https://github.com/MississippiPotato/pandas)

## 可以做什么

- **Overview**：从真实记录计算比赛、球队、球员与得分趋势；球员场均榜至少出场 5 场。
- **NBA Explore**：球员、球队、时间与真实投篮空间；选区可正式提交并带到工作台。
- **Data Studio**：导入 CSV / TSV / 扁平 JSON / XLSX，确认类型，多表管理、画像、清洗、筛选、分组、透视、关联、拼接、时间统计及完整操作历史。
- **Gallery**：11 种 D3 图形入口，使用当前数据并支持重新映射字段。

23 个注册变换：`filter`, `sort`, `dropna`, `fillna`, `dedup`, `cast`, `rename`, `select`, `derive`, `group`, `pivot_table`, `pivot`, `merge`, `concat`, `rolling`, `resample`, `cut`, `qcut`, `rank`, `cumsum`, `transform`, `melt`, `date_part`。异常值检查通过显式 IQR 筛选调用同一引擎。

所有变换先预览再提交。图形临时选择、已提交数据与原始数据分开保存；统计、分页与导出使用完整行集。支持 CSV / 分析结果 / SVG / PNG / 流程 JSON / 项目包 / 可运行 pandas 脚本导出，以及 IndexedDB 本机保存。操作节点可编辑、撤销、重做和依赖重算。

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

[交付与验收记录](docs/DELIVERY.md) · [50 项 pandas 功能映射](docs/PANDAS_COVERAGE.md) · [数据源核验](docs/DATA_VERIFICATION.md)

Phase 0/1 文档保留为历史设计与证据，当前实现以本 README 和交付记录为准。原始调研下载、浏览器输出和构建产物不进入发布包。
