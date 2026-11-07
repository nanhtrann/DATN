import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../db/pool.js';
import { allowRoles } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { analyzeResume } from '../services/resume.service.js';
import { applicationOutcomeTemplate, sendEmail } from '../services/email.service.js';
import { config } from '../config/env.js';
import { applicationSelect } from '../db/queries.js';
import { httpError, pagination, parseId, parseStoredList, requireFields } from '../utils/http.js';

const router = express.Router();



router.get('/', async (req, res) => {
    const { limit, page, offset } = pagination(req.query);
    const filters = [];
    const values = [];
    if (req.query.jobId) {
        filters.push('a.job_id = ?');
        values.push(parseId(req.query.jobId, 'Job ID'));
    }
    if (req.query.status) {
        if (!['new', 'screening', 'interview', 'hired', 'rejected'].includes(req.query.status)) {
            throw httpError(400, 'Trạng thái hồ sơ không hợp lệ.');
        }
        filters.push('a.status = ?');
        values.push(req.query.status);
    }
    if (req.query.scheduleEligible === 'true') {
        filters.push("a.status NOT IN ('hired', 'rejected')");
        filters.push(`NOT EXISTS (
            SELECT 1 FROM interviews existing
            WHERE existing.application_id = a.id AND existing.status = 'scheduled'
        )`);
    }
    if (req.query.search) {
        filters.push('(c.full_name LIKE ? OR c.email LIKE ? OR j.title LIKE ?)');
        const term = `%${String(req.query.search).slice(0, 100)}%`;
        values.push(term, term, term);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [rows] = await pool.execute(`${applicationSelect} ${where} ORDER BY a.applied_at DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
    const data = rows.map((row) => ({
        ...row,
        pros: parseStoredList(row.pros),
        cons: parseStoredList(row.cons),
        suggested_questions: parseStoredList(row.suggested_questions)
    }));
    const [counts] = await pool.execute(
        `SELECT COUNT(*) AS total FROM applications a JOIN candidates c ON c.id = a.candidate_id JOIN jobs j ON j.id = a.job_id ${where}`,
        values
    );
    res.json({ data, pagination: { page, limit, total: counts[0].total } });
});

router.post('/', allowRoles('admin', 'hr'), async (req, res) => {
    requireFields(req.body, ['jobId', 'candidateId']);
    const jobId = parseId(req.body.jobId, 'Job ID');
    const candidateId = parseId(req.body.candidateId, 'Candidate ID');
    const [jobs] = await pool.execute("SELECT id FROM jobs WHERE id = ? AND status = 'opening'", [jobId]);
    if (!jobs.length) throw httpError(404, 'Tin tuyển dụng không tồn tại hoặc đã đóng.');
    const [candidates] = await pool.execute('SELECT id FROM candidates WHERE id = ?', [candidateId]);
    if (!candidates.length) throw httpError(404, 'Không tìm thấy ứng viên.');
    const [existingApplications] = await pool.execute(
        'SELECT id FROM applications WHERE job_id = ? AND candidate_id = ? LIMIT 1',
        [jobId, candidateId]
    );
    if (existingApplications.length) throw httpError(409, 'Ứng viên đã có hồ sơ cho vị trí này.');
    const [result] = await pool.execute(
        "INSERT INTO applications (job_id, candidate_id, cv_file_url, status) VALUES (?, ?, ?, 'new')",
        [jobId, candidateId, req.body.cvFileUrl ? String(req.body.cvFileUrl).slice(0, 255) : '']
    );
    res.status(201).json({ data: { id: result.insertId, job_id: jobId, candidate_id: candidateId, status: 'new' } });
});

router.get('/:id', async (req, res) => {
    const [rows] = await pool.execute(`${applicationSelect} WHERE a.id = ?`, [parseId(req.params.id)]);
    if (!rows.length) throw httpError(404, 'Không tìm thấy hồ sơ ứng tuyển.');
    res.json({
        data: {
            ...rows[0],
            pros: parseStoredList(rows[0].pros),
            cons: parseStoredList(rows[0].cons),
            suggested_questions: parseStoredList(rows[0].suggested_questions)
        }
    });
});

router.patch('/:id', allowRoles('admin', 'hr'), async (req, res) => {
    const id = parseId(req.params.id);
    const updates = [];
    const values = [];
    if (req.body.status !== undefined) {
        if (!['new', 'screening', 'interview', 'hired', 'rejected'].includes(req.body.status)) {
            throw httpError(400, 'Trạng thái hồ sơ không hợp lệ.');
        }
        updates.push('status = ?');
        values.push(req.body.status);
    }
    if (req.body.cvFileUrl !== undefined) {
        updates.push('cv_file_url = ?');
        values.push(String(req.body.cvFileUrl).slice(0, 255));
    }
    if (req.body.outcomeReason !== undefined) {
        updates.push('outcome_reason = ?');
        values.push(req.body.outcomeReason ? String(req.body.outcomeReason).slice(0, 255) : null);
    }
    if (req.body.outcomeNotes !== undefined) {
        updates.push('outcome_notes = ?');
        values.push(req.body.outcomeNotes ? String(req.body.outcomeNotes).slice(0, 5000) : null);
    }
    if (req.body.rating !== undefined) {
        if (req.body.rating !== null && (!Number.isInteger(Number(req.body.rating)) || Number(req.body.rating) < 1 || Number(req.body.rating) > 5)) {
            throw httpError(400, 'Điểm đánh giá phải từ 1 đến 5.');
        }
        updates.push('rating = ?');
        values.push(req.body.rating === null ? null : Number(req.body.rating));
    }
    if (req.body.internalNotes !== undefined) {
        updates.push('internal_notes = ?');
        values.push(String(req.body.internalNotes).slice(0, 5000));
    }
    if (req.body.status === 'hired' || req.body.status === 'rejected') {
        updates.push('decision_at = COALESCE(decision_at, NOW())', 'decision_by = COALESCE(decision_by, ?)');
        values.push(req.user.id);
    }
    if (!updates.length) throw httpError(400, 'Cần cung cấp status hoặc cvFileUrl để cập nhật.');
    let applicationDetails = null;
    if (req.body.status === 'hired' || req.body.status === 'rejected') {
        const [details] = await pool.execute(
            `SELECT a.status, c.full_name, c.email, j.title
             FROM applications a
             JOIN candidates c ON c.id = a.candidate_id
             JOIN jobs j ON j.id = a.job_id
             WHERE a.id = ?`,
            [id]
        );
        applicationDetails = details[0] || null;
    }
    const [result] = await pool.execute(`UPDATE applications SET ${updates.join(', ')} WHERE id = ?`, [...values, id]);
    if (!result.affectedRows) throw httpError(404, 'Không tìm thấy hồ sơ ứng tuyển.');
    const [rows] = await pool.execute(`${applicationSelect} WHERE a.id = ?`, [id]);

    let outcomeEmail = 'not_requested';
    if ((req.body.status === 'hired' || req.body.status === 'rejected')
        && applicationDetails && applicationDetails.status !== req.body.status) {
        try {
            await sendEmail({
                to: applicationDetails.email,
                ...applicationOutcomeTemplate({
                    candidateName: applicationDetails.full_name,
                    jobTitle: applicationDetails.title,
                    hired: req.body.status === 'hired'
                })
            });

            router.post('/bulk-status', allowRoles('admin', 'hr'), async (req, res) => {
                if (!Array.isArray(req.body.applicationIds) || !req.body.applicationIds.length) {
                    throw httpError(400, 'Cần chọn ít nhất một hồ sơ.');
                }
                if (!['new', 'screening', 'interview', 'hired', 'rejected'].includes(req.body.status)) {
                    throw httpError(400, 'Trạng thái hồ sơ không hợp lệ.');
                }
                const ids = [...new Set(req.body.applicationIds.map((id) => parseId(id, 'Application ID')))];
                const placeholders = ids.map(() => '?').join(', ');
                const [result] = await pool.execute(
                    `UPDATE applications SET status = ?${req.body.status === 'hired' || req.body.status === 'rejected'
                        ? ", decision_at = COALESCE(decision_at, NOW()), decision_by = COALESCE(decision_by, ?)" : ''} WHERE id IN (${placeholders})`,
                    req.body.status === 'hired' || req.body.status === 'rejected'
                        ? [req.body.status, req.user.id, ...ids]
                        : [req.body.status, ...ids]
                );
                res.json({ data: { updated: result.affectedRows } });
            });
            outcomeEmail = 'sent';
        } catch (error) {
            console.error('Gửi email kết quả ứng tuyển thất bại:', error.message);
            outcomeEmail = 'failed';
        }
    }
    res.json({ data: rows[0], outcomeEmail });
});

router.delete('/:id', allowRoles('admin', 'hr'), async (req, res) => {
    const id = parseId(req.params.id);
    const [rows] = await pool.execute(
        'SELECT cv_file_url FROM applications WHERE id = ?',
        [id]
    );
    if (!rows.length) throw httpError(404, 'Không tìm thấy hồ sơ ứng tuyển.');

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute('DELETE FROM ai_evaluations WHERE application_id = ?', [id]);
        await connection.execute('DELETE FROM application_notes WHERE application_id = ?', [id]);
        await connection.execute('DELETE FROM interviews WHERE application_id = ?', [id]);
        await connection.execute('DELETE FROM offers WHERE application_id = ?', [id]);
        const [result] = await connection.execute('DELETE FROM applications WHERE id = ?', [id]);
        if (!result.affectedRows) throw httpError(404, 'Không tìm thấy hồ sơ ứng tuyển.');
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
    const filename = path.basename(rows[0].cv_file_url || '');
    if (filename) {
        await fs.unlink(path.join(config.uploadDirectory, filename)).catch((error) => {
            if (error.code !== 'ENOENT') console.error('Không thể xóa file CV:', error.message);
        });
    }
    res.json({ message: 'Đã xóa hồ sơ ứng tuyển.' });
});

router.post('/process-cv', upload.single('cvFile'), async (req, res) => {
    if (!req.file) throw httpError(400, 'Vui lòng tải lên file PDF trong trường cvFile.');
    let keepFile = false;
    try {
        requireFields(req.body, ['jobId']);
        const jobId = parseId(req.body.jobId, 'Job ID');
        const [jobs] = await pool.execute(
            "SELECT id, title, description FROM jobs WHERE id = ? AND status = 'opening'",
            [jobId]
        );
        if (!jobs.length) throw httpError(404, 'Không tìm thấy tin tuyển dụng đang mở.');
        const evaluation = await analyzeResume(req.file.path, `${jobs[0].title}\n${jobs[0].description}`);
        const relativePath = `uploads/${path.basename(req.file.path)}`;
        const connection = await pool.getConnection();
        let candidateId;
        let applicationId;
        try {
            await connection.beginTransaction();
            const [existing] = await connection.execute('SELECT id FROM candidates WHERE email = ?', [evaluation.email]);
            if (existing.length) {
                candidateId = existing[0].id;
                await connection.execute(
                    'UPDATE candidates SET full_name = ?, phone = ? WHERE id = ?',
                    [evaluation.name, evaluation.phone, candidateId]
                );
            } else {
                const [candidate] = await connection.execute(
                    'INSERT INTO candidates (full_name, email, phone) VALUES (?, ?, ?)',
                    [evaluation.name, evaluation.email, evaluation.phone]
                );
                candidateId = candidate.insertId;
            }
            const [existingApplications] = await connection.execute(
                'SELECT id FROM applications WHERE job_id = ? AND candidate_id = ? LIMIT 1',
                [jobId, candidateId]
            );
            if (existingApplications.length) throw httpError(409, 'Ứng viên đã có hồ sơ cho vị trí này.');
            const [application] = await connection.execute(
                "INSERT INTO applications (job_id, candidate_id, cv_file_url, status) VALUES (?, ?, ?, 'new')",
                [jobId, candidateId, relativePath]
            );
            applicationId = application.insertId;
            await connection.execute(
                `INSERT INTO ai_evaluations (application_id, match_score, pros, cons, suggested_questions)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    applicationId, evaluation.match_score ?? 0,
                    JSON.stringify(evaluation.pros), JSON.stringify(evaluation.cons),
                    JSON.stringify(evaluation.suggested_questions)
                ]
            );
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
        keepFile = true;
        res.status(201).json({
            message: 'Đã trích xuất và phân tích CV.',
            applicationId,
            candidateId,
            data: evaluation
        });
    } finally {
        if (!keepFile) {
            await fs.unlink(req.file.path).catch((error) => {
                if (error.code !== 'ENOENT') console.error('Không thể xóa CV tạm:', error.message);
            });
        }
    }
});

