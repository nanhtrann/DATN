export function formatDate(value, options = {}) {
    if (!value) return '—';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit', month: 'short', year: 'numeric', ...options
    }).format(date);
}

export function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    }).format(date);
}

export function initials(name = '') {
    return String(name).trim().split(/\s+/).slice(-2).map((part) => part[0] || '').join('').toUpperCase() || 'ỨV';
}
