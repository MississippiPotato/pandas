# pandas 功能 → 界面 → 计算 → 验收

当前实现映射（2026-10-15），覆盖最初 50 项目标：41 项 P0、2 项依赖真实坐标的 P0-D、7 项增强 P1。不是 50 个独立 API，也不是 pandas 完整兼容承诺。完整验收与发布状态见 [DELIVERY](DELIVERY.md)。

证据标记：**E** = Node 边界/历史测试；**P** = 离线 pandas 2.3.3 逐值比较；**B-C** = 通用业务链；**B-O** = 操作面板浏览器；**B-N** = NBA 联动；**B-F** = 格式/恢复浏览器。浏览器验证代表列出的场景，不能推导所有参数组合已验证。查询、统计和图表使用完整当前行集，显示抽样/截断另行标注。

| ID / pandas | 优先级 | 实际界面与 D3 参与 | JS / pandas 语义与边界 | 验收 |
|---|---|---|---|---|
| IO01 read_csv | P0 | 上传或拖入文件，分隔符/null 标记/类型确认，预览 | 严格 CSV 状态机，UTF-8/BOM/引号换行；输入转 nullable schema；代码以明确类型重建源表 | E、B-C |
| IO02 read_table | P0 | TSV 共用导入器 | `sep='\t'`；0/false/前导零保留 | E、B-F |
| IO03 read_json | P0 | 扁平 records 数组、缺列补 null | 嵌套拒绝；JSON 空字符串保留，与 CSV 空字段区别明确 | E、B-F |
| IO04 read_excel | P1 | XLSX 工作表选择，空白 sheet 跳过，确认字段类型 | read-excel-file；公式使用缓存值，不重算、不支持旧 xls | B-F |
| PR01 head/tail/iloc | P0 | 分页、每页 n、前 n/后 n | 当前行序只读切片，不改变统计分母 | E、B-C |
| PR02 info/dtypes/shape | P0 | 左侧字段/type、行列/缺失/质量、字段画像 | 完整 schema、非空与 missing 计数；null 与 0/false 分开 | E、B-C |
| PR03 describe numeric | P0 | 统计表、直方图、箱线图、字段画像 | count/mean/std/min/Q1/Q2/Q3/max，样本 ddof=1、线性分位 | E、B-O |
| PR04 describe category | P0 | 字段画像频次与比例，完整频次 CSV | count/unique/top frequency；前 30 项只限制显示，完整查询可导出 | E、B-C |
| PR05 isna/notna | P0 | D3 缺失矩阵点击字段进入清洗 | 全量 mask/计数；矩阵只显示前 80 行/40 字段 | E、B-O |
| PR06 duplicated | P0 | 去重预览与待移除明细；前后分布 | subset + keep first/last/false；最多显示 30 条待移除明细，计数不截断 | E、B-O |
| PR07 value_counts/nunique | P0 | 字段画像完整频次导出；类别条点击选择 | dropna=false，比例以完整当前行集为分母，unique 含 null | E、B-O |
| CL01 dropna | P0 | subset 多选、any/all，D3 预览与行数变化 | axis=0；空值判断不强制 bool；字段删除覆盖列方向需求 | E、P、B-O |
| CL02 fillna constant | P0 | 点缺失字段后指定类型常量，前后分布 | 只替换 null，类型不相容拒绝 | E、P、B-C |
| CL03 fillna mean/median | P0 | 处理方法、前后缺失数与分布 | 全量非空值统计；整数必要时升为数值；全空无值报错 | E、P、B-O |
| CL04 fillna mode | P0 | 显示字段频次，方法 mode，并列时输入明确候选 | 不静默选并列众数；全部缺失需指定常量 | E、代码生成、公网独立众数实际填充 |
| CL05 drop_duplicates | P0 | subset / keep，预览后提交 | pandas 三种 keep；保留稳定原始 row ID | E、P、B-C、B-O |
| CL06 astype/to_numeric | P0 | 类型转换、raise/coerce、invalid 计数 | 严格十进制与安全整数；不会将 bool 数字化或将 1.2 截断为整数 | E、P、B-O |
| CL07 to_datetime | P0 | 日期/日期时间类型选择和失败反馈 | 只接受明确 ISO / UTC，不猜地区格式；Python 辅助转换公开 | E、P、B-F |
| CL08 rename | P0 | 字段重命名预览；图形重新查询 | name 改变、field ID 保持，下游按稳定 ID 引用 | E、P、B-O |
| CL09 drop/select columns | P0 | 保留/删除多字段 | `loc[:, fields]`；UI 要求至少留一列；上游删除导致下游失败时原子回滚 | E、P、B-O |
| CL10 assign/derive | P0 | 安全表达式输入、字段引用插入、结果预览 | AST 白名单、null 传播、除 0→null、if/coalesce/abs/银行家 round；不 eval | E、P、B-O |
| CL11 outlier inspection/filter | P0 | D3 箱线外点与 IQR 面板，保留/仅看范围外 | 1.5×IQR，真实观测不自动删除；点击外点仅临时选择 | E、B-O |
| FR01 loc/boolean indexing | P0 | AND/OR 多条件，散点/直方图/时间/空间 brush，选区 chips | typed 谓词，null 比较为 false；正式应用生成可回放 filter | E、P、B-C、B-N |
| FR02 sort_values | P0 | 表头排序、多键/每键升降序/null 首尾 | 稳定排序，统计不因分页而改变 | E、P、B-O |
| GR01 groupby/agg | P0 | 多键/多指标，sum minCount、std/var ddof，预览 D3 图 | sum/mean/median/min/max/std/var/count/size/nunique；显式 dropna/sort | E、P、B-C、B-O |
| GR02 aggregation drilldown | P0 | 流程分组/透视节点“下钻原始记录”，选择组/列组合 | 依据输入节点 + 组谓词回到聚合前数据，不混用结果 row ID | E、浏览器依赖流程 |
| PV01 pivot_table | P0 | 多行/列维度、数值、agg、fill，预览热力图 | 观察到的维度键保留，全空组合明确，最多 10k 单元；Python groupby+merge 平列辅助 | E、P、B-C、B-O |
| PV02 pivot | P0 | 无聚合透视与重复键错误 | 唯一(row,column) 才转宽表；不静默聚合 | E、P、B-O 失败场景 |
| JT01 merge | P0 | 两表选择、复合键、四种 how、validate、后缀、D3 匹配与扩张预览 | null-null 匹配；预估扩张 ≤100k；键类型和重名检查 | E、P、B-O |
| JT02 join column-key subset | P0 | 共用双表列键配置器 | 生成等价 `pd.merge`；未实现任意索引/MultiIndex join | E、P、B-O |
| JT03 concat | P0 | 多表纵向拼接、列并集/交集 | axis=0、ignore_index=true；缺列补 null、类型不相容拒绝 | E、P、B-O |
| BN01 cut | P1 | 分箱边界输入、right/includeLowest，实际边界预览 | 严格递增边界；标签闭合与实际范围一致，区间外 null | E、P、B-O |
| BN02 qcut | P1 | q / 重复边界 drop 选择，显示实际边界 | 线性分位；导出以 `pd.cut(recorded_edges)` 重放，公开区别于原生 qcut 浮点行为 | E、P、B-O |
| RS01 melt | P1 | ID / Value 多选、变量列/值列名称 | column-major，行数预算、类型兼容与名称冲突检查 | E、P、B-O |
| ST01 mean/median/min/max/std/var | P0 | 描述表、字段统计与图形 | 忽略 null；单值 std/var=null；默认样本统计 | E、P 分组案例、B-O |
| ST02 quantile | P0 | Q1/Q2/Q3/箱线图，字段画像输入 q | q∈[0,1] 线性插值，n=0 返回 null | E、字段查询入口 |
| ST03 corr | P0 | 多选最多 12 个数值字段，矩阵点击变量对转散点 | Pearson pairwise，n 每对分别计算；常量/不足 2 样本为 null | E、B-O |
| TM01 resample | P0 | 日期、分组、D/W-MON/MS、指标和聚合器 | UTC、left/left、空桶 mean=null / sum=0，分组不跨界 | E、P、B-O |
| TM02 rolling | P0 | 分组/排序/行窗口/minPeriods/聚合 | trailing row-window，先排序再分组，非天数窗口；输出可用折线重映射 | E、P、B-O |
| TM03 time-derived group | P0 | 日期字段提取 year / month / week-start | UTC；月/周存起点日期，不混淆跨年 | E、P、B-O |
| EX01 rank | P1 | 并列规则、组键、升降序、pct | average/min/max/first/dense，缺失不排名 | E、P、B-O |
| EX02 cumsum | P1 | 数值/分组字段，明确保持当前顺序 | skipna，缺失处为 null 后续继续 | E、P、B-O |
| EX03 group transform | P1 | 保留明细添加组 mean/sum/count | 行身份不变，仅支持白名单，不执行 UDF | E、P、B-O |
| OU01 to_csv | P0 | 导出已提交 CSV / 临时选区 CSV，范围分开 | 真实列序/行序/值，正确 quote；无内部 row ID | E、B-C |
| OU02 analysis result export | P0 | JSON / CSV，字段完整频次；相关矩阵含 n | 导出完整结果，不拿屏幕 topN 当全量 | E、B-C |
| OU03 chart SVG/PNG | P0 | 画布 SVG/PNG 与导出菜单 | 真实 SVG / Canvas 栅格，白底、标题、来源；样本点仍保留抽样说明 | B-C 实际下载与文件查看 |
| OU04 pipeline JSON/replay | P0 | 流程配置 / 项目包 / 导入配置 / IndexedDB | 流程引用 hash + schema，项目包明确含数据；视图字段与图型随配置保存 | E、B-C、B-F |
| OU05 undo/redo/edit | P0 | 历史按钮、流程节点、JSON 参数编辑与预览、删除依赖保护 | 原子重算 DAG；失败保留旧结果；编辑入口透明显示稳定字段 ID | E、B-C、B-O |
| NB01 spatial loc | P0-D | 供应方定义球场，D3 矩形 brush 与原始坐标散点 | raw legacy 领域范围；完整有效坐标、负值与 6 次超半场远投保留 | E、B-N |
| NB02 shot group aggregation | P0-D | 5 英尺网格，出手数 / FG% / 点图切换，区域点击 | 逐区域 sum(made)/attempts；不平均局部百分比；全量统计，低 n 提醒 | E、B-N |

## 交互与可复现性的统一规则

1. 图形临时选区按通道替换、跨通道 AND；chips 显示领域条件。清除不改历史，应用后才写操作节点。
2. 临时选区未应用时，变换配置器要求先应用或清除，防止预览忽略选区；选区导出与已提交 CSV 分开。
3. 每个变换公开 before/after 行/列/缺失统计、参数、输入节点、结果 lineage 和 pandas 写法。清洗/分组/透视/关联预览有相应 D3 图。
4. Python 导出包含活动结果依赖的真实源记录、明确类型、必要辅助函数与全部步骤，不只导出字符串片段。支持范围之外明确拒绝，未声称跨 pandas 版本全面兼容。
5. 真实发布状态以 Actions 与公网浏览器核验为准，算法测试、Node 基准和静态设计图不能替代它们。

不支持：任意 apply/map/Python/UDF、通用 MultiIndex、axis=1 concat、offset/center rolling、复杂本地时区 DST、插值全方法、全部统计检验/IO 格式。UI 的操作范围由白名单注册表限定。
