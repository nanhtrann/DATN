import rateLimit from 'express-rate-limit';

export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Quá nhiều lần đăng nhập thất bại; vui lòng thử lại sau 15 phút.' }
});

export const bootstrapLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Quá nhiều yêu cầu khởi tạo admin; vui lòng thử lại sau.' }
});

export const candidateLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Quá nhiều lần đăng nhập ứng viên; vui lòng thử lại sau 15 phút.' }
});

export const candidateRegistrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Quá nhiều yêu cầu đăng ký ứng viên; vui lòng thử lại sau.' }
});