router.post('/:id/evaluate', allowRoles('admin', 'hr'), async (req, res) => {
    const applicationId = parseId(req.params.id);
    const [rows] = await pool.execute(
        `SELECT a.cv_file_url, j.title, j.description FROM applications a
         JOIN jobs j ON j.id = a.job_id WHERE a.id = ?`,
        [applicationId]
    );
    if (!rows.length) throw httpError(404, 'Không tìm thấy hồ sơ ứng tuyển.');
    const filename = path.basename(rows[0].cv_file_url || '');
    if (!filename) throw httpError(404, 'Hồ sơ chưa có file CV.');
    const filePath = path.join(config.uploadDirectory, filename);
    try {
        await fs.access(filePath);
    } catch {
        throw httpError(404, 'File CV không còn tồn tại trên máy chủ.');
    }
    const evaluation = await analyzeResume(filePath, `${rows[0].title}\n${rows[0].description}`);
    await pool.execute(
        `INSERT INTO ai_evaluations (application_id, match_score, pros, cons, suggested_questions)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE match_score = VALUES(match_score), pros = VALUES(pros),
            cons = VALUES(cons), suggested_questions = VALUES(suggested_questions), evaluated_at = CURRENT_TIMESTAMP`,
        [
            applicationId, evaluation.match_score ?? 0, JSON.stringify(evaluation.pros),
            JSON.stringify(evaluation.cons), JSON.stringify(evaluation.suggested_questions)
        ]
    );
    res.json({ data: evaluation });
});

