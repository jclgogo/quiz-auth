/**
 * functions/api/auth/verify-pin.js
 * POST /api/auth/verify-pin
 * Body: { email, pin }
 * 验证成功后返回 { ok: true, userId: email }
 */
export async function onRequestPost({ request, env }) {
    try {
        const { email, pin } = await request.json();

        if (!email || !pin) {
            return Response.json({ error: '参数缺失' }, { status: 400 });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const now = Date.now();

        const record = await env.DB.prepare(
            `SELECT pin, expires_at, attempts FROM auth_pins WHERE email = ?`
        ).bind(normalizedEmail).first();

        if (!record) {
            return Response.json({ error: '验证码不存在，请重新发送' }, { status: 400 });
        }

        if (now > record.expires_at) {
            await env.DB.prepare(`DELETE FROM auth_pins WHERE email = ?`).bind(normalizedEmail).run();
            return Response.json({ error: '验证码已过期，请重新发送' }, { status: 400 });
        }

        // 防暴力破解：最多尝试5次
        if (record.attempts >= 5) {
            await env.DB.prepare(`DELETE FROM auth_pins WHERE email = ?`).bind(normalizedEmail).run();
            return Response.json({ error: '尝试次数过多，请重新发送验证码' }, { status: 400 });
        }

        if (record.pin !== pin.toString()) {
            await env.DB.prepare(
                `UPDATE auth_pins SET attempts = attempts + 1 WHERE email = ?`
            ).bind(normalizedEmail).run();
            const remaining = 4 - record.attempts;
            return Response.json({ error: `验证码错误，还可尝试 ${remaining} 次` }, { status: 400 });
        }

        // 验证成功，清除验证码
        await env.DB.prepare(`DELETE FROM auth_pins WHERE email = ?`).bind(normalizedEmail).run();

        // 用邮箱作为 userId
        return Response.json({ ok: true, userId: normalizedEmail });
    } catch (e) {
        console.error('verify-pin error:', e);
        return Response.json({ error: '服务器错误，请稍后重试' }, { status: 500 });
    }
}
