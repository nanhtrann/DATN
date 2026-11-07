import express from 'express';
import { pool } from '../db/pool.js';
import { allowRoles } from '../middleware/auth.js';
import { offerTemplate, sendEmail } from '../services/email.service.js';
import { httpError, pagination, parseId, requireFields } from '../utils/http.js';

const router = express.Router();

router.get('/', async (req, res) => {
    const { limit, page, offset } = pagination(req.query);
    const [data] = await pool.execute(
        `SELECT o.*, c.full_name AS candidate_name, c.email AS candidate_email,
                j.title AS job_title, u.name AS created_by_name
         FROM offers o JOIN applications a ON a.id = o.application_id
         JOIN candidates c ON c.id = a.candidate_id JOIN jobs j ON j.id = a.job_id
         LEFT JOIN users u ON u.id = o.created_by
         ORDER BY o.updated_at DESC LIMIT ? OFFSET ?`,
        [limit, offset]
    );
    const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM offers');
    res.json({ data, pagination: { page, limit, total: count.total } });
});

router.post('/', allowRoles('admin', 'hr'), async (req, res) => {
    requireFields(req.body, ['applicationId']);
    const applicationId = parseId(req.body.applicationId, 'Application ID');
    const [rows] = await pool.execute(
        `SELECT c.full_name, c.email, j.title FROM applications a
         JOIN candidates c ON c.id = a.candidate_id JOIN jobs j ON j.id = a.job_id
         WHERE a.id = ?`,
        [applicationId]
    );
    if (!rows.length) throw httpError(404, 'Không tìm thấy hồ sơ ứng tuyển.');
    const [existing] = await pool.execute('SELECT id FROM offers WHERE application_id = ?', [applicationId]);
    if (existing.length) throw httpError(409, 'Hồ sơ này đã có thư mời nhận việc.');

    const status = req.body.status === 'sent' ? 'sent' : 'draft';
    const [result] = await pool.execute(
        `INSERT INTO offers (application_id, salary, start_date, status, details, sent_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            applicationId,
            req.body.salary ? String(req.body.salary).slice(0, 100) : null,
            req.body.startDate || null,
            status,
            req.body.details ? String(req.body.details).slice(0, 5000) : null,
            status === 'sent' ? new Date() : null,
            req.user.id
        ]
    );

    let emailStatus = 'not_sent';
    let emailError = null;
    if (status === 'sent') {
        try {
            await sendEmail({
                to: rows[0].email,
                ...offerTemplate({
                    candidateName: rows[0].full_name,
                    jobTitle: rows[0].title,
                    salary: req.body.salary,
                    startDate: req.body.startDate,
                    details: req.body.details
                })
            });
            emailStatus = 'sent';
        } catch (error) {
            console.error('Gửi thư mời nhận việc thất bại:', error.message);
            await pool.execute("UPDATE offers SET status = 'draft', sent_at = NULL WHERE id = ?", [result.insertId]);
            emailStatus = 'failed';
            emailError = error.message;
        }
    }
    const [offer] = await pool.execute('SELECT * FROM offers WHERE id = ?', [result.insertId]);
    res.status(201).json({ data: offer[0], emailStatus, emailError });
});

router.post('/:id/send', allowRoles('admin', 'hr'), async (req, res) => {
    const id = parseId(req.params.id);
    const [rows] = await pool.execute(
        `SELECT o.salary, o.start_date, o.details, c.full_name, c.email, j.title
         FROM offers o JOIN applications a ON a.id = o.application_id
         JOIN candidates c ON c.id = a.candidate_id JOIN jobs j ON j.id = a.job_id
         WHERE o.id = ?`,
        [id]
    );
    if (!rows.length) throw httpError(404, 'Không tìm thấy thư mời nhận việc.');
    const offer = rows[0];
    if (!offer.email) throw httpError(400, 'Ứng viên chưa có địa chỉ email.');
    try {
        await sendEmail({
            to: offer.email,
            ...offerTemplate({
                candidateName: offer.full_name,
                jobTitle: offer.title,
                salary: offer.salary,
                startDate: offer.start_date,
                details: offer.details
            })
        });
        await pool.execute("UPDATE offers SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = ?", [id]);
        res.json({ message: 'Đã gửi thư mời nhận việc.', emailStatus: 'sent' });
    } catch (error) {
        console.error('Gửi thư mời nhận việc thất bại:', error.message);
        throw httpError(502, `Không thể gửi email: ${error.message}`);
    }
});

router.patch('/:id', allowRoles('admin', 'hr'), async (req, res) => {
    const id = parseId(req.params.id);
    if (!['draft', 'sent', 'accepted', 'declined', 'withdrawn'].includes(req.body.status)) {
        throw httpError(400, 'Trạng thái thư mời nhận việc không hợp lệ.');
    }
    await pool.execute(
        `UPDATE offers SET status = ?, salary = ?, start_date = ?, details = ? WHERE id = ?`,
        [
            req.body.status,
            req.body.salary ? String(req.body.salary).slice(0, 100) : null,
            req.body.startDate || null,
            req.body.details ? String(req.body.details).slice(0, 5000) : null,
            id
        ]
    );
    if (req.body.status === 'sent') {
        await pool.execute('UPDATE offers SET sent_at = COALESCE(sent_at, NOW()) WHERE id = ?', [id]);
    }
    if (['accepted', 'declined', 'withdrawn'].includes(req.body.status)) {
        await pool.execute('UPDATE offers SET responded_at = COALESCE(responded_at, NOW()) WHERE id = ?', [id]);
    }
    const [rows] = await pool.execute('SELECT * FROM offers WHERE id = ?', [id]);
    if (!rows.length) throw httpError(404, 'Không tìm thấy thư mời nhận việc.');
    res.json({ data: rows[0], emailStatus: req.body.status === 'sent' ? 'sent' : 'not_sent' });
});

export default router;
