import express from 'express';
import { pool } from '../db/pool.js';
import { allowRoles } from '../middleware/auth.js';
import { httpError, pagination, parseId, requireFields } from '../utils/http.js';

const router = express.Router();

router.get('/', async (req, res) => {
    const { limit, page, offset } = pagination(req.query);
    const filters = [];
    const values = [];
    if (req.query.status) {
        if (!['opening', 'closed'].includes(req.query.status)) throw httpError(400, 'Trạng thái tin tuyển dụng không hợp lệ.');
        filters.push('j.status = ?');
        values.push(req.query.status);
    }
    if (req.query.search) {
        filters.push('(j.title LIKE ? OR j.department LIKE ?)');
        const term = `%${String(req.query.search).slice(0, 100)}%`;
        values.push(term, term);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [data] = await pool.execute(
        `SELECT j.*, u.name AS creator_name,
            (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) AS application_count
         FROM jobs j LEFT JOIN users u ON u.id = j.created_by
         ${where} ORDER BY j.created_at DESC LIMIT ? OFFSET ?`,
        [...values, limit, offset]
    );
    const [counts] = await pool.execute(`SELECT COUNT(*) AS total FROM jobs j ${where}`, values);
    res.json({ data, pagination: { page, limit, total: counts[0].total } });
});

router.post('/', allowRoles('admin', 'hr'), async (req, res) => {
    requireFields(req.body, ['title', 'description']);
    if (!String(req.body.title).trim() || String(req.body.title).length > 255) {
        throw httpError(400, 'Tiêu đề tin tuyển dụng phải có từ 1 đến 255 ký tự.');
    }
    if (req.body.department && String(req.body.department).length > 100) {
        throw httpError(400, 'Phòng ban không được vượt quá 100 ký tự.');
    }
    if (req.body.salary && String(req.body.salary).length > 100) {
        throw httpError(400, 'Mức lương không được vượt quá 100 ký tự.');
    }
    const status = req.body.status || 'opening';
    if (!['opening', 'closed'].includes(status)) throw httpError(400, 'Trạng thái tin tuyển dụng không hợp lệ.');
    const [result] = await pool.execute(
        'INSERT INTO jobs (title, department, description, salary, status, created_by) VALUES (?, ?, ?, ?, ?, ?)',
        [String(req.body.title).trim(), req.body.department || null, String(req.body.description), req.body.salary || null, status, req.user.id]
    );
    const [rows] = await pool.execute('SELECT * FROM jobs WHERE id = ?', [result.insertId]);
    res.status(201).json({ data: rows[0] });
});

router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const [rows] = await pool.execute(
        `SELECT j.*, u.name AS creator_name,
            (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) AS application_count
         FROM jobs j LEFT JOIN users u ON u.id = j.created_by WHERE j.id = ?`,
        [id]
    );
    if (!rows.length) throw httpError(404, 'Không tìm thấy tin tuyển dụng.');
    res.json({ data: rows[0] });
});

router.patch('/:id', allowRoles('admin', 'hr'), async (req, res) => {
    const id = parseId(req.params.id);
    const fields = { title: 'title', department: 'department', description: 'description', salary: 'salary', status: 'status' };
    const updates = Object.entries(fields).filter(([key]) => req.body[key] !== undefined);
    if (!updates.length) throw httpError(400, 'Cần cung cấp ít nhất một trường cần cập nhật.');
    if (req.body.status && !['opening', 'closed'].includes(req.body.status)) throw httpError(400, 'Trạng thái tin tuyển dụng không hợp lệ.');
    if (req.body.title !== undefined && (!String(req.body.title).trim() || String(req.body.title).length > 255)) {
        throw httpError(400, 'Tiêu đề tin tuyển dụng phải có từ 1 đến 255 ký tự.');
    }
    if (req.body.department !== undefined && String(req.body.department).length > 100) {
        throw httpError(400, 'Phòng ban không được vượt quá 100 ký tự.');
    }
    if (req.body.salary !== undefined && String(req.body.salary).length > 100) {
        throw httpError(400, 'Mức lương không được vượt quá 100 ký tự.');
    }
    const [result] = await pool.execute(
        `UPDATE jobs SET ${updates.map(([, column]) => `${column} = ?`).join(', ')} WHERE id = ?`,
        [...updates.map(([key]) => req.body[key]), id]
    );
    if (!result.affectedRows) throw httpError(404, 'Không tìm thấy tin tuyển dụng.');
    const [rows] = await pool.execute('SELECT * FROM jobs WHERE id = ?', [id]);
    res.json({ data: rows[0] });
});

router.delete('/:id', allowRoles('admin', 'hr'), async (req, res) => {
    const id = parseId(req.params.id);
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [jobs] = await connection.execute('SELECT id FROM jobs WHERE id = ?', [id]);
        if (!jobs.length) throw httpError(404, 'Không tìm thấy tin tuyển dụng.');
        await connection.execute('DELETE FROM applications WHERE job_id = ?', [id]);
        await connection.execute('DELETE FROM jobs WHERE id = ?', [id]);
        await connection.commit();
        res.json({ message: 'Đã xóa tin tuyển dụng và các hồ sơ liên quan.' });
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
});

export default router;
