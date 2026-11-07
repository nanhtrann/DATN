export const applicationSelect = `SELECT a.*, c.full_name AS candidate_name, c.email AS candidate_email, c.phone AS candidate_phone,
    j.title AS job_title, e.match_score, e.pros, e.cons, e.suggested_questions, e.evaluated_at
    FROM applications a JOIN candidates c ON c.id = a.candidate_id
    JOIN jobs j ON j.id = a.job_id LEFT JOIN ai_evaluations e ON e.application_id = a.id`;
