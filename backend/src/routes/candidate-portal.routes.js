import bcrypt from 'bcryptjs';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../db/pool.js';
import { signCandidateToken } from '../middleware/auth.js';
import { authenticateCandidate } from '../middleware/candidate-auth.js';
import { candidateLoginLimiter, candidateRegistrationLimiter } from '../middleware/rate-limit.js';
import { upload } from '../middleware/upload.js';
import { analyzeResume } from '../services/resume.service.js';
import { httpError, pagination, parseId, requireFields, validEmail } from '../utils/http.js';

const publicRouter = express.Router();
const privateRouter = express.Router();

function sessionResponse(account, res, status = 200) {
    const token = signCandidateToken({ id: account.id });
    res.status(status).json({
        token,
        tokenType: 'Bearer',
        expiresIn: 43200,
        user: { id: account.candidate_id, name: account.full_name, email: account.email }
    });
}

publicRouter.get('/jobs', async (req, res) => {
    const { limit, page, offset } = pagination(req.query);
    const search = String(req.query.search || '').trim().slice(0, 100);
    const filters = ["j.status = 'opening'"];
    const values = [];
    if (search) {
        filters.push('(j.title LIKE ? OR j.department LIKE ? OR j.description LIKE ?)');
        const pattern = `%${search}%`;
        values.push(pattern, pattern, pattern);
    }
    const where = filters.join(' AND ');
    const [data] = await pool.execute(
        `SELECT j.id, j.title, j.department, j.description, j.salary, j.created_at
         FROM jobs j WHERE ${where} ORDER BY j.created_at DESC LIMIT ? OFFSET ?`,
        [...values, limit, offset]
    );
    const [counts] = await pool.execute(`SELECT COUNT(*) AS total FROM jobs j WHERE ${where}`, values);
    res.json({ data, pagination: { page, limit, total: counts[0].total } });
});

publicRouter.post('/register', candidateRegistrationLimiter, async (req, res) => {
    requireFields(req.body, ['name', 'email', 'password']);
    const name = String(req.body.name).trim();
    const email = String(req.body.email).trim().toLowerCase();
    const password = String(req.body.password);
    const phone = req.body.phone ? String(req.body.phone).trim() : null;
    if (!name || name.length > 100 || !validEmail(email) || password.length < 10 || password.length > 128) {
        throw httpError(400, 'Tên/email không hợp lệ; mật khẩu cần từ 10 đến 128 ký tự.');
    }
    if (phone && phone.length > 20) throw httpError(400, 'Số điện thoại không được vượt quá 20 ký tự.');

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [existing] = await connection.execute('SELECT id FROM candidates WHERE email = ?', [email]);
        if (existing.length) {
            throw httpError(409, 'Email đã có trong hệ thống. Vui lòng liên hệ nhà tuyển dụng để được hỗ trợ tạo tài khoản.');
        }
        const [candidateResult] = await connection.execute(
            'INSERT INTO candidates (full_name, email, phone) VALUES (?, ?, ?)',
            [name, email, phone]
        );
        const passwordHash = await bcrypt.hash(password, 12);
        const [accountResult] = await connection.execute(
            'INSERT INTO candidate_accounts (candidate_id, password_hash) VALUES (?, ?)',
            [candidateResult.insertId, passwordHash]
        );
        await connection.commit();
        sessionResponse({
            id: accountResult.insertId,
            candidate_id: candidateResult.insertId,
            full_name: name,
            email
        }, res, 201);
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') throw httpError(409, 'Email đã được đăng ký.');
        throw error;
    } finally {
        connection.release();
    }
});

publicRouter.post('/login', candidateLoginLimiter, async (req, res) => {
    requireFields(req.body, ['email', 'password']);
    const email = String(req.body.email).trim().toLowerCase();
    if (!validEmail(email)) throw httpError(400, 'Email không hợp lệ.');
    const [rows] = await pool.execute(
        `SELECT ca.id, c.id AS candidate_id, c.full_name, c.email, ca.password_hash
         FROM candidate_accounts ca
         JOIN candidates c ON c.id = ca.candidate_id
         WHERE c.email = ?`,
        [email]
    );
    if (!rows.length || !await bcrypt.compare(String(req.body.password), rows[0].password_hash)) {
        throw httpError(401, 'Email hoặc mật khẩu không chính xác.');
    }
    sessionResponse(rows[0], res);
});

privateRouter.use(authenticateCandidate);

privateRouter.get('/me', (req, res) => {
    res.json({
        user: {
            id: req.candidate.id,
            name: req.candidate.full_name,
            email: req.candidate.email
        }
    });
});

