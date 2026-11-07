import test from 'node:test';
import assert from 'node:assert/strict';
import { httpError, pagination, parseId, parseStoredList, requireFields, validEmail } from '../src/utils/http.js';
import { signCandidateToken, signToken, verifyToken, verifyPassword } from '../src/middleware/auth.js';
import { generateContentWithRetry, hasPdfHeader } from '../src/services/resume.service.js';
import bcrypt from 'bcryptjs';
import { applicationOutcomeTemplate, interviewInvitationTemplate } from '../src/services/email.service.js';

test('parseId accepts positive safe integers and rejects invalid identifiers', () => {
    assert.equal(parseId('42'), 42);
    for (const value of ['0', '-1', '1.2', 'abc', '9007199254740992']) {
        assert.throws(() => parseId(value), { status: 400 });
    }
});

test('pagination applies defaults and bounds page size and offset', () => {
    assert.deepEqual(pagination({}), { limit: 20, page: 1, offset: 0 });
    assert.deepEqual(pagination({ limit: '500', page: '0' }), { limit: 100, page: 1, offset: 0 });
    assert.deepEqual(pagination({ limit: '-3', page: '2' }), { limit: 1, page: 2, offset: 1 });
    assert.deepEqual(pagination({ limit: 'nope', page: '999999' }), {
        limit: 20,
        page: 100000,
        offset: 1999980
    });
});

test('requireFields reports missing values and accepts populated request fields', () => {
    assert.doesNotThrow(() => requireFields({ name: 'HR' }, ['name']));
    assert.throws(() => requireFields({ name: '' }, ['name']), {
        status: 400,
        message: 'Thiếu trường bắt buộc: name.'
    });
});

test('validEmail enforces basic syntax and the MySQL column limit', () => {
    assert.equal(validEmail('recruiter@example.com'), true);
    assert.equal(validEmail('not-an-email'), false);
    assert.equal(validEmail(`${'a'.repeat(100)}@example.com`), false);
    assert.equal(validEmail(null), false);
});

test('JWT tokens verify for the signed user and reject tampering', () => {
    const token = signToken({ id: 17, role: 'admin' });
    assert.equal(verifyToken(token).sub, 17);
    assert.equal(verifyToken(token).role, 'admin');
    const [header, payload, signature] = token.split('.');
    const changedSignature = `${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
    assert.throws(() => verifyToken(`${header}.${payload}.${changedSignature}`), {
        status: 401,
        message: 'Token không hợp lệ hoặc đã hết hạn.'
    });
});

test('candidate JWTs are explicitly scoped as candidate accounts', () => {
    const token = signCandidateToken({ id: 23 });
    const payload = verifyToken(token);
    assert.equal(payload.sub, 23);
    assert.equal(payload.type, 'candidate');
    assert.equal(verifyToken(signToken({ id: 17, role: 'hr' })).type, 'staff');
});

test('PDF validation accepts a header within the first 1024 bytes only', () => {
    assert.equal(hasPdfHeader(Buffer.from('%PDF-1.7\ncontent')), true);
    assert.equal(hasPdfHeader(Buffer.concat([Buffer.from('\uFEFF\n'), Buffer.from('%PDF-1.4\ncontent')])), true);
    assert.equal(hasPdfHeader(Buffer.concat([Buffer.alloc(1023, 0x20), Buffer.from('%PDF-1.5')])), true);
    assert.equal(hasPdfHeader(Buffer.concat([Buffer.alloc(1024, 0x20), Buffer.from('%PDF-1.5')])), false);
    assert.equal(hasPdfHeader(Buffer.from('not a PDF')), false);
    assert.equal(hasPdfHeader(''), false);
});

test('password verification supports legacy plain text and bcrypt hashes', async () => {
    const hash = await bcrypt.hash('long-password', 4);
    assert.equal(await verifyPassword('long-password', hash), true);
    assert.equal(await verifyPassword('incorrect', hash), false);
    assert.equal(await verifyPassword('legacy-password', 'legacy-password'), true);
    assert.equal(await verifyPassword('incorrect', 'legacy-password'), false);
});

test('AI evaluation lists preserve JSON arrays and legacy text', () => {
    assert.deepEqual(parseStoredList('["Kinh nghiệm","Giao tiếp"]'), ['Kinh nghiệm', 'Giao tiếp']);
    assert.deepEqual(parseStoredList('Kinh nghiệm phù hợp'), ['Kinh nghiệm phù hợp']);
    assert.deepEqual(parseStoredList(null), []);
});

test('httpError carries the expected response status', () => {
    assert.equal(httpError(409, 'Conflict').status, 409);
});

test('email templates include interview details and application outcomes', () => {
    const interview = interviewInvitationTemplate({
        candidateName: 'Nguyễn Văn A',
        jobTitle: 'Frontend Developer',
        interviewDate: new Date('2026-11-10T09:00:00+07:00'),
        locationOrLink: 'https://meet.example.com/hrauto'
    });
    assert.match(interview.subject, /Lịch phỏng vấn/);
    assert.match(interview.text, /Frontend Developer/);
    assert.match(interview.text, /https:\/\/meet\.example\.com\/hrauto/);

    const hired = applicationOutcomeTemplate({
        candidateName: 'Nguyễn Văn A', jobTitle: 'Frontend Developer', hired: true
    });
    const rejected = applicationOutcomeTemplate({
        candidateName: 'Nguyễn Văn A', jobTitle: 'Frontend Developer', hired: false
    });
    assert.match(hired.text, /Xin chúc mừng/);
    assert.match(rejected.text, /rất tiếc chưa thể tiếp tục/);
});

test('AI generation retries temporary server errors before succeeding', async () => {
    let calls = 0;
    const delays = [];
    const result = await generateContentWithRetry(async () => {
        calls += 1;
        if (calls < 3) throw Object.assign(new Error('busy'), { status: 503 });
        return 'success';
    }, async (delay) => delays.push(delay));

    assert.equal(result, 'success');
    assert.equal(calls, 3);
    assert.deepEqual(delays, [1000, 2000]);
});

test('AI generation does not retry non-transient errors', async () => {
    let calls = 0;
    const error = Object.assign(new Error('invalid model'), { status: 404 });

    await assert.rejects(generateContentWithRetry(async () => {
        calls += 1;
        throw error;
    }, async () => {}), error);
    assert.equal(calls, 1);
});

test('AI generation stops after three attempts when the service remains unavailable', async () => {
    let calls = 0;
    const delays = [];

    await assert.rejects(generateContentWithRetry(async () => {
        calls += 1;
        throw Object.assign(new Error('busy'), { status: 503 });
    }, async (delay) => delays.push(delay)), { status: 503 });

    assert.equal(calls, 3);
    assert.deepEqual(delays, [1000, 2000]);
});
