import bcrypt from 'bcryptjs';
import express from 'express';
import { pool } from '../db/pool.js';
import { allowRoles } from '../middleware/auth.js';
import { httpError, pagination, parseId, requireFields, validEmail } from '../utils/http.js';

const router = express.Router();

router.get('/', allowRoles('admin'), async (req, res) => {
    const { limit, page, offset } = pagination(req.query);
    const [data] = await pool.execute(
        'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [limit, offset]
    );
    const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM users');
    res.json({ data, pagination: { page, limit, total: count.total } });
});

router.post('/', allowRoles('admin'), async (req, res) => {
    requireFields(req.body, ['name', 'email', 'password']);
    const name = String(req.body.name).trim();
    const email = String(req.body.email).trim().toLowerCase();
    const password = String(req.body.password);
    const role = req.body.role || 'hr';
    if (!name || name.length > 100 || !validEmail(email)) {
        throw httpError(400, 'Tên hoặc email người dùng không hợp lệ.');
    }
    if (password.length < 10 || password.length > 128) {
        throw httpError(400, 'Mật khẩu phải có từ 10 đến 128 ký tự.');
    }
    if (!['admin', 'hr'].includes(role)) {
        throw httpError(400, 'Vai trò chỉ có thể là admin hoặc hr theo cấu trúc database.');
    }

    try {
        const passwordHash = await bcrypt.hash(password, 12);
        const [result] = await pool.execute(
            'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
            [name, email, passwordHash, role]
        );
        res.status(201).json({ data: { id: result.insertId, name, email, role } });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw httpError(409, 'Email người dùng đã tồn tại.');
        throw error;
    }
});

router.patch('/:id', allowRoles('admin'), async (req, res) => {
    const id = parseId(req.params.id);
    const fields = { name: 'name', role: 'role' };
    const updates = Object.entries(fields).filter(([key]) => req.body[key] !== undefined);
    if (req.body.password !== undefined) {
        const password = String(req.body.password);
        if (password.length < 10 || password.length > 128) {
            throw httpError(400, 'Mật khẩu phải có từ 10 đến 128 ký tự.');
        }
    }
    if (req.body.name !== undefined && (!String(req.body.name).trim() || String(req.body.name).length > 100)) {
        throw httpError(400, 'Tên phải có từ 1 đến 100 ký tự.');
    }
    if (req.body.role && !['admin', 'hr'].includes(req.body.role)) {
        throw httpError(400, 'Vai trò chỉ có thể là admin hoặc hr theo cấu trúc database.');
    }
    if (req.body.password !== undefined) updates.push(['password', 'password']);
    if (!updates.length) throw httpError(400, 'Cần cung cấp name, role hoặc password để cập nhật.');

    const values = [];
    for (const [key] of updates) {
        values.push(key === 'password' ? await bcrypt.hash(String(req.body.password), 12)
            : key === 'name' ? String(req.body.name).trim() : req.body[key]);
    }

    const connection = await pool.getConnection();
    let transactionStarted = false;
    try {
        await connection.beginTransaction();
        transactionStarted = true;
        const [targetRows] = await connection.execute('SELECT id, role FROM users WHERE id = ? FOR UPDATE', [id]);
        if (!targetRows.length) throw httpError(404, 'Không tìm thấy người dùng.');
        if (targetRows[0].role === 'admin' && req.body.role === 'hr') {
            const [admins] = await connection.execute("SELECT id FROM users WHERE role = 'admin' FOR UPDATE");
            if (admins.length <= 1) throw httpError(409, 'Không thể hạ quyền admin cuối cùng.');
        }
        await connection.execute(
            `UPDATE users SET ${updates.map(([, column]) => `${column} = ?`).join(', ')} WHERE id = ?`,
            [...values, id]
        );
        await connection.commit();
        transactionStarted = false;
    } catch (error) {
        if (transactionStarted) await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    const [rows] = await pool.execute('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [id]);
    res.json({ data: rows[0] });
});

router.delete('/:id', allowRoles('admin'), async (req, res) => {
    const id = parseId(req.params.id);
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.execute('SELECT role FROM users WHERE id = ?', [id]);
        if (!rows.length) throw httpError(404, 'Không tìm thấy người dùng.');
        if (rows[0].role === 'admin') {
            const [[count]] = await connection.query("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'");
            if (Number(count.total) <= 1) throw httpError(409, 'Không thể xóa quản trị viên cuối cùng.');
        }
        await connection.execute('DELETE FROM users WHERE id = ?', [id]);
        await connection.commit();
        res.json({ message: 'Đã xóa tài khoản thành viên.' });
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
});

export default router;
