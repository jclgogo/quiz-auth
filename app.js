/**
 * app.js - 主逻辑控制
 * session 概念：
 *   this.session = 'main'   → 正常刷题
 *   this.session = 'review' → 错题/标记题独立刷题会话
 */

import { storage } from './storage.js';
import { ui } from './ui.js';
import { auth } from './auth.js';

class QuizApp {
    constructor() {
        this.allQuestions   = [];
        this.currentQuestions = [];
        this.currentIndex   = 0;
        this.mode           = 'sequential';
        this.selectedTypes  = ['judge', 'single', 'multi'];

        // review session
        this.session        = 'main';   // 'main' | 'review'
        this.reviewFilter   = 'all';    // 'all' | 'wrong' | 'marked'

        this._autoAdvanceTimer = null;
        this.init();
    }

    async init() {
        auth.init(() => this.onLoginSuccess());
        this.updateAuthUI();
        await this.loadQuestions();

        if (storage.isLoggedIn()) {
            ui.showSyncStatus('正在同步云端数据...', 'loading');
            await storage.loadFromCloud();
            ui.showSyncStatus('数据已同步 ✓', 'success');
        }

        this.loadPreferencesToState();
        this.applyStateToControls();
        this.setupEventListeners();
        this.startMainSession();
    }

    async onLoginSuccess() {
        this.updateAuthUI();
        ui.showSyncStatus('登录成功，正在同步数据...', 'loading');
        await storage.loadFromCloud();
        ui.showSyncStatus(`已登录：${storage.getEmail()}`, 'success');
        this.loadPreferencesToState();
        this.applyStateToControls();
        this.startMainSession();
    }

    updateAuthUI() {
        const btn = document.getElementById('auth-btn');
        if (!btn) return;
        if (storage.isLoggedIn()) {
            btn.textContent = `👤 ${storage.getEmail()}`;
            btn.title = '点击退出登录';
            btn.classList.add('btn-logged-in');
            btn.classList.remove('btn-login');
        } else {
            btn.textContent = '🔑 登录';
            btn.title = '登录以同步数据';
            btn.classList.remove('btn-logged-in');
            btn.classList.add('btn-login');
        }
    }

    async loadQuestions() {
        const files = [
            'data/judge_process.txt',
            'data/single_process.txt',
            'data/multi_process.txt'
        ];
        try {
            const results = await Promise.all(files.map(f => fetch(f).then(r => r.text())));
            this.allQuestions = results.flatMap(text =>
                text.split('\n')
                    .filter(l => l.trim())
                    .map(line => { try { return JSON.parse(line); } catch { return null; } })
                    .filter(Boolean)
            );
            console.log(`已加载 ${this.allQuestions.length} 道题目`);
        } catch (e) {
            console.error('加载题库失败:', e);
            alert('加载题库失败，请检查网络或文件路径。');
        }
    }

    // ── 会话管理 ─────────────────────────────────────────────

    /** 启动正常刷题会话 */
    startMainSession() {
        this.session = 'main';
        ui.setSessionUI('main');
        this.startQuiz();
    }

    /** 启动错题/标记题独立刷题会话 */
    startReviewSession(filter = this.reviewFilter) {
        this.reviewFilter = filter;
        this.session = 'review';
        ui.setSessionUI('review', filter);

        const records = storage.getUserInfoSnapshot().progress.questions;
        let questions = this.allQuestions.filter(q => {
            const qid = `${q.type}_${q.id}`;
            const stat = records[qid] || {};
            if (filter === 'wrong')  return (stat.wrongCount || 0) > 0;
            if (filter === 'marked') return !!stat.isMarked;
            return (stat.wrongCount || 0) > 0 || !!stat.isMarked;
        });

        // 按类型 + id 排序
        questions.sort((a, b) =>
            a.type !== b.type ? a.type.localeCompare(b.type)
                : String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
        );

        ui.resetNavLimits();
        this.currentQuestions = questions;
        this.currentIndex = 0;

        if (questions.length === 0) {
            ui.showEmptyReview(filter);
            return;
        }

        this.showCurrentQuestion();
    }

    // ── 刷题核心 ─────────────────────────────────────────────

