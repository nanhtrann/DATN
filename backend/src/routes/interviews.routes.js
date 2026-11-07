import express from 'express';
import { pool } from '../db/pool.js';
import { allowRoles } from '../middleware/auth.js';
import { applicationOutcomeTemplate, interviewInvitationTemplate, sendEmail } from '../services/email.service.js';
import { httpError, pagination, parseId, requireFields } from '../utils/http.js';

const router = express.Router();

router.get('/', async (req, res) => {
    const { limit, page, offset } = pagination(req.query);
    const filters = [];
    const values = [];
    if (req.query.from) {
        const from = new Date(req.query.from);
        if (Number.isNaN(from.getTime())) throw httpError(400, 'Ngày bắt đầu không hợp lệ.');
        filters.push('i.interview_date >= ?');
        values.push(from.toISOString().slice(0, 19).replace('T', ' '));
    }
    if (req.query.to) {
        const to = new Date(req.query.to);
        if (Number.isNaN(to.getTime())) throw httpError(400, 'Ngày kết thúc không hợp lệ.');
        filters.push('i.interview_date <= ?');
        values.push(to.toISOString().slice(0, 19).replace('T', ' '));
    }
    if (req.query.status) {
        if (!['scheduled', 'completed', 'cancelled'].includes(req.query.status)) throw httpError(400, 'Trạng thái phỏng vấn không hợp lệ.');
        filters.push('i.status = ?');
        values.push(req.query.status);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const query = `SELECT i.*, a.job_id, a.candidate_id, c.full_name AS candidate_name, c.email AS candidate_email,
        j.title AS job_title, u.name AS interviewer_name
        FROM interviews i JOIN applications a ON a.id = i.application_id
        JOIN candidates c ON c.id = a.candidate_id JOIN jobs j ON j.id = a.job_id
        LEFT JOIN users u ON u.id = i.interviewer_id`;
    const [data] = await pool.execute(`${query} ${where} ORDER BY i.interview_date ASC LIMIT ? OFFSET ?`, [...values, limit, offset]);
    const [counts] = await pool.execute(`SELECT COUNT(*) AS total FROM interviews i ${where}`, values);
    res.json({ data, pagination: { page, limit, total: counts[0].total } });
});

router.get('/conflicts', async (req, res) => {
    const interviewDate = new Date(req.query.date);
    if (Number.isNaN(interviewDate.getTime())) throw httpError(400, 'Thời gian phỏng vấn không hợp lệ.');
    const [rows] = await pool.execute(
        `SELECT i.id, i.interview_date, c.full_name AS candidate_name, u.name AS interviewer_name
         FROM interviews i JOIN applications a ON a.id = i.application_id
         JOIN candidates c ON c.id = a.candidate_id LEFT JOIN users u ON u.id = i.interviewer_id
         WHERE i.status = 'scheduled'
           AND ABS(TIMESTAMPDIFF(MINUTE, i.interview_date, ?)) < 60`,
        [interviewDate.toISOString().slice(0, 19).replace('T', ' ')]
    );
    res.json({ data: rows });
});

router.post('/', allowRoles('admin', 'hr'), async (req, res) => {
    requireFields(req.body, ['applicationId', 'interviewDate']);
    const applicationId = parseId(req.body.applicationId, 'Application ID');
    const interviewDate = new Date(req.body.interviewDate);
    if (Number.isNaN(interviewDate.getTime())) throw httpError(400, 'Thời gian phỏng vấn không hợp lệ.');
    const [applications] = await pool.execute(
        `SELECT a.id, a.status, c.email, c.full_name, j.title FROM applications a
         JOIN candidates c ON c.id = a.candidate_id JOIN jobs j ON j.id = a.job_id WHERE a.id = ?`,
        [applicationId]
    );
    if (!applications.length) throw httpError(404, 'Không tìm thấy hồ sơ ứng tuyển.');
    if (['hired', 'rejected'].includes(applications[0].status)) {
        throw httpError(409, 'Hồ sơ đã tuyển hoặc đã rớt không thể lên lịch phỏng vấn.');
    }
    const [scheduled] = await pool.execute(
        `SELECT id FROM interviews
         WHERE application_id = ? AND status = 'scheduled' LIMIT 1`,
        [applicationId]
    );
    if (scheduled.length) throw httpError(409, 'Hồ sơ này đã có lịch phỏng vấn đang hoạt động.');
    const interviewerId = req.body.interviewerId === undefined || req.body.interviewerId === null
        ? null : parseId(req.body.interviewerId, 'Interviewer ID');
    if (interviewerId) {
        const [interviewers] = await pool.execute('SELECT id FROM users WHERE id = ?', [interviewerId]);
        if (!interviewers.length) throw httpError(404, 'Không tìm thấy người phỏng vấn.');
    }
    const [conflicts] = await pool.execute(
        `SELECT id FROM interviews
         WHERE status = 'scheduled'
           AND ABS(TIMESTAMPDIFF(MINUTE, interview_date, ?)) < 60
           AND (? IS NULL OR interviewer_id = ?) LIMIT 1`,
        [interviewDate.toISOString().slice(0, 19).replace('T', ' '), interviewerId, interviewerId]
    );
    if (conflicts.length) throw httpError(409, 'Người phỏng vấn hoặc khung giờ này đã có lịch trong vòng 60 phút.');
    if (req.body.locationOrLink && String(req.body.locationOrLink).length > 255) {
        throw httpError(400, 'Địa điểm/đường dẫn không được vượt quá 255 ký tự.');
    }
    const connection = await pool.getConnection();
    let interviewId;
    try {
        await connection.beginTransaction();
        const [result] = await connection.execute(
            'INSERT INTO interviews (application_id, interviewer_id, interview_date, location_or_link) VALUES (?, ?, ?, ?)',
            [applicationId, interviewerId, interviewDate.toISOString().slice(0, 19).replace('T', ' '), req.body.locationOrLink || null]
        );
        interviewId = result.insertId;
        await connection.execute("UPDATE applications SET status = 'interview' WHERE id = ?", [applicationId]);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
    let invitation = 'not_requested';
    if (req.body.sendInvitation !== false) {
        const candidate = applications[0];
        try {
            await sendEmail({
                to: candidate.email,
                ...interviewInvitationTemplate({
                    candidateName: candidate.full_name,
                    jobTitle: candidate.title,
                    interviewDate,
                    locationOrLink: req.body.locationOrLink
                })
            });
            invitation = 'sent';
        } catch (error) {
            console.error('Gửi thư mời phỏng vấn thất bại:', error.message);
            invitation = 'failed';
        }
    }
    const [rows] = await pool.execute('SELECT * FROM interviews WHERE id = ?', [interviewId]);
    res.status(201).json({ data: rows[0], invitation });
});

router.post('/:id/reminder', allowRoles('admin', 'hr'), async (req, res) => {
    const id = parseId(req.params.id);
    const [rows] = await pool.execute(
        `SELECT i.id, i.interview_date, i.location_or_link, c.full_name, c.email, j.title
         FROM interviews i JOIN applications a ON a.id = i.application_id
         JOIN candidates c ON c.id = a.candidate_id JOIN jobs j ON j.id = a.job_id
         WHERE i.id = ? AND i.status = 'scheduled'`,
        [id]
    );
    if (!rows.length) throw httpError(404, 'Không tìm thấy lịch phỏng vấn đang hoạt động.');
    const interview = rows[0];
    await sendEmail({
        to: interview.email,
        subject: `[HRauto] Nhắc lịch phỏng vấn — ${interview.title}`,
        text: `Chào ${interview.full_name},\n\nXin nhắc bạn về lịch phỏng vấn vị trí ${interview.title} vào ${new Date(String(interview.interview_date).replace(' ', 'T')).toLocaleString('vi-VN')} tại ${interview.location_or_link || 'địa điểm sẽ được thông báo lại'}.\n\nTrân trọng,\nĐội ngũ tuyển dụng HRauto`
    });
    await pool.execute('UPDATE interviews SET reminder_sent_at = NOW() WHERE id = ?', [id]);
    res.json({ message: 'Đã gửi email nhắc lịch.' });
});

router.post('/:id/complete', allowRoles('admin', 'hr'), async (req, res) => {
    const id = parseId(req.params.id);
    const outcome = String(req.body.outcome || '').toLowerCase();
    if (!['hired', 'rejected'].includes(outcome)) {
        throw httpError(400, 'Vui lòng chọn kết quả Đậu hoặc Rớt.');
    }
    const reason = req.body.reason === undefined ? null : String(req.body.reason).slice(0, 255);
    const notes = req.body.notes === undefined ? null : String(req.body.notes).slice(0, 5000);
    const [rows] = await pool.execute(
        `SELECT i.id, i.application_id, i.status, c.full_name, c.email, j.title
         FROM interviews i JOIN applications a ON a.id = i.application_id
         JOIN candidates c ON c.id = a.candidate_id JOIN jobs j ON j.id = a.job_id
         WHERE i.id = ?`,
        [id]
    );
    if (!rows.length) throw httpError(404, 'Không tìm thấy lịch phỏng vấn.');
    const interview = rows[0];
    if (interview.status === 'completed' || interview.status === 'cancelled') {
        throw httpError(409, 'Lịch phỏng vấn này đã được đóng.');
    }
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute('UPDATE interviews SET status = ?, notes = COALESCE(?, notes) WHERE id = ?', ['completed', notes, id]);
        await connection.execute(
            `UPDATE applications
             SET status = ?, outcome_reason = COALESCE(?, outcome_reason),
                 outcome_notes = COALESCE(?, outcome_notes), decision_at = NOW(), decision_by = ?
             WHERE id = ?`,
            [outcome, reason, notes, req.user.id, interview.application_id]
        );
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
    let outcomeEmail = 'not_requested';
    try {
        await sendEmail({
            to: interview.email,
            ...applicationOutcomeTemplate({
                candidateName: interview.full_name,
                jobTitle: interview.title,
                hired: outcome === 'hired'
            })
        });
        outcomeEmail = 'sent';
    } catch (error) {
        console.error('Gửi email kết quả sau phỏng vấn thất bại:', error.message);
        outcomeEmail = 'failed';
    }
    res.json({
        message: outcome === 'hired' ? 'Đã hoàn thành phỏng vấn và cập nhật ứng viên trúng tuyển.' : 'Đã hoàn thành phỏng vấn và cập nhật ứng viên rớt.',
        outcome,
        outcomeEmail
    });
});

router.patch('/:id', allowRoles('admin', 'hr'), async (req, res) => {
    const id = parseId(req.params.id);
    const fields = {
        interviewDate: 'interview_date', interviewerId: 'interviewer_id',
        locationOrLink: 'location_or_link', status: 'status',
        confirmationStatus: 'confirmation_status', notes: 'notes'
    };
    const updates = Object.entries(fields).filter(([key]) => req.body[key] !== undefined);
    if (!updates.length) throw httpError(400, 'Cần cung cấp trường cần cập nhật.');
    if (req.body.status && !['scheduled', 'completed', 'cancelled'].includes(req.body.status)) {
        throw httpError(400, 'Trạng thái phỏng vấn không hợp lệ.');
    }
    if (req.body.confirmationStatus && !['pending', 'confirmed', 'declined'].includes(req.body.confirmationStatus)) {
        throw httpError(400, 'Trạng thái xác nhận không hợp lệ.');
    }
    if (req.body.locationOrLink !== undefined && req.body.locationOrLink !== null
        && String(req.body.locationOrLink).length > 255) {
        throw httpError(400, 'Địa điểm/đường dẫn không được vượt quá 255 ký tự.');
    }
    if (req.body.interviewerId !== undefined && req.body.interviewerId !== null) {
        const interviewerId = parseId(req.body.interviewerId, 'Interviewer ID');
        const [interviewers] = await pool.execute('SELECT id FROM users WHERE id = ?', [interviewerId]);
        if (!interviewers.length) throw httpError(404, 'Không tìm thấy người phỏng vấn.');
    }
    const values = updates.map(([key]) => {
        if (key === 'interviewDate') {
            const date = new Date(req.body[key]);
            if (Number.isNaN(date.getTime())) throw httpError(400, 'Thời gian phỏng vấn không hợp lệ.');
            return date.toISOString().slice(0, 19).replace('T', ' ');
        }
        if (key === 'interviewerId' && req.body[key] !== null) return parseId(req.body[key], 'Interviewer ID');
        return req.body[key];
    });
    const [result] = await pool.execute(
        `UPDATE interviews SET ${updates.map(([, column]) => `${column} = ?`).join(', ')} WHERE id = ?`,
        [...values, id]
    );
    if (!result.affectedRows) throw httpError(404, 'Không tìm thấy lịch phỏng vấn.');
    const [rows] = await pool.execute('SELECT * FROM interviews WHERE id = ?', [id]);
    res.json({ data: rows[0] });
});

router.delete('/:id', allowRoles('admin', 'hr'), async (req, res) => {
    const [result] = await pool.execute("UPDATE interviews SET status = 'cancelled' WHERE id = ?", [parseId(req.params.id)]);
    if (!result.affectedRows) throw httpError(404, 'Không tìm thấy lịch phỏng vấn.');
    res.json({ message: 'Đã hủy lịch phỏng vấn.' });
});

export default router;
