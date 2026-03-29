/**
 * functions/api/auth/send-pin.js
 * POST /api/auth/send-pin
 * Body: { email }
 * 生成6位验证码，存入D1，通过Resend发送邮件
 */
export async function onRequestPost({ request, env }) {
    try {
        const { email } = await request.json();

        if (!email || !isValidEmail(email)) {
            return Response.json({ error: '请输入有效的邮箱地址' }, { status: 400 });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // 限流：同一邮箱60秒内只能发一次
        const recent = await env.DB.prepare(
            `SELECT created_at FROM auth_pins WHERE email = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1`
        ).bind(normalizedEmail, Date.now() - 60000).first();

        if (recent) {
            return Response.json({ error: '发送太频繁，请60秒后再试' }, { status: 429 });
        }

        // 生成6位验证码
        const pin = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 10 * 60 * 1000; // 10分钟有效

        // 存入D1（先删旧的）
        await env.DB.prepare(`DELETE FROM auth_pins WHERE email = ?`).bind(normalizedEmail).run();
        await env.DB.prepare(
            `INSERT INTO auth_pins (email, pin, expires_at, created_at) VALUES (?, ?, ?, ?)`
        ).bind(normalizedEmail, pin, expiresAt, Date.now()).run();

        // 发送邮件（Resend）
        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: env.RESEND_FROM_EMAIL || 'quiz@resend.dev',
                to: normalizedEmail,
                subject: '【刷题系统】登录验证码',
                html: `
                    <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:30px;">
                        <h2 style="color:#3498db;">刷题系统登录验证码</h2>
                        <p>你的验证码是：</p>
                        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#333;padding:20px;background:#f4f7f6;border-radius:8px;text-align:center;">
                            ${pin}
                        </div>
                        <p style="color:#888;font-size:14px;margin-top:20px;">验证码10分钟内有效，请勿泄露给他人。</p>
                    </div>
                `
            })
        });

        if (!emailRes.ok) {
            const err = await emailRes.text();
            console.error('Resend error:', err);
            return Response.json({ error: '邮件发送失败，请稍后重试' }, { status: 500 });
        }

        return Response.json({ ok: true, message: '验证码已发送，请查收邮件' });
    } catch (e) {
        console.error('send-pin error:', e);
        return Response.json({ error: '服务器错误，请稍后重试' }, { status: 500 });
    }
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