router.get('/:id/evaluation', async (req, res) => {
    const [rows] = await pool.execute(
        `SELECT e.application_id, e.match_score, e.pros, e.cons, e.suggested_questions, e.evaluated_at
         FROM ai_evaluations e WHERE e.application_id = ?`,
        [parseId(req.params.id)]
    );
    if (!rows.length) throw httpError(404, 'Hồ sơ chưa có kết quả đánh giá AI.');
    const evaluation = rows[0];
    res.json({
        data: {
            ...evaluation,
            pros: parseStoredList(evaluation.pros),
            cons: parseStoredList(evaluation.cons),
            suggested_questions: parseStoredList(evaluation.suggested_questions)
        }
    });
});

router.get('/:id/cv', async (req, res) => {
    const [rows] = await pool.execute(
        `SELECT a.cv_file_url, c.full_name FROM applications a
         JOIN candidates c ON c.id = a.candidate_id WHERE a.id = ?`,
        [parseId(req.params.id)]
    );
    if (!rows.length) throw httpError(404, 'Không tìm thấy hồ sơ ứng tuyển.');
    const filename = path.basename(rows[0].cv_file_url || '');
    if (!filename) throw httpError(404, 'Hồ sơ chưa có file CV.');
    const filePath = path.join(config.uploadDirectory, filename);
    try {
        await fs.access(filePath);
    } catch {
        throw httpError(404, 'File CV không còn tồn tại trên máy chủ.');
    }
    res.download(filePath, `${rows[0].full_name.replace(/[^\p{L}\p{N}_-]/gu, '_')}-CV.pdf`);
});

