# AI 刷题系统 - Cloudflare 部署指南

## 文件结构

```
quiz-app/
├── data/
│   ├── judge_process.txt     # 判断题题库
│   ├── single_process.txt    # 单选题题库
│   └── multi_process.txt     # 多选题题库
├── functions/
│   └── api/
│       ├── sync.js           # POST /api/sync - 实时同步答题结果
│       ├── progress.js       # GET/POST /api/progress - 答题进度
│       ├── history.js        # GET /api/history - 拉取全量历史
│       └── review.js         # GET /api/review - 错题/标记查询
├── index.html
├── app.js
├── ui.js
├── storage.js
├── style.css
├── schema.sql                # D1 建表 SQL
└── wrangler.toml
```

## 部署步骤

### 1. 安装 Wrangler CLI
```bash
npm install -g wrangler
wrangler login
```

### 2. 创建 D1 数据库
```bash
wrangler d1 create quiz-db
```
复制输出的 `database_id`，填入 `wrangler.toml` 中的 `YOUR_D1_DATABASE_ID_HERE`。

### 3. 初始化数据库表
```bash
wrangler d1 execute quiz-db --file=schema.sql
```

### 4. 部署到 Cloudflare Pages
**方法 A：通过 Git（推荐）**
1. 把代码推到 GitHub 仓库
2. 进入 Cloudflare Dashboard → Pages → Create a project
3. 连接 GitHub 仓库，Build command 留空，Output directory 填 `.`
4. 进入 Settings → Functions → D1 database bindings
5. 添加绑定：Variable name = `DB`，选择 `quiz-db`

**方法 B：Direct Upload**
```bash
wrangler pages deploy . --project-name=quiz-app
```

### 5. 本地开发
```bash
wrangler pages dev . --d1=DB
```

## 功能说明

| 功能 | 触发时机 | 说明 |
|---|---|---|
| 同步答题结果 | 每次提交答案后自动 | 写入 mark_history 表 |
| 同步标记 | 每次标记/取消标记后自动 | 写入 mark_history 表 |
| 保存进度 | 点击「💾 保存进度」按钮 | 手动触发，节省额度 |
| 加载历史 | 页面启动时自动 | 拉取 mark_history 全量数据 |
| 错题回顾 | 点击「📋 错题回顾」 | 本地过滤，支持错题/标记/全部 |

## 数据库表结构

**quiz_progress** - 答题进度（手动保存）
- user_id, current_qid, mode, selected_types, updated_at

**mark_history** - 错题和标记记录（实时同步）
- user_id, question_id, is_wrong, is_marked, wrong_count, correct_count, note, updated_at
