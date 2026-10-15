# NBA 数据与坐标外部核验

核验日期：2026-10-15。范围仅为 `nba-2025-26-nov` 冻结快照。本文新增核验结果，不改写旧的 Phase 0/1 证据，也不声称全量数据经 NBA 独立逐条确认。

## 结论与实现决定

1. **可立即启用原始坐标投篮散点与矩形刷选**：轴直接使用 `x_legacy`、`y_legacy`，显示“SportsDataverse / NBA legacy 坐标”，保留全部有效坐标和原始行。此操作不依赖球场装饰或官方单位声明。
2. SportsDataverse 自身的现行坐标文档、转换实现与实际发布管线，明确把这两列定义为以投篮篮筐为原点、单位为 0.1 英尺的同篮筐坐标。证据足以支持**注明供应方定义、记录版本的球场叠加**。这不等于找到了 NBA 官方坐标字典：本次没有找到后者；NBA CDN 直连抽查返回 403。
3. 选取月初、月中、月末各一场，使用 NBA 官方计分员 PDF 的第 1 页与本地 CSV 进行独立数值对照，**81 项断言全部通过**。这是小样本外部核验，不是全量正确率保证。
4. 数据发布库的 README 有 CC BY 4.0 徽章，`LICENSE` 文件及 GitHub API 却指向 MIT 软件许可。必须分别记录这两项事实。它们均没有在本次核验中证明 NBA 上游统计数据对公开教学网站的再分发授权；`pending-upstream-review` 仍应保留。

## 坐标来源、公式与证据等级

