/**
 * functions/api/review.js
 * GET /api/review?userId=xxx&filter=wrong   → 只看错题
 * GET /api/review?userId=xxx&filter=marked  → 只看标记
 * GET /api/review?userId=xxx&filter=all     → 错题+标记
 */
export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const filter = url.searchParams.get('filter') ?? 'all';

    if (!userId) return Response.json({ error: 'userId required' }, { status: 400 });

    let sql = `SELECT question_id, is_wrong, is_marked, wrong_count, correct_count, note
               FROM mark_history WHERE user_id = ?`;

    if (filter === 'wrong') {
        sql += ' AND is_wrong = 1';
    } else if (filter === 'marked') {
        sql += ' AND is_marked = 1';
    } else {
        sql += ' AND (is_wrong = 1 OR is_marked = 1)';
    }

    const { results } = await env.DB.prepare(sql).bind(userId).all();

    return Response.json({ items: results });
}
