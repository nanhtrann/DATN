import { pool } from '../db/pool.js';
import { verifyToken } from './auth.js';
import { httpError } from '../utils/http.js';

export async function authenticateCandidate(req, res, next) {
    const authorization = req.headers.authorization || '';
    if (!authorization.startsWith('Bearer ')) {
        return next(httpError(401, 'Vui lòng đăng nhập vào cổng ứng viên.'));
    }
    try {
        const payload = verifyToken(authorization.slice(7));
        if (payload.type !== 'candidate') {
            return next(httpError(401, 'Token này không thuộc tài khoản ứng viên.'));
        }
        const [rows] = await pool.execute(
            `SELECT ca.id AS account_id, c.id, c.full_name, c.email
             FROM candidate_accounts ca
             JOIN candidates c ON c.id = ca.candidate_id
             WHERE ca.id = ?`,
            [payload.sub]
        );
        if (!rows.length) return next(httpError(401, 'Tài khoản ứng viên không còn tồn tại.'));
        req.candidate = rows[0];
        return next();
    } catch (error) {
        return next(error);
    }
}
