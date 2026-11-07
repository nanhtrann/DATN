const API_BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'hr_assistant_token';
const USER_KEY = 'hr_assistant_user';
const CANDIDATE_TOKEN_KEY = 'hr_candidate_token';
const CANDIDATE_USER_KEY = 'hr_candidate_user';

export const session = {
    get token() { return localStorage.getItem(TOKEN_KEY); },
    get user() {
        try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
        catch { return null; }
    },
    save({ token, user }) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    },
    clear() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    }
};

export const candidateSession = {
    get token() { return localStorage.getItem(CANDIDATE_TOKEN_KEY); },
    get user() {
        try { return JSON.parse(localStorage.getItem(CANDIDATE_USER_KEY) || 'null'); }
        catch { return null; }
    },
    save({ token, user }) {
        localStorage.setItem(CANDIDATE_TOKEN_KEY, token);
        localStorage.setItem(CANDIDATE_USER_KEY, JSON.stringify(user));
    },
    clear() {
        localStorage.removeItem(CANDIDATE_TOKEN_KEY);
        localStorage.removeItem(CANDIDATE_USER_KEY);
    }
};

function authorizationHeaders(token) {
    const headers = new Headers();
    if (token) headers.set('Authorization', 'Bearer ' + token);
    return headers;
}

async function candidateRequest(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const isFormData = options.body instanceof FormData;
    if (options.body && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (candidateSession.token) headers.set('Authorization', 'Bearer ' + candidateSession.token);
    const response = await fetch(`${API_BASE}/candidate-portal${path}`, { ...options, headers });
    if (response.status === 401 && candidateSession.token) {
        candidateSession.clear();
        window.dispatchEvent(new CustomEvent('candidate:unauthorized'));
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(payload.error || `Yêu cầu thất bại (${response.status}).`);
        error.status = response.status;
        throw error;
    }
    return payload;
}

export const candidateApi = {
    login: (body) => candidateRequest('/login', { method: 'POST', body: JSON.stringify(body) }),
    register: (body) => candidateRequest('/register', { method: 'POST', body: JSON.stringify(body) }),
    me: () => candidateRequest('/me'),
    jobs: (query = '') => candidateRequest(`/jobs${query}`),
    applications: () => candidateRequest('/applications'),
    interviews: () => candidateRequest('/interviews'),
    confirmInterview: (id, confirmationStatus) => candidateRequest(`/interviews/${id}/confirmation`, {
        method: 'PATCH', body: JSON.stringify({ confirmationStatus })
    }),
    apply: (jobId, file) => {
        const form = new FormData();
        form.append('jobId', jobId);
        form.append('cvFile', file);
        return candidateRequest('/applications', { method: 'POST', body: form });
    }
};

export async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const isFormData = options.body instanceof FormData;
    if (options.body && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (session.token) headers.set('Authorization', 'Bearer ' + session.token);
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (response.status === 401 && session.token) {
        session.clear();
        window.dispatchEvent(new CustomEvent('hr:unauthorized'));
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(payload.error || `Yêu cầu thất bại (${response.status}).`);
        error.status = response.status;
        throw error;
    }
    return payload;
}

export const api = {
    login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    bootstrap: (body, setupKey) => request('/auth/bootstrap', {
        method: 'POST',
        headers: { 'x-admin-setup-key': setupKey },
        body: JSON.stringify(body)
    }),
    me: () => request('/auth/me'),
    dashboard: (query = '') => request(`/dashboard${query}`),
    downloadFullExport: async () => {
        const headers = authorizationHeaders(session.token);
        const response = await fetch(`${API_BASE}/export/full`, { headers });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || 'Không thể xuất dữ liệu.');
        }
        const blobUrl = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `bao-cao-tuyen-dung-${new Date().toISOString().slice(0, 10)}.xls`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(blobUrl);
    },
    jobs: (query = '') => request(`/jobs${query}`),
    createJob: (body) => request('/jobs', { method: 'POST', body: JSON.stringify(body) }),
    updateJob: (id, body) => request(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    closeJob: (id) => request(`/jobs/${id}`, { method: 'DELETE' }),
    deleteJob: (id) => request(`/jobs/${id}`, { method: 'DELETE' }),
    applications: (query = '') => request(`/applications${query}`),
    updateApplication: (id, body) => request(`/applications/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteApplication: (id) => request(`/applications/${id}`, { method: 'DELETE' }),
    bulkUpdateApplications: (applicationIds, status) => request('/applications/bulk-status', {
        method: 'POST',
        body: JSON.stringify({ applicationIds, status })
    }),
    processCv: (form) => request('/applications/process-cv', { method: 'POST', body: form }),
    candidates: (query = '') => request(`/candidates${query}`),
    candidate: (id) => request(`/candidates/${id}`),
    createCandidate: (body) => request('/candidates', { method: 'POST', body: JSON.stringify(body) }),
    updateCandidate: (id, body) => request(`/candidates/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteCandidate: (id) => request(`/candidates/${id}`, { method: 'DELETE' }),
    downloadCv: async (applicationId) => {
        const headers = authorizationHeaders(session.token);
        const response = await fetch(`${API_BASE}/applications/${applicationId}/cv`, { headers });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || 'Không thể tải CV.');
        }
        const blobUrl = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `CV-${applicationId}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    },
    interviews: (query = '') => request(`/interviews${query}`),
    createInterview: (body) => request('/interviews', { method: 'POST', body: JSON.stringify(body) }),
    updateInterview: (id, body) => request(`/interviews/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remindInterview: (id) => request(`/interviews/${id}/reminder`, { method: 'POST' }),
    completeInterview: (id, body) => request(`/interviews/${id}/complete`, { method: 'POST', body: JSON.stringify(body) }),
    users: (query = '') => request(`/users${query}`),
    createUser: (body) => request('/users', { method: 'POST', body: JSON.stringify(body) })
    ,
    updateUser: (id, body) => request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),
    offers: (query = '') => request(`/offers${query}`),
    createOffer: (body) => request('/offers', { method: 'POST', body: JSON.stringify(body) }),
    updateOffer: (id, body) => request(`/offers/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
    ,sendOffer: (id) => request(`/offers/${id}/send`, { method: 'POST' })
};
