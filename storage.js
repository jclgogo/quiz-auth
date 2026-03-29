/**
 * storage.js - 云端+本地双写数据层（邮件登录版）
 */

const LOCAL_KEY = 'quiz_cloud_data';
const AUTH_KEY  = 'quiz_auth';   // { userId, email, loginAt }

function createEmptyLocal() {
    return {
        preferences: { mode: 'sequential', selectedTypes: ['judge', 'single', 'multi'] },
        questions: {},
        lastQid: ''
    };
}

function normalizeTypes(t) {
    const allowed = new Set(['judge', 'single', 'multi']);
    const arr = Array.isArray(t) ? t.filter(x => allowed.has(x)) : [];
    return arr.length > 0 ? arr : ['judge', 'single', 'multi'];
}

class StorageManager {
    constructor() {
        this._auth = this._loadAuth();
        this.local = this._loadLocal();
    }

    // ── 认证相关 ────────────────────────────────────────────

    _loadAuth() {
        try {
            const raw = localStorage.getItem(AUTH_KEY);
            if (raw) return JSON.parse(raw);
        } catch {}
        return null;
    }

    isLoggedIn() {
        return !!this._auth?.userId;
    }

    getEmail() {
        return this._auth?.email ?? '';
    }

    getUserId() {
        return this._auth?.userId ?? '';
    }

    setAuth(userId, email) {
        this._auth = { userId, email, loginAt: Date.now() };
        localStorage.setItem(AUTH_KEY, JSON.stringify(this._auth));
    }

    logout() {
        this._auth = null;
        localStorage.removeItem(AUTH_KEY);
        this.local = createEmptyLocal();
        this._saveLocal();
    }

    // ── 本地缓存 ────────────────────────────────────────────

    _loadLocal() {
        try {
            const raw = localStorage.getItem(LOCAL_KEY);
            if (raw) return JSON.parse(raw);
        } catch {}
        return createEmptyLocal();
    }

    _saveLocal() {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(this.local));
    }

    // ── 云端同步 ────────────────────────────────────────────

    async loadFromCloud() {
        if (!this.isLoggedIn()) return;
        const uid = this.getUserId();

        try {
            const res = await fetch(`/api/history?userId=${encodeURIComponent(uid)}`);
            if (!res.ok) return;
            const { history } = await res.json();
            if (!history) return;
            for (const [qid, data] of Object.entries(history)) {
                this.local.questions[qid] = {
                    wrongCount:   data.wrongCount   ?? 0,
                    correctCount: data.correctCount ?? 0,
                    isWrong:      !!data.isWrong,
                    isMarked:     !!data.isMarked,
                    note:         data.note ?? ''
                };
            }
            this._saveLocal();
        } catch (e) {
            console.warn('[storage] loadFromCloud failed:', e);
        }

        try {
            const res = await fetch(`/api/progress?userId=${encodeURIComponent(uid)}`);
            if (!res.ok) return;
            const { progress } = await res.json();
            if (!progress) return;
            if (progress.mode) this.local.preferences.mode = progress.mode;
            if (progress.selected_types) {
                this.local.preferences.selectedTypes = normalizeTypes(progress.selected_types.split(','));
            }
            if (progress.current_qid) this.local.lastQid = progress.current_qid;
            this._saveLocal();
        } catch (e) {
            console.warn('[storage] loadProgress failed:', e);
        }
    }

    async _syncQuestion(qid) {
        if (!this.isLoggedIn()) return;
        const q = this.local.questions[qid];
        if (!q) return;
        try {
            await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId:       this.getUserId(),
                    questionId:   qid,
                    isWrong:      q.isWrong,
                    isMarked:     q.isMarked,
                    wrongCount:   q.wrongCount,
                    correctCount: q.correctCount,
                    note:         q.note
                })
            });
        } catch (e) {
            console.warn('[storage] syncQuestion failed:', e);
        }
    }

    async saveProgressToCloud() {
        if (!this.isLoggedIn()) return false;
        try {
            const res = await fetch('/api/progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId:        this.getUserId(),
                    currentQid:    this.local.lastQid,
                    mode:          this.local.preferences.mode,
                    selectedTypes: this.local.preferences.selectedTypes
                })
            });
            return res.ok;
        } catch (e) {
            console.warn('[storage] saveProgress failed:', e);
            return false;
        }
    }

    // ── 题目数据操作 ────────────────────────────────────────

    getQuestionStat(qid) {
        const q = this.local.questions[qid];
        if (!q) return { wrongCount: 0, correctCount: 0, isWrong: false, isMarked: false, note: '' };
        return { ...q };
    }

    _ensureQ(qid) {
        if (!this.local.questions[qid]) {
            this.local.questions[qid] = { wrongCount: 0, correctCount: 0, isWrong: false, isMarked: false, note: '' };
        }
    }

    updateCorrect(qid) {
        this._ensureQ(qid);
        this.local.questions[qid].correctCount++;
        this.local.questions[qid].isWrong = this.local.questions[qid].wrongCount > 0;
        this.local.lastQid = qid;
        this._saveLocal();
        this._syncQuestion(qid);
    }

    updateWrong(qid) {
        this._ensureQ(qid);
        this.local.questions[qid].wrongCount++;
        this.local.questions[qid].isWrong = true;
        this.local.lastQid = qid;
        this._saveLocal();
        this._syncQuestion(qid);
    }

    toggleMarked(qid) {
        this._ensureQ(qid);
        this.local.questions[qid].isMarked = !this.local.questions[qid].isMarked;
        this.local.lastQid = qid;
        this._saveLocal();
        this._syncQuestion(qid);
        return this.local.questions[qid].isMarked;
    }

    setMarked(qid, val) {
        this._ensureQ(qid);
        this.local.questions[qid].isMarked = !!val;
        this._saveLocal();
        this._syncQuestion(qid);
    }

    saveNote(qid, note) {
        this._ensureQ(qid);
        this.local.questions[qid].note = typeof note === 'string' ? note : '';
        this.local.lastQid = qid;
        this._saveLocal();
        this._syncQuestion(qid);
    }

    getPreferences() {
        return {
            mode: this.local.preferences?.mode ?? 'sequential',
            selectedTypes: normalizeTypes(this.local.preferences?.selectedTypes)
        };
    }

    savePreferences({ mode, selectedTypes }) {
        if (mode) this.local.preferences.mode = mode;
        if (selectedTypes) this.local.preferences.selectedTypes = normalizeTypes(selectedTypes);
        this._saveLocal();
    }

    getLastQid()      { return this.local.lastQid ?? ''; }
    setLastQid(qid)   { this.local.lastQid = qid; this._saveLocal(); }

    getUserInfoSnapshot() {
        return {
            preferences: this.getPreferences(),
            progress: { questions: { ...this.local.questions } }
        };
    }

    getWrongQids() {
        return Object.entries(this.local.questions).filter(([, v]) => v.isWrong).map(([k]) => k);
    }

    getMarkedQids() {
        return Object.entries(this.local.questions).filter(([, v]) => v.isMarked).map(([k]) => k);
    }
}

export const storage = new StorageManager();
