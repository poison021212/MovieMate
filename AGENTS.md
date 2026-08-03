# MovieMate AI 协作规则

本文件适用于整个仓库（`client/` + `server/`）。与 AI 或他人协作时请先阅读本文件与 [docs/README.md](docs/README.md)。

## 1. 目标与原则

- 本仓库是光影笔记（MovieMate）全栈 Demo：React 前端 + Express API + MySQL。
- 沟通与项目文档使用中文；代码内注释可用英文。
- Git 提交建议：`type(scope): 中文摘要`（type 用英文：`feat` / `fix` / `docs` 等）。
- 遵循 KISS、YAGNI：优先最小、可验证的改动，不顺手重构无关代码。
- 以用户当前需求、代码与运行结果为准；未验证的结论标为假设。

## 2. 开始任务前

按顺序阅读：

1. 根目录 [README.md](README.md)
2. [docs/README.md](docs/README.md) 与 `docs/features/` 中相关功能文档
3. 本文件 [AGENTS.md](AGENTS.md)
4. 将要修改的后端/前端文件及其路由、API 层

保留工作区中他人或未提交的改动，勿为图方便回滚无关文件。

## 3. 文档是稳定信息，不是工作日志

应写入文档的内容：

- 功能目标、用户流程、API 契约、权限与数据边界
- 环境变量、启动方式、验收标准
- 仍有效的已知风险与约束

不应写入：

- 聊天记录、逐步排查流水
- 可从代码直接复制的逐行说明
- 密钥、生产密码、真实 token

Git/MR 记录「改了什么」；`docs/features/*.md` 说明「现在是什么、为什么这样设计」。

## 4. 文档更新边界

- 新增或变更用户可见功能、API 字段、权限、数据库表语义时，更新或新增 `docs/features/<name>.md`。
- 同步更新 [README.md](README.md) 中与运行/契约相关的段落（若受影响）。
- 小修复、纯样式、不改变契约的重命名，通常不必新增功能文档。
- 文档与代码应在同一改动中完成，避免「先合代码后补文档」。

## 5. 前后端契约

- 一个功能一份 `docs/features` 文档，前后端共用，不维护两份互相复制的说明。
- API 变更时同时检查：Express handler、RTK Query API 文件、页面组件、功能文档。
- 敏感操作（收藏、评论、删除）必须在服务端校验 JWT，不能仅依赖前端隐藏按钮。
- 电影主键：列表/详情/收藏/评论使用本地 `movies.id`（前端常表现为 `documentId`）；TMDB 同步使用 `tmdb_id` 做 upsert。

## 6. 完成与验证

按改动范围做最小充分验证：

- 后端：相关 API 手工或 Postman 验证；改路由后确认 `npm run dev:server` 无报错。
- 前端：`npm run build -w moviemate-client`；涉及交互的页面本地点验。
- 文档：链接路径正确，契约与代码一致。
- 未执行验证时，交付说明须写明，不得写「已全部通过」。

## 7. 目录约定

| 路径 | 用途 |
| --- | --- |
| `client/src/pages/` | 路由级页面 |
| `client/src/components/` | 可复用 UI |
| `client/src/store/API/` | RTK Query 接口 |
| `server/router/` | 路由挂载 |
| `server/router_handler/` | 业务处理 |
| `server/schema/` | Joi 校验 |
| `server/sql/` | 建库脚本 |
| `server/scripts/` | 离线任务（如 TMDB 同步） |
| `docs/features/` | 功能规格 |

## 8. 安全

- 勿提交 `server/.env`；仅提交 [server/.env.example](server/.env.example) 模板。
- 日志中避免打印完整 JWT、数据库密码或第三方 API Key。
- 若密钥曾进入 Git 历史，应在对应平台轮换密钥。

## 9. 提交与 MR 建议

```text
feat(client): 速览模式分页预加载

- 接近列表末尾加载下一页
- 更新 docs/features/swipe-mode.md
```

MR 描述建议包含：为什么改、影响模块、如何验证、更新了哪些文档。
