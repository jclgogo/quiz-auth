/**
 * functions/api/sync.js
 * POST /api/sync
 * 实时同步单题的答题结果和标记状态到 mark_history 表
 * Body: { userId, questionId, isWrong, isMarked, wrongCount, correctCount, note }
 */
export async function onRequestPost({ request, env }) {
    try {
        const body = await request.json();
        const { userId, questionId, isWrong, isMarked, wrongCount, correctCount, note } = body;

        if (!userId || !questionId) {
            return Response.json({ error: 'userId and questionId required' }, { status: 400 });
        }

        const now = Date.now();

        await env.DB.prepare(`
            INSERT INTO mark_history (user_id, question_id, is_wrong, is_marked, wrong_count, correct_count, note, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, question_id) DO UPDATE SET
                is_wrong = excluded.is_wrong,
                is_marked = excluded.is_marked,
                wrong_count = excluded.wrong_count,
                correct_count = excluded.correct_count,
                note = excluded.note,
                updated_at = excluded.updated_at
        `).bind(
            userId,
            questionId,
            isWrong ? 1 : 0,
            isMarked ? 1 : 0,
            wrongCount ?? 0,
            correctCount ?? 0,
            note ?? '',
            now
        ).run();

        return Response.json({ ok: true });
    } catch (e) {
        return Response.json({ error: String(e) }, { status: 500 });
    }
}
