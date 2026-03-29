/**
 * functions/api/history.js
 * GET /api/history?userId=xxx
 * 返回该用户所有题目的答题历史（用于初始化本地状态）
 */
export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    if (!userId) return Response.json({ error: 'userId required' }, { status: 400 });

    const { results } = await env.DB.prepare(
        `SELECT question_id, is_wrong, is_marked, wrong_count, correct_count, note
         FROM mark_history WHERE user_id = ?`
    ).bind(userId).all();

    // 转成 { [questionId]: { isWrong, isMarked, wrongCount, correctCount, note } }
    const map = {};
    for (const row of results) {
        map[row.question_id] = {
            isWrong: row.is_wrong === 1,
            isMarked: row.is_marked === 1,
            wrongCount: row.wrong_count,
            correctCount: row.correct_count,
            note: row.note
        };
    }

    return Response.json({ history: map });
}
