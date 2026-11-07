export function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

export function parseId(value, label = 'ID') {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) throw httpError(400, `${label} không hợp lệ.`);
    return id;
}

export function pagination(query) {
    const parsedLimit = Number.parseInt(query.limit, 10);
    const parsedPage = Number.parseInt(query.page, 10);
    const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 20, 1), 100);
    const page = Math.min(Math.max(Number.isFinite(parsedPage) ? parsedPage : 1, 1), 100000);
    return { limit, page, offset: (page - 1) * limit };
}

export function requireFields(body, fields) {
    const missing = fields.filter((field) => body[field] === undefined || body[field] === null || body[field] === '');
    if (missing.length) throw httpError(400, `Thiếu trường bắt buộc: ${missing.join(', ')}.`);
}

export function validEmail(value, maxLength = 100) {
    return typeof value === 'string'
        && value.length <= maxLength
        && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function parseStoredList(value) {
    if (typeof value !== 'string' || value.length === 0) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [String(parsed)];
    } catch {
        return [value];
    }
}
