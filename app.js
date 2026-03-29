/**
 * app.js - 主逻辑控制（云端同步 + 邮件登录版）
 */

import { storage } from './storage.js';
import { ui } from './ui.js';
import { auth } from './auth.js';

class QuizApp {
    constructor() {
        this.allQuestions = [];
        this.currentQuestions = [];
        this.currentIndex = 0;
        this.mode = 'sequential';
        this.selectedTypes = ['judge', 'single', 'multi'];
        this.reviewFilter = 'all';
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
        this.startQuiz();
    }

    async onLoginSuccess() {
        this.updateAuthUI();
        ui.showSyncStatus('登录成功，正在同步数据...', 'loading');
        await storage.loadFromCloud();
        ui.showSyncStatus(`已登录：${storage.getEmail()}`, 'success');
        this.loadPreferencesToState();
        this.applyStateToControls();
        this.startQuiz();
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

    setupEventListeners() {
        const c = ui.getContainer();

        c.submit.onclick               = () => this.handleAnswerSubmit();
        c.nextBtn.onclick              = () => this.nextQuestion();
        c.prevBtn.onclick              = () => this.prevQuestion();
        c.markBtn.onclick              = () => this.toggleMarked();
        c.saveNote.onclick             = () => this.handleSaveNote();
        c.showAnswerBtn.onclick        = () => this.handleShowAnswer();
        c.profileLink.onclick          = () => this.showProfileView();
        c.reviewLink.onclick           = () => this.showReviewView();
        c.backToQuiz.onclick           = () => this.showQuizView();
        c.backToQuizFromReview.onclick = () => this.showQuizView();

        document.getElementById('auth-btn').onclick = () => {
            if (storage.isLoggedIn()) {
                if (confirm(`确定退出登录？\n当前账号：${storage.getEmail()}`)) {
                    storage.logout();
                    this.updateAuthUI();
                    ui.showSyncStatus('已退出登录', 'info');
                    this.startQuiz();
                }
            } else {
                auth.show();
            }
        };

        c.saveProgressBtn.onclick = async () => {
            if (!storage.isLoggedIn()) { auth.show(); return; }
            ui.showSyncStatus('正在保存进度...', 'loading');
            const ok = await storage.saveProgressToCloud();
            ui.showSyncStatus(ok ? '进度已保存 ✓' : '保存失败，请重试', ok ? 'success' : 'error');
        };

        document.getElementById('mode-select').onchange = (e) => {
            this.mode = e.target.value;
            storage.savePreferences({ mode: this.mode, selectedTypes: this.selectedTypes });
            this.startQuiz();
        };

        document.querySelectorAll('input[name="type-filter"]').forEach(cb => {
            cb.onchange = () => {
                this.selectedTypes = Array.from(
                    document.querySelectorAll('input[name="type-filter"]:checked')
                ).map(c => c.value);
                storage.savePreferences({ mode: this.mode, selectedTypes: this.selectedTypes });
                this.startQuiz();
            };
        });

        document.querySelectorAll('.review-filter-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.review-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.reviewFilter = btn.dataset.filter;
                this.renderReview();
            };
        });

