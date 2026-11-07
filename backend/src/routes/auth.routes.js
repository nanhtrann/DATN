import express from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { checkSetupKey, isBcryptHash, signToken, verifyPassword } from '../middleware/auth.js';
import { loginLimiter, bootstrapLimiter } from '../middleware/rate-limit.js';
import { httpError, requireFields, validEmail } from '../utils/http.js';

const publicRouter = express.Router();
const privateRouter = express.Router();

publicRouter.post('/login', loginLimiter, async (req, res) => {
    requireFields(req.body, ['email', 'password']);
    const email = String(req.body.email).trim().toLowerCase();
    if (!validEmail(email)) throw httpError(400, 'Email không hợp lệ.');
    const [rows] = await pool.execute('SELECT id, name, email, password, role FROM users WHERE email = ?', [email]);
    if (!rows.length) throw httpError(401, 'Email hoặc mật khẩu không chính xác.');
    const user = rows[0];
    const storedPassword = String(user.password);
    const passwordIsHashed = isBcryptHash(storedPassword);
    const validPassword = await verifyPassword(req.body.password, storedPassword);
    if (!validPassword) throw httpError(401, 'Email hoặc mật khẩu không chính xác.');
    if (!passwordIsHashed) {
        const upgradedHash = await bcrypt.hash(String(req.body.password), 12);
        await pool.execute('UPDATE users SET password = ? WHERE id = ?', [upgradedHash, user.id]);
    }
    const token = signToken(user);
    res.json({
        token,
        tokenType: 'Bearer',
        expiresIn: 43200,
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
});

publicRouter.post('/bootstrap', bootstrapLimiter, async (req, res) => {
    if (!checkSetupKey(req.get('x-admin-setup-key'))) {
        throw httpError(403, 'Thiếu hoặc sai khóa khởi tạo admin.');
    }
    requireFields(req.body, ['name', 'email', 'password']);
    const name = String(req.body.name).trim();
    const email = String(req.body.email).trim().toLowerCase();
    const password = String(req.body.password);
    if (!name || name.length > 100 || !validEmail(email) || password.length < 12 || password.length > 128) {
        throw httpError(400, 'Tên/email không hợp lệ; mật khẩu admin cần từ 12 đến 128 ký tự.');
    }

    const connection = await pool.getConnection();
    let lockAcquired = false;
    try {
        const [locks] = await connection.execute("SELECT GET_LOCK('hr-assistant-admin-bootstrap', 5) AS acquired");
        lockAcquired = Number(locks[0].acquired) === 1;
        if (!lockAcquired) throw httpError(503, 'Không thể khóa tiến trình khởi tạo; vui lòng thử lại.');
        const [users] = await connection.execute('SELECT COUNT(*) AS total FROM users');
        if (Number(users[0].total) !== 0) throw httpError(409, 'Admin đầu tiên đã được khởi tạo.');
        const passwordHash = await bcrypt.hash(password, 12);
        const [result] = await connection.execute(
            'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
            [name, email, passwordHash, 'admin']
        );
        const user = { id: result.insertId, name, email, role: 'admin' };
        res.status(201).json({
            message: 'Đã tạo admin đầu tiên. Hãy đăng nhập để tiếp tục.',
            user
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw httpError(409, 'Email người dùng đã tồn tại.');
        throw error;
    } finally {
        if (lockAcquired) await connection.execute("SELECT RELEASE_LOCK('hr-assistant-admin-bootstrap')");
        connection.release();
    }
});

privateRouter.get('/me', (req, res) => res.json({ user: req.user }));

privateRouter.patch('/password', async (req, res) => {
    requireFields(req.body, ['currentPassword', 'newPassword']);
    const currentPassword = String(req.body.currentPassword);
    const newPassword = String(req.body.newPassword);
    if (newPassword.length < 10 || newPassword.length > 128) {
        throw httpError(400, 'Mật khẩu mới phải có từ 10 đến 128 ký tự.');
    }
    if (currentPassword === newPassword) throw httpError(400, 'Mật khẩu mới phải khác mật khẩu hiện tại.');
    const [rows] = await pool.execute('SELECT password FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length) throw httpError(404, 'Không tìm thấy người dùng.');
    const storedPassword = String(rows[0].password);
    const validPassword = await verifyPassword(currentPassword, storedPassword);
    if (!validPassword) throw httpError(401, 'Mật khẩu hiện tại không chính xác.');
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.execute('UPDATE users SET password = ? WHERE id = ?', [passwordHash, req.user.id]);
    res.json({ message: 'Đã đổi mật khẩu thành công.' });
});

export { publicRouter as default, privateRouter };
