-- 邮件验证码表
CREATE TABLE IF NOT EXISTS auth_pins (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT NOT NULL UNIQUE,
    pin         TEXT NOT NULL,
    expires_at  INTEGER NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_pins_email ON auth_pins(email);

-- 答题进度表（手动触发保存，记录当前题号和模式）
CREATE TABLE IF NOT EXISTS quiz_progress (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL,
    current_qid TEXT NOT NULL DEFAULT '',
    mode        TEXT NOT NULL DEFAULT 'sequential',
    selected_types TEXT NOT NULL DEFAULT 'judge,single,multi',
    updated_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_progress_user ON quiz_progress(user_id);

-- 错题和标记历史表（每次答题都实时写入）
CREATE TABLE IF NOT EXISTS mark_history (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      TEXT NOT NULL,
    question_id  TEXT NOT NULL,   -- 格式: "type_id", 如 "single_4"
    is_wrong     INTEGER NOT NULL DEFAULT 0,  -- 1=错题
    is_marked    INTEGER NOT NULL DEFAULT 0,  -- 1=已标记
    wrong_count  INTEGER NOT NULL DEFAULT 0,  -- 答错次数
    correct_count INTEGER NOT NULL DEFAULT 0, -- 答对次数
    note         TEXT NOT NULL DEFAULT '',
    updated_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mark_history_user_q ON mark_history(user_id, question_id);
CREATE INDEX IF NOT EXISTS idx_mark_history_user ON mark_history(user_id);

# 说明：
#  -- 格式: "type_id", 如 "single_4" 这里直接贴到D1 db的console会导致语法错误，（console只有一行不能多行输入）删除注释再执行！