        document.getElementById('question-nav').addEventListener('click', (e) => {
            const target = e.target;
            if (!(target instanceof HTMLElement)) return;
            if (target.classList.contains('nav-more')) {
                const type = target.dataset.type;
                if (type) {
                    ui.increaseNavLimit(type, 200);
                    ui.renderQuestionNavigation(this.currentQuestions, this.currentIndex, storage.getUserInfoSnapshot().progress.questions);
                }
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

        document.getElementById('profile-view').addEventListener('click', (e) => {
            const target = e.target;
            if (target instanceof HTMLElement && target.classList.contains('nav-box') && target.dataset.qid) {
                this.jumpToQid(target.dataset.qid);
            }
        });

        document.getElementById('review-view').addEventListener('click', (e) => {
            const target = e.target;
            if (!(target instanceof HTMLElement)) return;
            if (target.classList.contains('review-go')) {
                this.jumpToQid(target.dataset.qid);
            } else if (target.classList.contains('review-unmark')) {
                storage.setMarked(target.dataset.qid, false);
                ui.showSyncStatus('已移除标记', 'success');
                this.renderReview();
            }
        });

        document.addEventListener('keydown', (e) => this.handleKeyPress(e));
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
        const question = this.currentQuestions[this.currentIndex];
        const qid = `${question.type}_${question.id}`;
        const stat = storage.getQuestionStat(qid);
        ui.renderQuestion(question, this.currentIndex, this.currentQuestions.length, { marked: stat.isMarked });
        ui.renderQuestionNavigation(this.currentQuestions, this.currentIndex, storage.getUserInfoSnapshot().progress.questions);
        ui.setNavExpanded(question.type);
        storage.setLastQid(qid);
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

        // 答对时 300ms 后自动跳下一题，但跳过同类型的最后一题
        if (isCorrect && !this._isLastOfType(this.currentIndex)) {
            this._autoAdvanceTimer = setTimeout(() => {
                // 跳转前再次检查（防止用户手动切走了）
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
        // 展示答案和解析，不记录答题结果，不触发自动跳转
        ui.renderShowAnswer(question, stat);
        ui.renderQuestionNavigation(this.currentQuestions, this.currentIndex, storage.getUserInfoSnapshot().progress.questions);
    }

    /**
     * 如：所有判断题里的最后一题、所有单选题里的最后一题
     */
    _isLastOfType(index) {
        const currentType = this.currentQuestions[index]?.type;
        if (!currentType) return true;
        // 找到该类型最后一道题的 index
        let lastIdx = -1;
        for (let i = this.currentQuestions.length - 1; i >= 0; i--) {
            if (this.currentQuestions[i].type === currentType) {
                lastIdx = i;
                break;
            }
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
        // 清除自动跳转定时器（用户手动切题时不再自动跳）
        if (this._autoAdvanceTimer) {
            clearTimeout(this._autoAdvanceTimer);
            this._autoAdvanceTimer = null;
        }
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
        const { submit, quizView } = ui.getContainer();
        if (quizView.style.display === 'none') return false;
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
    }

    showProfileView() {
        ui.renderProfile(this.allQuestions, storage.getUserInfoSnapshot().progress.questions);
        ui.setView('profile');
    }

    showReviewView() { this.renderReview(); ui.setView('review'); }
    showQuizView()   { ui.setView('quiz'); }

    renderReview() {
        ui.renderReviewList(this.allQuestions, storage.getUserInfoSnapshot().progress.questions, this.reviewFilter);
    }

    jumpToQid(qid) {
        const idx = this.currentQuestions.findIndex(q => `${q.type}_${q.id}` === qid);
        if (idx >= 0) { this.showQuizView(); this.goToIndex(idx); return; }
        this.mode = 'sequential';
        this.selectedTypes = ['judge', 'single', 'multi'];
        storage.savePreferences({ mode: this.mode, selectedTypes: this.selectedTypes });
        this.applyStateToControls();
        this.startQuiz();
        const nextIdx = this.currentQuestions.findIndex(q => `${q.type}_${q.id}` === qid);
        if (nextIdx >= 0) { this.showQuizView(); this.goToIndex(nextIdx); return; }
        alert('未找到该题目，可能题库已变更。');
    }

    handleSaveNote() {
        const question = this.currentQuestions[this.currentIndex];
        const qid = `${question.type}_${question.id}`;
        storage.saveNote(qid, document.getElementById('note-text').value);
        ui.showSyncStatus('笔记已保存', 'success');
        ui.renderQuestionNavigation(this.currentQuestions, this.currentIndex, storage.getUserInfoSnapshot().progress.questions);
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
        if (e.key === 'Escape') this.showQuizView();
    }
}

new QuizApp();