**供应方明确事实**：[sdvplotR 坐标文档](https://sdvplotr.sportsdataverse.org/reference/sdv_court_coords.html) 将 `x_legacy/y_legacy` 与 `LOC_X/LOC_Y` 指向同一 NBA legacy 框架：篮筐原点、0.1 ft、两队都投向同一篮筐；负 x 是投篮者左侧。其[固定提交转换代码](https://github.com/sportsdataverse/sdvplotR/blob/31bb4e1ebd1014d5683a72a463aaa5b4c1571c28/R/court_coords.R)的核心为：

```js
// 竖向显示，篮筐原点，英尺
xFeet = x_legacy / 10;
yFeet = y_legacy / 10;
// sportyR 横向球场，中央原点
courtX = -41.75 + y_legacy / 10;
courtY = x_legacy / 10;
```

竖向图应把正 y 绘制为远离底线，明确屏幕方向；不要再按主客队或节次二次翻转。这里的 x/y 命名属于显示坐标选择，不应混用 NBA CDN 中另一对 `x/y` 百分比坐标。

**实际生产代码事实**：[hoopR-nba-stats-data build.py，固定提交 1f450754…](https://github.com/sportsdataverse/hoopR-nba-stats-data/blob/1f450754e7cf7005f8575b83106b49c41943b9f4/python/nba_data_build/reshape/build.py#L279) 的 `build_shots` 从 PBP 筛 `is_field_goal == 1`，保留 legacy 坐标；三分球距离被上游报告为 0 时，使用 `floor(hypot(x,y)/10 + 0.5)` 修复。因此 `shot_distance` 与坐标吻合不能被当作完全独立的第二个来源。该代码快照晚于锁定 CSV 资产，证明现行实现，不能替代旧资产构建提交的可追溯证明。

**官方内容镜像证据**：[sportsdataverse-py 固定提交中的 NBA CDN fixture](https://github.com/sportsdataverse/sportsdataverse-py/blob/4636718a57a2380a5c9527d8d8b82048f00f5372/tests/fixtures/nba_engine/0022300001/cdn_playbyplay.json)含 game `0022300001`：action 71 的 `Left Corner 3` 是 (−224,39)，action 131 的 `Right Corner 3` 是 (240,29)。两点分别距篮筐约 22.74 ft 和 24.17 ft，与其 22.77/24.19 ft 记录接近。镜像内容支持方向与尺度；这不是本次从 NBA CDN 直接取得的响应。

**NBA 官方球场事实**：[规则第 1 条](https://official.nba.com/rule-no-1-court-dimensions-equipment/)给出三分弧 23 ft 9 in、距边线 3 ft 的平行线及 4 ft 限制区。规则说明球场几何，未说明 API 坐标；不可将其标为 legacy 坐标定义来源。

## 本地冻结投篮全量计算

详见 [coordinate-verification.json](../research/evidence/coordinate-verification.json)，该文件绑定当前 `shots.csv` SHA-256。

| 检查 | 结果 | 含义 |
|---|---:|---|
| 投篮行数 / 可解析数值坐标对 | 39,092 / 39,092 | 仅表示有数值，不表示每一笔位置绝对真实 |
| x 范围 | −250…250 | 按供应方定义为 −25…25 ft |
| y 范围 | −51…610 | 这是月内范围；旧文档的 734 是完整原始赛季源范围 |
| y > 417.5（越过半场线） | 6 | 半场图不得默默丢弃；提供全范围或明确数量 |
| y < 0 | 1,895 | 篮筐后方到底线区域合理，不能当负值错误删除 |
| (0,0) 坐标对 | 1,125 | 不可把所有原点事件视为缺失；保留及说明坐标精度 |
| `abs(hypot(x,y)/10 − shot_distance)` | 中位 0.2433 ft，最大 0.5 ft | 全部符合四舍五入到整英尺的尺度；考虑上游修复逻辑，属内部尺度一致性 |

空间选择只改变当前图表/统计使用的行集；保留原始数据。每次刷选应生成可回放的两个字段范围筛选，显示命中/出手/FG%、范围内 n、有效坐标 n；空选区 FG% 为 null。区域命中率必须按 makes/attempts 聚合，不能平均分格命中率。空间筛选不是“清除异常坐标”的同义操作。

## 官方比赛独立抽查

方法：从 NBA 官方 FINAL BOX 物理第 1 页人工录入预期数字，再以 game_id/team_id/player_id 对本地规范 CSV 程序比较；每场验证日期、两侧赛程比分、每队 9 个指标（PTS、FGM/FGA、3PM/3PA、FTM/FTA、REB、AST）、两名球员的 PTS/REB/AST。每场 27 项，共 81 项。完整预期/实际/通过状态见 [official-game-checks.json](../research/evidence/official-game-checks.json)。

| NBA 比赛日 / game_id | 官方比分（客–主） | 球员抽查（PTS/REB/AST） | 证据 |
|---|---|---|---|
| 2025-11-01 / 0022500147 | DAL 110–DET 122 | Duren 33/10/2；Russell 31/7/3 | [NBA 官方 game book，第 1 页](https://statsdmz.nba.com/pdfs/20251101/20251101_DALDET_book.pdf) |
| 2025-11-15 / 0022500228 | MEM 100–CLE 108 | Mitchell 30/5/5；Jackson Jr. 26/5/2 | [NBA 官方 FINAL BOX，第 1 页](https://statsdmz.nba.com/pdfs/20251115/20251115_MEMCLE.pdf) |
| 2025-11-30 / 0022500308 | NOP 121–LAL 133 | Reaves 33/5/8；Dončić 34/12/7 | [NBA 官方 game book，第 1 页](https://statsdmz.nba.com/pdfs/20251130/20251130_NOPLAL_book.pdf) |

额外发现：墨西哥城比赛 `0022500147` 的原始 `matchup` 是 `DET @ DAL`，但结构化 home_team_id 指 DET，NBA 官方 scorer 把 DET 列 HOME。页面应以结构化主客字段和球队名称构造对阵，不能解析 matchup 文案来反转主客队；也不要假定指定主队等于比赛在该队城市举行。

NBA liveData boxscore 三场及 DAL–DET PBP 的直接请求均返回 HTTP 403，未将失败记为通过；NBA 页面文本有时仅提供空壳，最终采用官方 PDF。无动态 API 的客户端依赖是静态部署的实际优点。

## 许可事实及仍未解决的边界

在 [sportsdataverse-data 固定提交 c30618f5… 的 README](https://github.com/sportsdataverse/sportsdataverse-data/blob/c30618f5f439abc8275f0a9bea30892a598890b8/README.md)可见 CC BY 4.0 数据发布徽章；同一提交的 [LICENSE](https://github.com/sportsdataverse/sportsdataverse-data/blob/c30618f5f439abc8275f0a9bea30892a598890b8/LICENSE)是 MIT 软件许可。结论是“存在不同层面的许可标记”，不是擅自断言 README 失效、数据必属 MIT、或整个数据包授权已经清晰。

[NBA 使用条款](https://www.nba.com/termsofuse)第 9 条包含统计数据使用范围限制。[NBA Stats FAQ](https://www.nba.com/stats/help/faq)没有提供自由下载承诺。上述页面与供应方许可标记均不能推导出“公开、非商业、教学使用一律获准”；项目当前的 educational/non-commercial purpose 是用途描述，不是授权凭证。应保留署名、冻结日期和来源信息；公开发布前需解决上游适用授权或改用有明确适用授权的数据。本文没有给出法律结论。

## 保留的限制

- 3 场是有目的的跨月抽查，不能估计其余 216 场的错误率，也未逐条核对 39,092 个官方投篮事件。
- legacy 定义由数据供应方文档、代码和官方内容镜像支持；NBA 本站坐标字典与本月直接 PBP 对照仍未取得。若采用更严格的“必须 NBA 本站坐标字典”发布门槛，只启用有明确字段轴的原始散点；筛选、聚合和导出仍可完整实现。
- 39,092 对数值坐标不等于位置真值；不能依据圆点落在边界上，强制修改或排除真实事件。
- 本次只新增本文和 evidence JSON，没有改 manifest、CSV、应用或旧报告。