router.post('/:id/email', allowRoles('admin', 'hr'), async (req, res) => {
    const applicationId = parseId(req.params.id);
    requireFields(req.body, ['subject', 'text']);
    const [rows] = await pool.execute(
        'SELECT c.email FROM applications a JOIN candidates c ON c.id = a.candidate_id WHERE a.id = ?',
        [applicationId]
    );
    if (!rows.length) throw httpError(404, 'Không tìm thấy hồ sơ ứng tuyển.');
    const recipient = req.body.to ? String(req.body.to).trim() : rows[0].email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
        throw httpError(400, 'Email người nhận không hợp lệ.');
    }
    const subject = String(req.body.subject);
    if (!subject.trim() || subject.length > 255 || /[\r\n]/.test(subject)) {
        throw httpError(400, 'Tiêu đề email phải có từ 1 đến 255 ký tự và không chứa xuống dòng.');
    }
    try {
        await sendEmail({ to: recipient, subject, text: String(req.body.text) });
    } catch (error) {
        console.error('Gửi email thất bại:', error.message);
        if (error.status) throw error;
        throw httpError(502, 'Gửi email thất bại; hãy kiểm tra cấu hình SMTP và nhật ký máy chủ.');
    }
    res.json({ message: 'Đã gửi email.', recipient });
});

export default router;
