import multer from 'multer';
import { httpError } from '../utils/http.js';
import { config } from '../config/env.js';

export function notFoundHandler(req, res, next) {
    next(httpError(404, 'Không tìm thấy API được yêu cầu.'));
}

export function errorHandler(error, req, res, next) {
    if (res.headersSent) return next(error);
    const status = Number(error.status) || (error instanceof multer.MulterError ? 400 : 500);
    if (status >= 500) console.error('Lỗi API:', error);
    res.status(status).json({
        error: error.message || 'Đã xảy ra lỗi máy chủ.',
        ...(status === 500 && !config.isProduction ? { details: error.message } : {})
    });
}
