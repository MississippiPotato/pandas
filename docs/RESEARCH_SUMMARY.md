# Phase 0 · 调研结论与技术决策

核验日期：2026-10-15。结论分为“原资料主张”“本次实测”“实施决策”；规划不计为已实现。

## 1. 初始目录递归盘点

初始 `3/` 只有两个文件，无 `research/`、`CODEX_BRIEF.md`、源代码、package.json、数据、AGENTS.md 或 Git 元数据。父目录及盘根未发现适用 AGENTS.md。

| 实际文件 | 大小 | SHA-256 | 阅读范围 |
|---|---:|---|---|
| `codex_brief.txt` | 18,958 bytes | `7e2362349ed526ff053b3d9383e0e5da6a05b251a61aa93d0dddc925b457cf5d` | 全文，0–16 节 |
| `deep-research-report.md` | 72,451 bytes | `b8f643880548b57021aaa705ac22b53e8a27e84ba1672974a94897b193d3b1d0` | 全部 2,824 行，含附录与参考链接 |

新增 `research/evidence/` 为本次外部资料核验结果。没有未读取的用户提供 PDF、Excel、嵌套调研目录或其他附件。报告内 `turnXXviewXX` 引用标记不能直接还原网页，已从其明确 URL 重新访问关键一手来源。

## 2. 完整报告的处理记录

| 原报告行号 | 内容 | 结论与处理 |
|---|---|---|
| 1–98 | 摘要、技术栈、工时与许可 | 接受通用分析工作台定位；替换框架栈；不沿用 110–150 小时估计 |
| 99–367 | 数据来源、四张表、Kaggle、NBA FAQ | SportsDataverse 资产真实可下载；但逐场文件语义存在重大错误，见下文 |
| 369–553 | 关系模型、示例 schema、派生汇总 | 保留关系模型；示例 `DEMO0001` 不能作为生产事实；人物身高体重不自动补造 |
| 555–936 | pandas 映射、筛选、聚合、透视、关联、窗口、清洗 | 全部进入覆盖矩阵；将 read-only 分析与数据变换区分；表达式采用安全 AST |
| 938–1180 | 图表、投篮、雷达、相关与联动 | 全部用 D3；优先散点、直方图、透视和联动；投篮坐标先验真；雷达后置 |
| 1182–1443 | 信息架构、工作台、模板库、导出 | 按任务书统一为 Overview、NBA Explore、Data Studio、Gallery；数据管理并入 Studio |
| 1445–1764 | DuckDB/Pyodide/框架/后端/部署 | 统一操作模型与 Worker 思路保留；执行层替换为自研 JavaScript 纯函数；静态 GitHub Pages |
| 1766–2065 | 双语、术语、布局、五套配色、无障碍 | 单一组件逻辑与资源字典；用户要求仅浅色，采用白色/浅灰蓝背景、青绿强调；不提供主题切换；不用双套页面 |
| 2067–2409 | 八周计划、MVP、黄金测试、演示 | 用任务书 Phase 0–5 重排；关联和时间序列提前到 NBA 专题前，避免最后补核心功能 |
| 2411–2679 | 风险、字段映射、砍功能顺序 | 保留源锁、性能预算、字段角色映射；不宣称有限快照自动解决上游许可问题 |
| 2681–2824 | 课程定义、全部参考资源、最终路线 | 采用“图形参与分析”定位；最终路线按任务书改写；无 React/ECharts/Parquet 必选依赖 |

## 3. 数据核验修正

