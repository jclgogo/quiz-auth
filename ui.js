/**
 * ui.js - 渲染题目 UI
 */

export const ui = {
    navLimits: { judge: 200, single: 200, multi: 200 },
    navExpandedType: 'judge',

    setNavExpanded(type) {
        if (!['judge', 'single', 'multi'].includes(type)) return;
        this.navExpandedType = type;
        this.applyNavExpanded();
    },

    applyNavExpanded() {
        const { nav } = this.getContainer();
        ['judge', 'single', 'multi'].forEach(type => {
            const el = nav[type];
            if (!el) return;
            el.classList.toggle('collapsed', type !== this.navExpandedType);
        });
    },

    resetNavLimits() {
        this.navLimits = { judge: 200, single: 200, multi: 200 };
    },

    increaseNavLimit(type, delta = 200) {
        this.navLimits[type] = Math.min((this.navLimits[type] || 0) + delta, 10000);
    },

    getContainer() {
        return {
            question: document.getElementById('question'),
            options: document.getElementById('options'),
            submit: document.getElementById('submit'),
            prevBtn: document.getElementById('prev-btn'),
            markBtn: document.getElementById('mark-btn'),
            result: document.getElementById('result'),
            explanation: document.getElementById('explanation'),
            stats: document.getElementById('stats'),
            noteArea: document.getElementById('note-area'),
            noteText: document.getElementById('note-text'),
            saveNote: document.getElementById('save-note'),
            nextBtn: document.getElementById('next-btn'),
            profileLink: document.getElementById('profile-link'),
            reviewLink: document.getElementById('review-link'),
            saveProgressBtn: document.getElementById('save-progress-btn'),
            showAnswerBtn: document.getElementById('show-answer-btn'),
            backToQuiz: document.getElementById('back-to-quiz'),
            backToQuizFromReview: document.getElementById('back-to-quiz-from-review'),
            quizView: document.getElementById('quiz-view'),
            profileView: document.getElementById('profile-view'),
            reviewView: document.getElementById('review-view'),
            syncStatus: document.getElementById('sync-status'),
            nav: {
                judge: document.getElementById('nav-judge'),
                single: document.getElementById('nav-single'),
                multi: document.getElementById('nav-multi')
            },
            profile: {
                summary: document.getElementById('profile-summary'),
                done: {
                    judge: document.getElementById('profile-done-judge'),
                    single: document.getElementById('profile-done-single'),
                    multi: document.getElementById('profile-done-multi')
                },
                wrong: {
                    judge: document.getElementById('profile-wrong-judge'),
                    single: document.getElementById('profile-wrong-single'),
                    multi: document.getElementById('profile-wrong-multi')
                },
                marked: {
                    judge: document.getElementById('profile-marked-judge'),
                    single: document.getElementById('profile-marked-single'),
                    multi: document.getElementById('profile-marked-multi')
                }
            }
        };
    },

    getTypeLabel(type) {
        return { judge: '判断题', single: '单选题', multi: '多选题' }[type] || '未知';
    },

    showSyncStatus(msg, type = 'info') {
        const el = document.getElementById('sync-status');
        if (!el) return;
        el.textContent = msg;
        el.className = `sync-status sync-${type}`;
        el.style.display = 'inline-block';
        if (type !== 'loading') {
            setTimeout(() => { el.style.display = 'none'; }, 3000);
        }
    },

    renderQuestion(question, index, total, { marked } = {}) {
        const { question: qDiv, options: oDiv, submit, showAnswerBtn, result, explanation, stats, noteArea, markBtn } = this.getContainer();

        qDiv.innerHTML = `<h3>[${this.getTypeLabel(question.type)}] ${index + 1}/${total}</h3><p>${question.question}</p>`;
        oDiv.innerHTML = '';
        result.innerHTML = '';
        explanation.innerHTML = '';
        stats.innerHTML = '';
        noteArea.style.display = 'none';
        submit.style.display = 'block';
        if (showAnswerBtn) showAnswerBtn.style.display = 'inline-block';
        markBtn.textContent = marked ? '取消标记' : '标记';

        question.options.forEach((opt, i) => {
            const label = document.createElement('label');
            const input = document.createElement('input');
            const char = String.fromCharCode(65 + i);
            input.type = question.type === 'multi' ? 'checkbox' : 'radio';
            input.name = 'option';
            input.value = char;
            label.appendChild(input);
            label.appendChild(document.createTextNode(` ${opt}`));
            oDiv.appendChild(label);
        });
    },

    getUserAnswer(type) {
        const inputs = document.querySelectorAll('input[name="option"]:checked');
        if (type === 'multi') return Array.from(inputs).map(i => i.value).sort().join('');
        return inputs.length > 0 ? inputs[0].value : '';
    },

    renderResult(isCorrect, question, stat) {
        const { submit, showAnswerBtn, result, explanation, stats, noteArea, noteText } = this.getContainer();
        submit.style.display = 'none';
        if (showAnswerBtn) showAnswerBtn.style.display = 'none';
        result.innerHTML = isCorrect
            ? '<span class="correct">✓ 回答正确！</span>'
            : `<span class="wrong">✗ 回答错误。正确答案：${question.answer}</span>`;
        explanation.innerHTML = `<h4>解析：</h4><p>${question.explanation || '暂无解析'}</p>`;
        stats.innerHTML = `<h4>统计：</h4><p>答对 ${stat.correctCount} 次 &nbsp;|&nbsp; 答错 <strong>${stat.wrongCount}</strong> 次${stat.isMarked ? ' &nbsp;|&nbsp; <span class="tag-marked">已标记</span>' : ''}</p>`;
        noteArea.style.display = 'block';
        noteText.value = stat.note || '';
    },

    /** 显示答案但不计入答题记录，不影响提交按钮 */
    renderShowAnswer(question, stat) {
        const { submit, showAnswerBtn, result, explanation, stats, noteArea, noteText } = this.getContainer();
        submit.style.display = 'none';
        if (showAnswerBtn) showAnswerBtn.style.display = 'none';
        result.innerHTML = `<span class="show-answer-label">📖 正确答案：<strong>${question.answer}</strong></span>`;
        explanation.innerHTML = `<h4>解析：</h4><p>${question.explanation || '暂无解析'}</p>`;
        stats.innerHTML = `<h4>统计：</h4><p>答对 ${stat.correctCount} 次 &nbsp;|&nbsp; 答错 <strong>${stat.wrongCount}</strong> 次${stat.isMarked ? ' &nbsp;|&nbsp; <span class="tag-marked">已标记</span>' : ''}</p>`;
        noteArea.style.display = 'block';
        noteText.value = stat.note || '';
    },

    setView(view) {
        const { quizView, profileView, reviewView } = this.getContainer();
        quizView.style.display = view === 'quiz' ? 'block' : 'none';
        profileView.style.display = view === 'profile' ? 'block' : 'none';
        reviewView.style.display = view === 'review' ? 'block' : 'none';
    },

    renderQuestionNavigation(questions, currentIndex, records) {
        const { nav } = this.getContainer();
        nav.judge.innerHTML = '';
        nav.single.innerHTML = '';
        nav.multi.innerHTML = '';

        const byType = { judge: [], single: [], multi: [] };
        questions.forEach((q, idx) => { byType[q.type]?.push({ q, idx }); });

        const current = questions[currentIndex];
        if (current) {
            const arr = byType[current.type];
            const pos = arr.findIndex(item => item.idx === currentIndex);
            if (pos >= 0 && (this.navLimits[current.type] || 0) < pos + 1) {
                this.navLimits[current.type] = pos + 1;
            }
        }

        const renderType = (type, container) => {
            const items = byType[type];
            const limit = this.navLimits[type] || 200;
            items.slice(0, limit).forEach(({ q, idx }) => {
                const qid = `${q.type}_${q.id}`;
                const record = records[qid] || {};
                const done = (record.correctCount || 0) + (record.wrongCount || 0) > 0;
                const wrong = (record.wrongCount || 0) > 0;
                const marked = !!record.isMarked;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'nav-box';
                btn.textContent = String(q.id);
                btn.dataset.index = String(idx);
                btn.dataset.qid = qid;
                if (idx === currentIndex) btn.classList.add('is-current');
                if (done) btn.classList.add('is-done');
                if (wrong) btn.classList.add('is-wrong');
                if (marked) btn.classList.add('is-marked');
                container.appendChild(btn);
            });
            if (items.length > limit) {
                const more = document.createElement('button');
                more.type = 'button';
                more.className = 'nav-box nav-more';
                more.textContent = `更多(${items.length - limit})`;
                more.dataset.type = type;
                container.appendChild(more);
            }
        };

        renderType('judge', nav.judge);
        renderType('single', nav.single);
        renderType('multi', nav.multi);
        this.applyNavExpanded();
    },

    renderProfile(allQuestions, records) {
        const { profile } = this.getContainer();
        const questionByQid = new Map(allQuestions.map(q => [`${q.type}_${q.id}`, q]));
        const done = [], wrong = [], marked = [];

        Object.entries(records).forEach(([qid, stat]) => {
            const q = questionByQid.get(qid);
            if (!q) return;
            const total = (stat.correctCount || 0) + (stat.wrongCount || 0);
            if (total > 0) done.push(q);
            if ((stat.wrongCount || 0) > 0) wrong.push(q);
            if (stat.isMarked) marked.push(q);
        });

        const sortFn = (a, b) => a.type !== b.type ? a.type.localeCompare(b.type)
            : String(a.id).localeCompare(String(b.id), undefined, { numeric: true });

        [done, wrong, marked].forEach(arr => arr.sort(sortFn));

        profile.summary.innerHTML = `<div>总题数：${allQuestions.length}，已做：${done.length}，错题：${wrong.length}，标记：${marked.length}</div>`;

        const fillGrid = (container, items) => {
            container.innerHTML = '';
            items.forEach(q => {
                const qid = `${q.type}_${q.id}`;
                const stat = records[qid] || {};
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'nav-box';
                btn.textContent = String(q.id);
                btn.dataset.qid = qid;
                if ((stat.correctCount || 0) + (stat.wrongCount || 0) > 0) btn.classList.add('is-done');
                if ((stat.wrongCount || 0) > 0) btn.classList.add('is-wrong');
                if (stat.isMarked) btn.classList.add('is-marked');
                container.appendChild(btn);
            });
        };

        const groupByType = items => {
            const g = { judge: [], single: [], multi: [] };
            items.forEach(q => g[q.type]?.push(q));
            return g;
        };

        const dG = groupByType(done), wG = groupByType(wrong), mG = groupByType(marked);
        fillGrid(profile.done.judge, dG.judge);
        fillGrid(profile.done.single, dG.single);
        fillGrid(profile.done.multi, dG.multi);
        fillGrid(profile.wrong.judge, wG.judge);
        fillGrid(profile.wrong.single, wG.single);
        fillGrid(profile.wrong.multi, wG.multi);
        fillGrid(profile.marked.judge, mG.judge);
        fillGrid(profile.marked.single, mG.single);
        fillGrid(profile.marked.multi, mG.multi);
    },

    /** 渲染错题刷题页 */
    renderReviewList(questions, records, filter) {
        const container = document.getElementById('review-list');
        if (!container) return;

        let items = questions.filter(q => {
            const qid = `${q.type}_${q.id}`;
            const stat = records[qid] || {};
            if (filter === 'wrong') return stat.wrongCount > 0;
            if (filter === 'marked') return stat.isMarked;
            return stat.wrongCount > 0 || stat.isMarked;
        });

        const sortFn = (a, b) => a.type !== b.type ? a.type.localeCompare(b.type)
            : String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
        items.sort(sortFn);

        container.innerHTML = '';
        if (items.length === 0) {
            container.innerHTML = '<p class="empty-tip">暂无符合条件的题目</p>';
            return;
        }

        items.forEach(q => {
            const qid = `${q.type}_${q.id}`;
            const stat = records[qid] || {};
            const card = document.createElement('div');
            card.className = 'review-card';
            card.dataset.qid = qid;

            const tags = [];
            if (stat.wrongCount > 0) tags.push(`<span class="tag-wrong">错题 ×${stat.wrongCount}</span>`);
            if (stat.isMarked) tags.push(`<span class="tag-marked">已标记</span>`);

            card.innerHTML = `
                <div class="review-card-header">
                    <span class="review-type">[${this.getTypeLabel(q.type)}] #${q.id}</span>
                    <span class="review-tags">${tags.join('')}</span>
                </div>
                <div class="review-question">${q.question}</div>
                <div class="review-actions">
                    <button class="btn btn-compact btn-primary review-go" data-qid="${qid}">去做这题</button>
                    ${stat.isMarked ? `<button class="btn btn-compact btn-secondary review-unmark" data-qid="${qid}">移除标记</button>` : ''}
                </div>
            `;
            container.appendChild(card);
        });
    }
};
