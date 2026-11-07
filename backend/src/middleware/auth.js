import { randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { pool } from '../db/pool.js';
import { httpError } from '../utils/http.js';

const jwtSecret = config.jwtSecret || randomBytes(32).toString('hex');

if (!config.jwtSecret) {
    console.warn('JWT_SECRET chưa được cấu hình; token sẽ mất hiệu lực khi server khởi động lại.');
}

export function signToken(user) {
    return jwt.sign({ sub: user.id, role: user.role, type: 'staff' }, jwtSecret, { expiresIn: '12h' });
}

export function signCandidateToken(candidateAccount) {
    return jwt.sign({ sub: candidateAccount.id, type: 'candidate' }, jwtSecret, { expiresIn: '12h' });
}

export function verifyToken(token) {
    try {
        return jwt.verify(token, jwtSecret);
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
            throw httpError(401, 'Token không hợp lệ hoặc đã hết hạn.');
        }
        throw error;
    }
}

export function checkSetupKey(providedKey) {
    if (!config.adminSetupKey || config.adminSetupKey.length < 32 || typeof providedKey !== 'string') return false;
    const expected = Buffer.from(config.adminSetupKey);
    const received = Buffer.from(providedKey);
    return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function authenticate(req, res, next) {
    const authorization = req.headers.authorization || '';
    if (!authorization.startsWith('Bearer ')) return next(httpError(401, 'Vui lòng đăng nhập để tiếp tục.'));
    try {
        const payload = verifyToken(authorization.slice(7));
        if (payload.type === 'candidate') return next(httpError(401, 'Token ứng viên không dùng được cho tài khoản nhân sự.'));
        const [rows] = await pool.execute('SELECT id, name, email, role FROM users WHERE id = ?', [payload.sub]);
        if (!rows.length) return next(httpError(401, 'Tài khoản không còn tồn tại.'));
        req.user = rows[0];
        return next();
    } catch (error) {
        return next(error);
    }
}

export function allowRoles(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) return next(httpError(403, 'Bạn không có quyền thực hiện thao tác này.'));
        return next();
    };
}

export async function verifyPassword(plainTextPassword, storedPassword) {
    const value = String(storedPassword);
    return /^\$2[aby]\$/.test(value)
        ? bcrypt.compare(String(plainTextPassword), value)
        : value === String(plainTextPassword);
}

export function isBcryptHash(value) {
    return /^\$2[aby]\$/.test(String(value));
}
