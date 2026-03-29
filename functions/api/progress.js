/**
 * functions/api/progress.js
 * GET  /api/progress?userId=xxx  → 读取进度
 * POST /api/progress             → 保存进度（手动触发）
 */

export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    if (!userId) return Response.json({ error: 'userId required' }, { status: 400 });

    const row = await env.DB.prepare(
        'SELECT current_qid, mode, selected_types FROM quiz_progress WHERE user_id = ?'
    ).bind(userId).first();

    return Response.json({ progress: row ?? null });
}

export async function onRequestPost({ request, env }) {
    try {
        const body = await request.json();
        const { userId, currentQid, mode, selectedTypes } = body;
        if (!userId) return Response.json({ error: 'userId required' }, { status: 400 });

        const now = Date.now();
        const typesStr = Array.isArray(selectedTypes) ? selectedTypes.join(',') : (selectedTypes ?? 'judge,single,multi');

        await env.DB.prepare(`
            INSERT INTO quiz_progress (user_id, current_qid, mode, selected_types, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                current_qid = excluded.current_qid,
                mode = excluded.mode,
                selected_types = excluded.selected_types,
                updated_at = excluded.updated_at
        `).bind(userId, currentQid ?? '', mode ?? 'sequential', typesStr, now).run();

        return Response.json({ ok: true });
    } catch (e) {
        return Response.json({ error: String(e) }, { status: 500 });
    }
}