privateRouter.get('/applications', async (req, res) => {
    const { limit, page, offset } = pagination(req.query);
    const [data] = await pool.execute(
        `SELECT a.id, a.job_id, a.status, a.applied_at, j.title AS job_title,
                j.department, j.salary, e.match_score
         FROM applications a
         JOIN jobs j ON j.id = a.job_id
         LEFT JOIN ai_evaluations e ON e.application_id = a.id
         WHERE a.candidate_id = ?
         ORDER BY a.applied_at DESC LIMIT ? OFFSET ?`,
        [req.candidate.id, limit, offset]
    );
    const [counts] = await pool.execute(
        'SELECT COUNT(*) AS total FROM applications WHERE candidate_id = ?',
        [req.candidate.id]
    );
    res.json({ data, pagination: { page, limit, total: counts[0].total } });
});

privateRouter.get('/interviews', async (req, res) => {
    const [data] = await pool.execute(
        `SELECT i.id, i.interview_date, i.location_or_link, i.status, i.confirmation_status,
                j.title AS job_title
         FROM interviews i JOIN applications a ON a.id = i.application_id
         JOIN jobs j ON j.id = a.job_id
         WHERE a.candidate_id = ? AND i.status != 'cancelled'
         ORDER BY i.interview_date DESC`,
        [req.candidate.id]
    );
    res.json({ data });
});

privateRouter.patch('/interviews/:id/confirmation', async (req, res) => {
    if (!['confirmed', 'declined'].includes(req.body.confirmationStatus)) {
        throw httpError(400, 'Vui lòng xác nhận tham gia hoặc từ chối lịch phỏng vấn.');
    }
    const [result] = await pool.execute(
        `UPDATE interviews i JOIN applications a ON a.id = i.application_id
         SET i.confirmation_status = ?
         WHERE i.id = ? AND a.candidate_id = ? AND i.status = 'scheduled'`,
        [req.body.confirmationStatus, parseId(req.params.id), req.candidate.id]
    );
    if (!result.affectedRows) throw httpError(404, 'Không tìm thấy lịch phỏng vấn đang hoạt động.');
    res.json({ message: req.body.confirmationStatus === 'confirmed' ? 'Đã xác nhận tham gia phỏng vấn.' : 'Đã từ chối lịch phỏng vấn.' });
});

privateRouter.post('/applications', upload.single('cvFile'), async (req, res) => {
    if (!req.file) throw httpError(400, 'Vui lòng tải CV PDF lên.');
    let keepFile = false;
    try {
        requireFields(req.body, ['jobId']);
        const jobId = parseId(req.body.jobId, 'Job ID');
        const [jobs] = await pool.execute(
            "SELECT id, title, description FROM jobs WHERE id = ? AND status = 'opening'",
            [jobId]
        );
        if (!jobs.length) throw httpError(404, 'Tin tuyển dụng không tồn tại hoặc đã đóng.');

        const [existingApplications] = await pool.execute(
            'SELECT id FROM applications WHERE job_id = ? AND candidate_id = ? LIMIT 1',
            [jobId, req.candidate.id]
        );
        if (existingApplications.length) throw httpError(409, 'Bạn đã nộp hồ sơ cho vị trí này.');

        const evaluation = await analyzeResume(
            req.file.path,
            `${jobs[0].title}\n${jobs[0].description}`,
            { requireCandidateIdentity: false }
        );
        if (evaluation.match_score === null) {
            throw httpError(502, 'AI chưa thể chấm điểm hồ sơ này. Vui lòng thử lại sau.');
        }
        const relativePath = `uploads/${path.basename(req.file.path)}`;
        const connection = await pool.getConnection();
        let applicationId;
        try {
            await connection.beginTransaction();
            await connection.execute('SELECT id FROM candidates WHERE id = ? FOR UPDATE', [req.candidate.id]);
            const [duplicate] = await connection.execute(
                'SELECT id FROM applications WHERE job_id = ? AND candidate_id = ? LIMIT 1',
                [jobId, req.candidate.id]
            );
            if (duplicate.length) throw httpError(409, 'Bạn đã nộp hồ sơ cho vị trí này.');
            const [application] = await connection.execute(
                "INSERT INTO applications (job_id, candidate_id, cv_file_url, status) VALUES (?, ?, ?, 'new')",
                [jobId, req.candidate.id, relativePath]
            );
            applicationId = application.insertId;
            await connection.execute(
                `INSERT INTO ai_evaluations (application_id, match_score, pros, cons, suggested_questions)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    applicationId,
                    evaluation.match_score,
                    JSON.stringify(evaluation.pros),
                    JSON.stringify(evaluation.cons),
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
            message: 'Đã nộp hồ sơ.',
            data: { applicationId, jobId, matchScore: evaluation.match_score }
        });
    } finally {
        if (!keepFile) {
            await fs.unlink(req.file.path).catch((error) => {
                if (error.code !== 'ENOENT') console.error('Không thể xóa CV tạm:', error.message);
            });
        }
    }
});

export default { publicRouter, privateRouter };