1. `player_game_logs_2026.csv`：2,630 行、31 列，**没有 person_id/player_id/player_name**；`min` 包含 240 等球队分钟。实际是球队逐场记录，与 release 文案“一球员一比赛”不符。2025 文件同样如此。不得用于球员平均、球员排名或球员关联。
2. 改用 `player_boxscores_2026.csv`：34,786 行、37 列，有 person_id，`game_id + person_id` 无重复；`minutes` 为 `45:15` 一类时长；需关联 schedule 获取日期。
3. `player_season_stats_2026.csv`：9,744 行、210 列，混合 six measure_type、two per_mode 和两种 season_type。只有 `base + pergame + regular-season` 的 582 行适合该语义的赛季均值展示；不能直接对整表求和/均值。
4. `rosters_2026.csv`：495 行，`season_type` 的值是球队 ID，明显异常；球员覆盖小于逐场表。不作为主维表来源，也不默认启用身高体重、年龄分析。
5. `shots_2026.csv`：234,876 行、19 列，有真实坐标但没有事件主键。逐投篮保留行级身份，不把相同坐标/时钟视为必然重复。
6. schedules 含 preseason/all-star/play-in/nba-cup/playoffs。所有事实表应由 schedule 的 `game_id` 统一确定时间范围与比赛类型，不能混用源字段猜测。
7. 本次 shots → schedule/team box/player box 外键未匹配数均为 0；全部 2,644 个 team-game 的投篮 FGA/FGM 汇总与 team box 一致。此结果证明特定冻结文件内部一致，不能替代逐场官方结果独立验证。

证据：[data-audit.json](../research/evidence/data-audit.json)、[source-lock.json](../research/evidence/source-lock.json)。

## 4. 强制栈适配

| 研究建议 | 决策 | 原因 |
|---|---|---|
| React、TypeScript、TanStack | 不采用 | 任务书要求原生 JS；表格先分页，无框架层 |
| ECharts、Plotly、deck.gl、Three.js | 不采用 | D3 是唯一图表库；Canvas 是浏览器绘图 API，可由 D3 比例尺/交互驱动 |
| DuckDB-Wasm / Arquero | 不作为主引擎 | 本项目要设计通用 JS 引擎；先明确纯函数语义和测试，不叠加不同执行语义 |
| Pyodide / FastAPI / pandas 后端 | 不采用 | GitHub Pages 静态运行；pandas 仅允许开发期离线结果对照 |
| Parquet 默认加载/上传 | 后置，不列必交 | CSV/TSV/JSON 满足任务书；免除额外 WASM 解码成本 |
| 操作 AST、Worker、pipeline、源锁、schema、双语字典 | 采用 | 与强制栈兼容，直接保证正确性、复现和联动 |
| Vite + GitHub Pages | 采用 | 静态构建、正确 base、hash 导航 |

依赖原则：运行期 D3；CSV/TSV 使用 d3-dsv；开发期 Vite 与测试工具。Excel 在核心完成后选一个可核验来源与许可证的解析库并锁版，不提前装库。原生 Intl、Worker、File、Blob、IndexedDB 等只按实际需求使用。

## 5. 本次查阅的一手来源

- [SportsDataverse 说明及 CC BY 4.0 标记](https://github.com/sportsdataverse/sportsdataverse-data)；数据资产的版本、更新时间以保存的 GitHub API 元数据为准。
- [Player boxscores release](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/nba_stats_player_boxscores)、[team boxscores](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/nba_stats_team_boxscores)、[schedules](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/nba_stats_schedules)、[shots](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/nba_stats_shots)。
- [NBA 使用条款](https://www.nba.com/termsofuse)与 [FAQ](https://www.nba.com/stats/help/faq)：上游权利限制仍需处理。
- pandas 官方 [groupby](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.groupby.html)、[merge](https://pandas.pydata.org/docs/reference/api/pandas.merge.html)、[std](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.std.html)、[quantile](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.quantile.html)、[rolling](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.rolling.html)、[resample](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.resample.html)。本次文档标示版本 3.0.6；后续离线 golden 环境固定版本并留环境文件。
- [D3 Brush](https://d3js.org/d3-brush)、[D3 数据统计](https://d3js.org/d3-array/summarize)、[Vite GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages)。

这些来源只支持对应事实；性能指标、UI、工时和模块设计是本项目方案，不是文献已验证结果。

