# Phase 0 核验资料

初始目录没有research子目录；用户提供的完整报告保留在上一级 `deep-research-report.md`，任务书保留在 `codex_brief.txt`。本目录由2026-10-15的核验创建，不应当误称为原始用户资料目录。

- `evidence/*.release.json`：从SportsDataverse GitHub release API读取的7个release元数据快照。
- `evidence/source-lock.json`：10个真实下载文件的资产ID、URL、大小、更新时间、API digest与本地SHA-256。
- `evidence/raw/`：对应10个CSV/CSV.GZ原始文件，不编辑、不放入生产public目录。
- `evidence/data-audit.json`：本次逐行审计、关系校验与默认快照范围计数。
- `phase0_audit.py`：Python标准库的离线资料质检，可针对已下载文件重复运行；不是网站后端。
- `phase0_validate.py`：核对原资料hash、文档链接、50项覆盖ID、源锁与范围计数；不运行应用功能测试。
- `evidence/phase0-validation.json`：文档链接、资料完整性、来源锁和覆盖计数检查结果。

重新下载时必须先比对原锁：远程同名asset可能更新，不能覆盖旧raw后仍沿用旧hash。若需升级，另建新版本目录并重新审计。raw当前共约52MB，发布阶段只生成被选范围的规范化CSV，并只部署dist。
