# gzh-matrix — 公众号矩阵全自动写作面板

一套跑在自己服务器上的公众号矩阵内容流水线（Next.js App Router 单体应用）：多公众号账号管理、AI 定时写文、爆文数据选题、素材库、自动配图、公众号排版引擎、微信草稿箱一键推送。作者用它同时运营多个公众号，从选题到草稿箱全自动。

## 功能

- **多号矩阵管理**：主号 / 子号分角色管理，每个公众号独立人设（身份 / 内容方向 / 受众 / 素材想法）、独立提示词模板、独立固定结尾
- **定时自动写文**：内置队列按间隔逐号生成，走 DeepSeek API；每号可自由开关
- **数据化选题**：接入 Redfox 爆文数据（涨粉榜 / 低粉爆文 / 公众号爆文搜索）作为"真实数据弹药"注入提示词，配合联网检索最近两周赛道打法；矩阵内跨号去重红线 + 常青选题库，重复题材直接 SKIP 宁缺毋滥
- **素材库**：图片素材与公众号 1-1 绑定，封面随机 / 固定取用，正文配图直插
- **自动配图**：无图文章自动生成 SVG 水墨题图（远山孤舟 + 朱砂印章，按文章种子随机微变）、SVG 封面卡，@resvg/resvg-js 渲染成 PNG
- **排版引擎**：内置 gzh-design 公众号排版技能（多主题），生成文一键排版为公众号 HTML
- **草稿箱推送**：排版稿自动传图床、转直链、调微信草稿箱 API 建草稿，人工审核后群发
- **子用户体系**：子用户申请开通 / 管理员审核，各管各的号，DeepSeek Key 跟人不跟号
- **营销节点日历**：自动识别中秋 / 国庆 / 双 11 等节点，窗口内优先备战 / 承接类选题

## 快速开始

```bash
pnpm install
cp .env.example .env    # 填好 ADMIN_PASSWORD 和 AUTH_SECRET
pnpm dev                # 开发模式，http://localhost:3000
# 或生产模式
pnpm build && pnpm start
```

登录：用户名 `admin`，密码即 `.env` 里的 `ADMIN_PASSWORD`。

之后到「账号管理」添加你的公众号（AppID / AppSecret，需在微信公众平台把服务器 IP 加入白名单）、「系统设置」配置 DeepSeek API Key，队列即可开始干活。

## 环境变量

复制 `.env.example` 为 `.env` 后修改：

| 变量 | 必填 | 说明 |
|------|------|------|
| ADMIN_PASSWORD | 是 | admin 登录密码，不设则无法登录 |
| AUTH_SECRET | 建议 | 会话签名密钥，可用 `openssl rand -hex 24` 生成 |
| QUEUE_GAP_MS | 否 | 队列任务间隔毫秒，默认 120000 |
| GZH_SKILL_DIR | 否 | gzh-design 技能目录，默认依次找 `../.agents/skills/gzh-design` → `./skills/gzh-design` |
| GIT_REPO_DIR | 否 | 文章发布目标裸仓库（用于发布统计，可按需指向自己的仓库） |
| GIT_LOG_PATHS | 否 | git 提交统计路径，默认 `ui-v3 official-site` |
| ARTICLE_OUT_DIR | 否 | 生成文章输出目录，默认 `./data/articles` |
| REDFOX_API_KEY | 否 | Redfox 爆文数据 API Key，管理后台「系统设置」里配置的值优先 |

## 数据与安全

运行数据存在 `data/`（首次运行自动创建）：

- `data/store.json` — 公众号 AppID/AppSecret、子用户、提示词、文章与素材记录、系统设置（含 DeepSeek Key）
- `data/materials/<账号ID>/` — 素材原图（面板缩略图直接读本地）
- `data/articles/` — 生成文章的 Markdown / HTML 落盘

**`data/` 和 `.env` 均已 gitignore，含真实凭据，严禁提交或外传。** 部署到公网请改掉默认密码、换 `AUTH_SECRET`，并建议加反代层做访问控制。

## scripts

- `configure-new-accounts.mjs` — 批量初始化账号配置（读 `/etc/gzh-matrix/secret.env` 或环境变量取管理员密码）
- `soften-sub-accounts.mjs` / `migrate-ending.mjs` — 历史数据迁移示例（结尾模板改造），可当 API 调用样例参考
- `diag-typeset.mjs` / `smoke-typeset.ts` — 排版引擎诊断 / 冒烟脚本

## 目录结构

```
app/            # Next.js 页面与 API 路由（账号/素材/文章/生成/设置/用户）
lib/            # 核心逻辑：writer(写文) pipeline(流水线) queue(队列) wechat(微信API)
                #   redfox(爆文数据) illustrate(自动配图) typeset(排版) defaults(内置提示词)
skills/         # gzh-design 公众号排版技能（AGPL，见其 LICENSE）
assets/fonts/   # 马善政毛笔楷体（SIL OFL 1.1），水墨题图用
scripts/        # 运维 / 迁移 / 诊断脚本
```

## License

MIT，见 [LICENSE](LICENSE)。其中 `skills/gzh-design` 排版技能为 [AGPL-3.0](skills/gzh-design/LICENSE)（原作者：甲木 × 摸鱼小李），`assets/fonts/MaShanZheng-Regular.ttf` 字体为 SIL Open Font License。

## 致谢

- [gzh-design](skills/gzh-design/README.md) — 微信公众号排版技能
- [Redfox 数据](https://redfox.hk) — 微信爆文数据