    startQuiz() {
        let base = this.allQuestions.filter(q => this.selectedTypes.includes(q.type));

        if (this.mode === 'wrong') {
            const wrongQids = new Set(storage.getWrongQids());
            this.currentQuestions = base.filter(q => wrongQids.has(`${q.type}_${q.id}`));
        } else {
            this.currentQuestions = [...base];
        }

        if (this.mode === 'random') {
            this.shuffle(this.currentQuestions);
        } else {
            this.currentQuestions.sort((a, b) =>
                a.type !== b.type ? a.type.localeCompare(b.type)
                    : String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
            );
        }

        ui.resetNavLimits();
        this.currentIndex = 0;

        if (this.currentQuestions.length === 0) {
            alert('没有符合筛选条件的题目！');
            ui.renderQuestionNavigation([], 0, {});
            return;
        }

        const lastQid = storage.getLastQid();
        if (lastQid) {
            const idx = this.currentQuestions.findIndex(q => `${q.type}_${q.id}` === lastQid);
            if (idx >= 0) this.currentIndex = idx;
        }

        this.showCurrentQuestion();
    }

    showCurrentQuestion() {
        if (!this.currentQuestions.length) return;
        const question = this.currentQuestions[this.currentIndex];
        const qid = `${question.type}_${question.id}`;
        const stat = storage.getQuestionStat(qid);
        ui.renderQuestion(question, this.currentIndex, this.currentQuestions.length, { marked: stat.isMarked });
        ui.renderQuestionNavigation(this.currentQuestions, this.currentIndex, storage.getUserInfoSnapshot().progress.questions);
        ui.setNavExpanded(question.type);
        if (this.session === 'main') storage.setLastQid(qid);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    handleAnswerSubmit() {
        const question = this.currentQuestions[this.currentIndex];
        const userAnswer = ui.getUserAnswer(question.type);
        if (!userAnswer) { alert('请先选择答案！'); return; }

        let correct = question.answer;
        if (question.type === 'multi') correct = correct.split('').sort().join('');
        const isCorrect = userAnswer === correct;
        const qid = `${question.type}_${question.id}`;

        if (isCorrect) { storage.updateCorrect(qid); } else { storage.updateWrong(qid); }

        const stat = storage.getQuestionStat(qid);
        ui.renderResult(isCorrect, question, stat);
        ui.renderQuestionNavigation(this.currentQuestions, this.currentIndex, storage.getUserInfoSnapshot().progress.questions);

        if (storage.isLoggedIn()) {
            ui.showSyncStatus(isCorrect ? '✓ 已同步' : '✗ 错题已记录', isCorrect ? 'success' : 'error');
        }

        // 答对时 300ms 后自动跳下一题，但不跳同类型最后一题
        if (isCorrect && !this._isLastOfType(this.currentIndex)) {
            this._autoAdvanceTimer = setTimeout(() => {
                if (this.currentIndex < this.currentQuestions.length - 1) {
                    this.goToIndex(this.currentIndex + 1);
                }
            }, 300);
        }
    }

    handleShowAnswer() {
        const question = this.currentQuestions[this.currentIndex];
        const qid = `${question.type}_${question.id}`;
        const stat = storage.getQuestionStat(qid);
        ui.renderShowAnswer(question, stat);
        ui.renderQuestionNavigation(this.currentQuestions, this.currentIndex, storage.getUserInfoSnapshot().progress.questions);
    }

    _isLastOfType(index) {
        const currentType = this.currentQuestions[index]?.type;
        if (!currentType) return true;
        let lastIdx = -1;
        for (let i = this.currentQuestions.length - 1; i >= 0; i--) {
            if (this.currentQuestions[i].type === currentType) { lastIdx = i; break; }
        }
        return index === lastIdx;
    }

    nextQuestion() {
        if (this.shouldConfirmSkip()) { if (!confirm('本题未提交，确定跳过？')) return; }
        this.goToIndex(this.currentIndex + 1, { wrap: true });
    }

    prevQuestion() {
        if (this.shouldConfirmSkip()) { if (!confirm('本题未提交，确定跳过？')) return; }
        this.goToIndex(this.currentIndex - 1, { wrap: true });
    }

    goToIndex(index, { wrap } = {}) {
        if (this._autoAdvanceTimer) { clearTimeout(this._autoAdvanceTimer); this._autoAdvanceTimer = null; }
        if (!this.currentQuestions.length) return;
        let next = index;
        if (wrap) {
            if (next < 0) next = this.currentQuestions.length - 1;
            if (next >= this.currentQuestions.length) next = 0;
        }
        if (next < 0 || next >= this.currentQuestions.length) return;
        this.currentIndex = next;
        this.showCurrentQuestion();
    }

    shouldConfirmSkip() {
        const { submit } = ui.getContainer();
        return submit.style.display === 'block';
    }

    toggleMarked() {
        if (!this.currentQuestions.length) return;
        const question = this.currentQuestions[this.currentIndex];
        const qid = `${question.type}_${question.id}`;
        const marked = storage.toggleMarked(qid);
        ui.getContainer().markBtn.textContent = marked ? '取消标记' : '标记';
        ui.renderQuestionNavigation(this.currentQuestions, this.currentIndex, storage.getUserInfoSnapshot().progress.questions);
        ui.showSyncStatus(marked ? '已标记' : '已取消标记', 'success');

        // review 会话中取消标记后，如果当前过滤是 marked，当前题从列表移除
        if (this.session === 'review' && this.reviewFilter === 'marked' && !marked) {
            this._removeCurrentFromReview();
        }
    }

    /** 从 review 列表移除当前题（取消标记/移除错题时用） */
    _removeCurrentFromReview() {
        this.currentQuestions.splice(this.currentIndex, 1);
        ui.resetNavLimits();
        if (this.currentQuestions.length === 0) {
            ui.showEmptyReview(this.reviewFilter);
            return;
        }
        if (this.currentIndex >= this.currentQuestions.length) {
            this.currentIndex = this.currentQuestions.length - 1;
        }
        this.showCurrentQuestion();
    }

    // ── 视图切换 ─────────────────────────────────────────────

    showProfileView() {
        ui.renderProfile(this.allQuestions, storage.getUserInfoSnapshot().progress.questions);
        ui.setView('profile');
    }

    showQuizView() {
        if (this.session === 'review') {
            ui.setSessionUI('review', this.reviewFilter);
        } else {
            ui.setSessionUI('main');
        }
        ui.setView('quiz');
        this.showCurrentQuestion();
    }

    // ── 事件绑定 ─────────────────────────────────────────────

    setupEventListeners() {
        const c = ui.getContainer();

        c.submit.onclick        = () => this.handleAnswerSubmit();
        c.nextBtn.onclick       = () => this.nextQuestion();
        c.prevBtn.onclick       = () => this.prevQuestion();
        c.markBtn.onclick       = () => this.toggleMarked();
        c.saveNote.onclick      = () => this.handleSaveNote();
        c.showAnswerBtn.onclick = () => this.handleShowAnswer();
        c.profileLink.onclick   = () => this.showProfileView();
        c.backToQuiz.onclick    = () => this.showQuizView();

        // 错题回顾按钮 → 显示 filter 选择器，不直接进入
        c.reviewLink.onclick = () => {
            ui.setView('review-select');
        };

        // 选择 filter 后进入 review session
        document.querySelectorAll('.review-start-btn').forEach(btn => {
            btn.onclick = () => {
                this.startReviewSession(btn.dataset.filter);
                ui.setView('quiz');
            };
        });

        // review 会话内 header 的返回按钮 → 回主刷题
        document.getElementById('back-to-main-btn').onclick = () => {
            this.startMainSession();
        };

        // 登录/退出
        document.getElementById('auth-btn').onclick = () => {
            if (storage.isLoggedIn()) {
                if (confirm(`确定退出登录？\n当前账号：${storage.getEmail()}`)) {
                    storage.logout();
                    this.updateAuthUI();
                    ui.showSyncStatus('已退出登录', 'info');
                    this.startMainSession();
                }
            } else {
                auth.show();
            }
        };

        // 保存进度
        c.saveProgressBtn.onclick = async () => {
            if (!storage.isLoggedIn()) { auth.show(); return; }
            ui.showSyncStatus('正在保存进度...', 'loading');
            const ok = await storage.saveProgressToCloud();
            ui.showSyncStatus(ok ? '进度已保存 ✓' : '保存失败，请重试', ok ? 'success' : 'error');
        };

        // 模式/题型（仅主会话有效）
        document.getElementById('mode-select').onchange = (e) => {
            this.mode = e.target.value;
            storage.savePreferences({ mode: this.mode, selectedTypes: this.selectedTypes });
            if (this.session === 'main') this.startQuiz();
        };

        document.querySelectorAll('input[name="type-filter"]').forEach(cb => {
            cb.onchange = () => {
                this.selectedTypes = Array.from(
                    document.querySelectorAll('input[name="type-filter"]:checked')
                ).map(c => c.value);
                storage.savePreferences({ mode: this.mode, selectedTypes: this.selectedTypes });
                if (this.session === 'main') this.startQuiz();
            };
        });

        // 左侧导航
        document.getElementById('question-nav').addEventListener('click', (e) => {
            const target = e.target;
            if (!(target instanceof HTMLElement)) return;
            if (target.classList.contains('nav-more')) {
                ui.increaseNavLimit(target.dataset.type, 200);
                ui.renderQuestionNavigation(this.currentQuestions, this.currentIndex, storage.getUserInfoSnapshot().progress.questions);
                return;
            }
            const title = target.closest('.nav-title');
            if (title) {
                const grid = title.nextElementSibling;
                if (grid?.id?.startsWith('nav-')) ui.setNavExpanded(grid.id.replace('nav-', ''));
                return;
            }
            if (!target.classList.contains('nav-box')) return;
            const idx = Number(target.dataset.index);
            if (Number.isFinite(idx)) this.goToIndex(idx);
        });

        // 个人中心跳题
        document.getElementById('profile-view').addEventListener('click', (e) => {
            const target = e.target;
            if (target instanceof HTMLElement && target.classList.contains('nav-box') && target.dataset.qid) {
                this.jumpToQidInMain(target.dataset.qid);
            }
        });

        document.addEventListener('keydown', (e) => this.handleKeyPress(e));
    }

    jumpToQidInMain(qid) {
        // 强制切换到主会话再跳题
        this.session = 'main';
        ui.setSessionUI('main');
        this.mode = 'sequential';
        this.selectedTypes = ['judge', 'single', 'multi'];
        storage.savePreferences({ mode: this.mode, selectedTypes: this.selectedTypes });
        this.applyStateToControls();
        this.startQuiz();
        const idx = this.currentQuestions.findIndex(q => `${q.type}_${q.id}` === qid);
        if (idx >= 0) { ui.setView('quiz'); this.goToIndex(idx); }
    }

    handleSaveNote() {
        if (!this.currentQuestions.length) return;
        const question = this.currentQuestions[this.currentIndex];
        const qid = `${question.type}_${question.id}`;
        storage.saveNote(qid, document.getElementById('note-text').value);
        ui.showSyncStatus('笔记已保存', 'success');
        ui.renderQuestionNavigation(this.currentQuestions, this.currentIndex, storage.getUserInfoSnapshot().progress.questions);
    }

    loadPreferencesToState() {
        const prefs = storage.getPreferences();
        this.mode = prefs.mode;
        this.selectedTypes = prefs.selectedTypes;
    }

    applyStateToControls() {
        const modeSelect = document.getElementById('mode-select');
        if (modeSelect) modeSelect.value = this.mode;
        const selected = new Set(this.selectedTypes);
        document.querySelectorAll('input[name="type-filter"]').forEach(cb => {
            cb.checked = selected.has(cb.value);
        });
    }

    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    handleKeyPress(e) {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
        const { submit } = ui.getContainer();
        if (e.key >= '1' && e.key <= '8') {
            document.querySelectorAll('input[name="option"]')[parseInt(e.key) - 1]?.click();
        }
        if (e.key === 'Enter') {
            submit.style.display === 'block' ? this.handleAnswerSubmit() : this.nextQuestion();
        }
        if (e.key.toLowerCase() === 'n') this.nextQuestion();
        if (e.key.toLowerCase() === 'p') this.prevQuestion();
        if (e.key.toLowerCase() === 'm') this.toggleMarked();
        if (e.key.toLowerCase() === 'i') this.showProfileView();
        if (e.key === 'Escape') {
            if (this.session === 'review') this.startMainSession();
            else this.showQuizView();
        }
    }
}

new QuizApp();
