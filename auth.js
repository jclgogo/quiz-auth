import { storage } from './storage.js';

class AuthManager {
    constructor() {
        this.onLoginSuccess = null;

        this._pendingEmail = '';
        this._countdown = 0;
        this._countdownTimer = null;

        this._isMock = false;
    }

    init(onLoginSuccess) {
        this.onLoginSuccess = onLoginSuccess;
        this._injectModal();
        this._bindEvents();
    }

    _injectModal() {
        const html = `
        <div id="auth-overlay" class="auth-overlay" style="display:none;">
            <div class="auth-modal">
                <div class="auth-header">
                    <h2>登录 / 注册</h2>
                    <p class="auth-sub">用邮箱登录，数据跨设备同步</p>
                </div>

                <!-- Email -->
                <div id="auth-step-email" class="auth-step">
                    <label class="auth-label">邮箱地址</label>
                    <input type="email" id="auth-email-input" class="auth-input"
                        placeholder="your@email.com" autocomplete="email"/>
                    <button id="auth-send-btn" class="btn btn-primary auth-btn">发送验证码</button>
                    <div id="auth-email-error" class="auth-error"></div>
                </div>

                <!-- PIN -->
                <div id="auth-step-pin" class="auth-step" style="display:none;">
                    <p class="auth-hint" id="auth-hint"></p>

                    <label class="auth-label">6位验证码</label>
                    <input type="text" id="auth-pin-input" class="auth-input auth-pin"
                        placeholder="000000" maxlength="6" inputmode="numeric"/>

                    <button id="auth-verify-btn" class="btn btn-primary auth-btn">登录</button>

                    <div class="auth-resend-row">
                        <button id="auth-resend-btn" class="auth-resend-link" disabled>
                            重新发送(<span id="auth-countdown">60</span>s)
                        </button>
                        <button id="auth-back-btn" class="auth-link">换个邮箱</button>
                    </div>

                    <div id="auth-pin-error" class="auth-error"></div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    _bindEvents() {
        document.getElementById('auth-send-btn').onclick = () => this._sendPin();

        document.getElementById('auth-email-input').onkeydown = (e) => {
            if (e.key === 'Enter') this._sendPin();
        };

        document.getElementById('auth-verify-btn').onclick = () => this._verifyPin();

        document.getElementById('auth-pin-input').onkeydown = (e) => {
            if (e.key === 'Enter') this._verifyPin();
        };

        document.getElementById('auth-resend-btn').onclick = () => this._sendPin(true);

        document.getElementById('auth-back-btn').onclick = () => this._goToEmailStep();
    }

    show() {
        this._goToEmailStep();
        document.getElementById('auth-overlay').style.display = 'flex';
        setTimeout(() => document.getElementById('auth-email-input').focus(), 100);
    }

    hide() {
        document.getElementById('auth-overlay').style.display = 'none';
    }

    // =========================
    // Send PIN
    // =========================
    async _sendPin(isResend = false) {
        const emailInput = document.getElementById('auth-email-input');
        const errorEl = document.getElementById('auth-email-error');
        const sendBtn = document.getElementById('auth-send-btn');

        const email = (isResend ? this._pendingEmail : emailInput.value)
            .trim()
            .toLowerCase();

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errorEl.textContent = '请输入有效的邮箱地址';
            return;
        }

        errorEl.textContent = '';
        sendBtn.disabled = true;
        sendBtn.textContent = '发送中...';

        try {
            const res = await fetch('/api/auth/send-pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const data = await res.json();

            if (!res.ok) {
                errorEl.textContent = data.error || '发送失败';
                sendBtn.disabled = false;
                sendBtn.textContent = '发送验证码';
                return;
            }

            // ===== 成功 =====
            this._pendingEmail = email;
            this._isMock = !!data.mock;

            this._goToPinStep(this._isMock);
            this._startCountdown();

            // 统一提示（关键修复）
            this._toast(data.message || '验证码已发送');

        } catch (e) {
            errorEl.textContent = '网络错误，请重试';
            sendBtn.disabled = false;
            sendBtn.textContent = '发送验证码';
        }
    }

    // =========================
    // Verify PIN
    // =========================
    async _verifyPin() {
        const pin = document.getElementById('auth-pin-input').value.trim();
        const errorEl = document.getElementById('auth-pin-error');
        const btn = document.getElementById('auth-verify-btn');

        if (!pin || pin.length !== 6) {
            errorEl.textContent = '请输入6位验证码';
            return;
        }

        errorEl.textContent = '';
        btn.disabled = true;
        btn.textContent = '验证中...';

        try {
            const res = await fetch('/api/auth/verify-pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: this._pendingEmail,
                    pin
                })
            });

            const data = await res.json();

            if (!res.ok) {
                errorEl.textContent = data.error || '验证失败';
                btn.disabled = false;
                btn.textContent = '登录';
                return;
            }

            storage.setAuth(data.userId, this._pendingEmail);

            this.hide();
            this._stopCountdown();

            this._toast('登录成功');

            if (this.onLoginSuccess) this.onLoginSuccess();

        } catch (e) {
            errorEl.textContent = '网络错误，请重试';
            btn.disabled = false;
            btn.textContent = '登录';
        }
    }

    // =========================
    // UI steps
    // =========================
    _goToEmailStep() {
        document.getElementById('auth-step-email').style.display = 'block';
        document.getElementById('auth-step-pin').style.display = 'none';

        document.getElementById('auth-email-error').textContent = '';

        const sendBtn = document.getElementById('auth-send-btn');
        sendBtn.disabled = false;
        sendBtn.textContent = '发送验证码';
    }

    _goToPinStep(isMock = false) {
        document.getElementById('auth-step-email').style.display = 'none';
        document.getElementById('auth-step-pin').style.display = 'block';

        const hint = document.getElementById('auth-hint');

        if (isMock) {
            hint.innerHTML = `
                ⚡ Mock账号：<b>${this._pendingEmail}</b><br/>
                任意6位验证码即可登录
            `;
        } else {
            hint.innerHTML = `
                验证码已发送至 <b>${this._pendingEmail}</b>
            `;
        }

        document.getElementById('auth-pin-input').value = '';
        document.getElementById('auth-pin-error').textContent = '';

        const btn = document.getElementById('auth-verify-btn');
        btn.disabled = false;
        btn.textContent = '登录';

        setTimeout(() => {
            document.getElementById('auth-pin-input').focus();
        }, 100);
    }

    // =========================
    // Countdown
    // =========================
    _startCountdown(seconds = 60) {
        this._stopCountdown();

        this._countdown = seconds;

        const btn = document.getElementById('auth-resend-btn');
        const span = document.getElementById('auth-countdown');

        btn.disabled = true;
        span.textContent = seconds;

        this._countdownTimer = setInterval(() => {
            this._countdown--;
            span.textContent = this._countdown;

            if (this._countdown <= 0) {
                this._stopCountdown();
                btn.disabled = false;
                btn.textContent = '重新发送';
            }
        }, 1000);
    }

    _stopCountdown() {
        if (this._countdownTimer) {
            clearInterval(this._countdownTimer);
            this._countdownTimer = null;
        }
    }

    // =========================
    // simple toast
    // =========================
    _toast(msg) {
        console.log('[AUTH]', msg);
        // 你可以替换成真正 UI toast
        // e.g. showToast(msg)
    }
}

export const auth = new AuthManager();
