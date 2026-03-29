/**
 * auth.js - 前端登录弹窗逻辑
 * 管理登录弹窗的显示、发送验证码、验证登录
 */

import { storage } from './storage.js';

class AuthManager {
    constructor() {
        this.onLoginSuccess = null; // 登录成功回调
        this._step = 'email';      // 'email' | 'pin'
        this._pendingEmail = '';
        this._countdown = 0;
        this._countdownTimer = null;
    }

    /** 初始化：注入HTML、绑定事件 */
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

                <!-- Step 1: 输入邮箱 -->
                <div id="auth-step-email" class="auth-step">
                    <label class="auth-label">邮箱地址</label>
                    <input type="email" id="auth-email-input" class="auth-input"
                        placeholder="your@email.com" autocomplete="email"/>
                    <button id="auth-send-btn" class="btn btn-primary auth-btn">发送验证码</button>
                    <div id="auth-email-error" class="auth-error"></div>
                </div>

                <!-- Step 2: 输入验证码 -->
                <div id="auth-step-pin" class="auth-step" style="display:none;">
                    <p class="auth-hint">验证码已发送至 <strong id="auth-email-show"></strong></p>
                    <label class="auth-label">6位验证码</label>
                    <input type="text" id="auth-pin-input" class="auth-input auth-pin"
                        placeholder="000000" maxlength="6" inputmode="numeric" autocomplete="one-time-code"/>
                    <button id="auth-verify-btn" class="btn btn-primary auth-btn">登录</button>
                    <div class="auth-resend-row">
                        <button id="auth-resend-btn" class="auth-resend-link" disabled>重新发送(<span id="auth-countdown">60</span>s)</button>
                        <button id="auth-back-btn" class="auth-link">换个邮箱</button>
                    </div>
                    <div id="auth-pin-error" class="auth-error"></div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    _bindEvents() {
        // 发送验证码
        document.getElementById('auth-send-btn').onclick = () => this._sendPin();
        // 邮箱输入框按回车
        document.getElementById('auth-email-input').onkeydown = (e) => { if (e.key === 'Enter') this._sendPin(); };
        // 验证
        document.getElementById('auth-verify-btn').onclick = () => this._verifyPin();
        // 验证码输入框按回车
        document.getElementById('auth-pin-input').onkeydown = (e) => { if (e.key === 'Enter') this._verifyPin(); };
        // 重新发送
        document.getElementById('auth-resend-btn').onclick = () => this._sendPin(true);
        // 返回输入邮箱
        document.getElementById('auth-back-btn').onclick = () => this._goToEmailStep();
    }

    /** 显示登录弹窗 */
    show() {
        this._goToEmailStep();
        document.getElementById('auth-overlay').style.display = 'flex';
        setTimeout(() => document.getElementById('auth-email-input').focus(), 100);
    }

    hide() {
        document.getElementById('auth-overlay').style.display = 'none';
    }

    async _sendPin(isResend = false) {
        const emailInput = document.getElementById('auth-email-input');
        const email = (isResend ? this._pendingEmail : emailInput.value.trim()).toLowerCase();
        const errorEl = document.getElementById('auth-email-error');

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errorEl.textContent = '请输入有效的邮箱地址';
            return;
        }

        errorEl.textContent = '';
        const sendBtn = document.getElementById('auth-send-btn');
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
                errorEl.textContent = data.error || '发送失败，请重试';
                sendBtn.disabled = false;
                sendBtn.textContent = '发送验证码';
                return;
            }

            this._pendingEmail = email;
            this._goToPinStep();
            this._startCountdown();
        } catch (e) {
            errorEl.textContent = '网络错误，请重试';
            sendBtn.disabled = false;
            sendBtn.textContent = '发送验证码';
        }
    }

    async _verifyPin() {
        const pin = document.getElementById('auth-pin-input').value.trim();
        const errorEl = document.getElementById('auth-pin-error');

        if (!pin || pin.length !== 6) {
            errorEl.textContent = '请输入6位验证码';
            return;
        }

        errorEl.textContent = '';
        const verifyBtn = document.getElementById('auth-verify-btn');
        verifyBtn.disabled = true;
        verifyBtn.textContent = '验证中...';

        try {
            const res = await fetch('/api/auth/verify-pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: this._pendingEmail, pin })
            });
            const data = await res.json();

            if (!res.ok) {
                errorEl.textContent = data.error || '验证失败';
                verifyBtn.disabled = false;
                verifyBtn.textContent = '登录';
                return;
            }

            // 登录成功
            storage.setAuth(data.userId, this._pendingEmail);
            this.hide();
            this._stopCountdown();
            if (this.onLoginSuccess) this.onLoginSuccess();
        } catch (e) {
            errorEl.textContent = '网络错误，请重试';
            verifyBtn.disabled = false;
            verifyBtn.textContent = '登录';
        }
    }

    _goToEmailStep() {
        document.getElementById('auth-step-email').style.display = 'block';
        document.getElementById('auth-step-pin').style.display = 'none';
        document.getElementById('auth-send-btn').disabled = false;
        document.getElementById('auth-send-btn').textContent = '发送验证码';
        document.getElementById('auth-email-error').textContent = '';
        this._step = 'email';
    }

    _goToPinStep() {
        document.getElementById('auth-step-email').style.display = 'none';
        document.getElementById('auth-step-pin').style.display = 'block';
        document.getElementById('auth-email-show').textContent = this._pendingEmail;
        document.getElementById('auth-pin-input').value = '';
        document.getElementById('auth-pin-error').textContent = '';
        document.getElementById('auth-verify-btn').disabled = false;
        document.getElementById('auth-verify-btn').textContent = '登录';
        this._step = 'pin';
        setTimeout(() => document.getElementById('auth-pin-input').focus(), 100);
    }

    _startCountdown(seconds = 60) {
        this._stopCountdown();
        this._countdown = seconds;
        const btn = document.getElementById('auth-resend-btn');
        const span = document.getElementById('auth-countdown');
        btn.disabled = true;
        span.textContent = this._countdown;

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
}

export const auth = new AuthManager();
