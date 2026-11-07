import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../db/pool.js';
import { allowRoles } from '../middleware/auth.js';
import { applicationSelect } from '../db/queries.js';
import { httpError, pagination, parseId, parseStoredList, requireFields, validEmail } from '../utils/http.js';
import { config } from '../config/env.js';

const router = express.Router();

router.get('/', async (req, res) => {
    const { limit, page, offset } = pagination(req.query);
    const filters = [];
    const values = [];
    if (req.query.search) {
        filters.push('(c.full_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)');
        const term = `%${String(req.query.search).slice(0, 100)}%`;
        values.push(term, term, term);
    }
    if (req.query.source) {
        filters.push('c.source = ?');
        values.push(String(req.query.source).slice(0, 100));
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [data] = await pool.execute(
        `SELECT c.*, COUNT(a.id) AS application_count FROM candidates c
         LEFT JOIN applications a ON a.candidate_id = c.id ${where}
         GROUP BY c.id ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
        [...values, limit, offset]
    );
    const [counts] = await pool.execute(`SELECT COUNT(*) AS total FROM candidates c ${where}`, values);
    res.json({ data, pagination: { page, limit, total: counts[0].total } });
});

router.post('/', allowRoles('admin', 'hr'), async (req, res) => {
    requireFields(req.body, ['fullName', 'email']);
    const fullName = String(req.body.fullName).trim();
    const email = String(req.body.email).trim().toLowerCase();
    if (!fullName || fullName.length > 100 || !validEmail(email)) {
        throw httpError(400, 'Tên hoặc email ứng viên không hợp lệ.');
    }
    if (req.body.phone && String(req.body.phone).length > 20) {
        throw httpError(400, 'Số điện thoại không được vượt quá 20 ký tự.');
    }
    try {
        const [result] = await pool.execute(
            'INSERT INTO candidates (full_name, email, phone, source, tags) VALUES (?, ?, ?, ?, ?)',
            [
                fullName,
                email,
                req.body.phone ? String(req.body.phone).slice(0, 20) : null,
                req.body.source ? String(req.body.source).slice(0, 100) : null,
                req.body.tags ? String(req.body.tags).slice(0, 1000) : null
            ]
        );
        res.status(201).json({ data: { id: result.insertId, full_name: fullName, email, phone: req.body.phone || null } });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw httpError(409, 'Email ứng viên đã tồn tại.');
        throw error;
    }
});

router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const [candidates] = await pool.execute('SELECT * FROM candidates WHERE id = ?', [id]);
    if (!candidates.length) throw httpError(404, 'Không tìm thấy ứng viên.');
    const [applications] = await pool.execute(
        `${applicationSelect} WHERE a.candidate_id = ? ORDER BY a.applied_at DESC`,
        [id]
    );
    res.json({
        data: {
            ...candidates[0],
            applications: applications.map((application) => ({
                ...application,
                pros: parseStoredList(application.pros),
                cons: parseStoredList(application.cons),
                suggested_questions: parseStoredList(application.suggested_questions)
            }))
        }
    });
});

router.patch('/:id', allowRoles('admin', 'hr'), async (req, res) => {
    const id = parseId(req.params.id);
    const fields = { fullName: 'full_name', email: 'email', phone: 'phone', source: 'source', tags: 'tags' };
    const updates = Object.entries(fields).filter(([key]) => req.body[key] !== undefined);
    if (!updates.length) throw httpError(400, 'Cần cung cấp fullName, email hoặc phone để cập nhật.');
    const values = updates.map(([key]) => {
        const value = req.body[key];
        if (key === 'fullName') {
            const name = String(value).trim();
            if (!name || name.length > 100) throw httpError(400, 'Tên ứng viên phải có từ 1 đến 100 ký tự.');
            return name;
        }
        if (key === 'email') {
            const email = String(value).trim().toLowerCase();
            if (!validEmail(email)) throw httpError(400, 'Email ứng viên không hợp lệ.');
            return email;
        }
        if (value !== null && value !== '' && String(value).length > 20) {
            throw httpError(400, 'Số điện thoại không được vượt quá 20 ký tự.');
        }
        return value === null || value === '' ? null : String(value).slice(0, 20);
    });
    try {
        const [result] = await pool.execute(
            `UPDATE candidates SET ${updates.map(([, column]) => `${column} = ?`).join(', ')} WHERE id = ?`,
            [...values, id]
        );
        if (!result.affectedRows) throw httpError(404, 'Không tìm thấy ứng viên.');
        const [rows] = await pool.execute('SELECT * FROM candidates WHERE id = ?', [id]);
        res.json({ data: rows[0] });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw httpError(409, 'Email ứng viên đã tồn tại.');
        throw error;
    }
});

router.delete('/:id', allowRoles('admin', 'hr'), async (req, res) => {
    const id = parseId(req.params.id);
    const [candidateRows] = await pool.execute('SELECT id FROM candidates WHERE id = ?', [id]);
    if (!candidateRows.length) throw httpError(404, 'Không tìm thấy ứng viên.');

    const [applications] = await pool.execute('SELECT id, cv_file_url FROM applications WHERE candidate_id = ?', [id]);
    const applicationIds = applications.map((application) => application.id);
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        if (applicationIds.length) {
            const placeholders = applicationIds.map(() => '?').join(',');
            await connection.execute(`DELETE FROM ai_evaluations WHERE application_id IN (${placeholders})`, applicationIds);
            await connection.execute(`DELETE FROM application_notes WHERE application_id IN (${placeholders})`, applicationIds);
            await connection.execute(`DELETE FROM interviews WHERE application_id IN (${placeholders})`, applicationIds);
            await connection.execute(`DELETE FROM offers WHERE application_id IN (${placeholders})`, applicationIds);
            await connection.execute(`DELETE FROM applications WHERE candidate_id = ?`, [id]);
        }
        await connection.execute('DELETE FROM candidates WHERE id = ?', [id]);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    for (const application of applications) {
        const filename = path.basename(application.cv_file_url || '');
        if (!filename) continue;
        await fs.unlink(path.join(config.uploadDirectory, filename)).catch((error) => {
            if (error.code !== 'ENOENT') console.error('Không thể xóa file CV:', error.message);
        });
    }
    res.json({ message: 'Đã xóa hồ sơ ứng viên và các hồ sơ ứng tuyển liên quan.' });
});

export default router;
