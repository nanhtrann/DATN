import { useEffect, useMemo, useState } from 'react';
import {
    ArrowRight, BriefcaseBusiness, CheckCircle2, Clock3, FileUp, LogOut,
    MapPin, Search, ShieldCheck, Sparkles
} from 'lucide-react';
import { candidateApi, candidateSession } from '../api/client.js';
import EmptyState from '../components/EmptyState.jsx';
import Modal from '../components/Modal.jsx';
import { formatDate } from '../utils/format.js';

const applicationStatuses = {
    new: ['Đã nhận hồ sơ', 'stage-blue'],
    screening: ['Đang sàng lọc', 'stage-purple'],
    interview: ['Đang phỏng vấn', 'stage-amber'],
    hired: ['Đã tuyển', 'stage-green'],
    rejected: ['Đã kết thúc', 'stage-gray']
};

export default function CandidatePortalPage() {
    const [user, setUser] = useState(candidateSession.user);
    const [authMode, setAuthMode] = useState('login');
    const [authForm, setAuthForm] = useState({ name: '', email: '', phone: '', password: '' });
    const [authError, setAuthError] = useState('');
    const [authBusy, setAuthBusy] = useState(false);
    const [loading, setLoading] = useState(Boolean(candidateSession.token));
    const [jobs, setJobs] = useState([]);
    const [applications, setApplications] = useState([]);
    const [interviews, setInterviews] = useState([]);
    const [search, setSearch] = useState('');
    const [pageError, setPageError] = useState('');
    const [applyingJob, setApplyingJob] = useState(null);
    const [cvFile, setCvFile] = useState(null);
    const [applyError, setApplyError] = useState('');
    const [applyBusy, setApplyBusy] = useState(false);
    const [scoreResult, setScoreResult] = useState(null);

    async function loadPortal() {
        const [jobResult, applicationResult, interviewResult] = await Promise.all([
            candidateApi.jobs('?limit=100'),
            candidateApi.applications(),
            candidateApi.interviews()
        ]);
        setJobs(jobResult.data || []);
        setApplications(applicationResult.data || []);
        setInterviews(interviewResult.data || []);
    }

    useEffect(() => {
        let active = true;
        const onUnauthorized = () => {
            candidateSession.clear();
            setUser(null);
            setLoading(false);
        };
        window.addEventListener('candidate:unauthorized', onUnauthorized);
        if (candidateSession.token) {
            Promise.all([candidateApi.me(), loadPortal()])
                .then(([result]) => {
                    if (active) setUser(result.user);
                })
                .catch((error) => {
                    if (active) {
                        candidateSession.clear();
                        setUser(null);
                        setPageError(error.message);
                    }
                })
                .finally(() => active && setLoading(false));
        } else {
            setLoading(false);
        }
        return () => {
            active = false;
            window.removeEventListener('candidate:unauthorized', onUnauthorized);
        };
    }, []);

    const filteredJobs = useMemo(() => {
        const term = search.trim().toLocaleLowerCase('vi');
        if (!term) return jobs;
        return jobs.filter((job) => (
            `${job.title} ${job.department || ''} ${job.description || ''}`.toLocaleLowerCase('vi').includes(term)
        ));
    }, [jobs, search]);
    async function submitAuth(event) {
        event.preventDefault();
        setAuthBusy(true);
        setAuthError('');
        try {
            const payload = authMode === 'register'
                ? await candidateApi.register(authForm)
                : await candidateApi.login({ email: authForm.email, password: authForm.password });
            candidateSession.save(payload);
            setUser(payload.user);
            setPageError('');
            setLoading(true);
            await loadPortal();
        } catch (error) {
            setAuthError(error.message);
            candidateSession.clear();
            setUser(null);
        } finally {
            setAuthBusy(false);
            setLoading(false);
        }
    }

    function logout() {
        candidateSession.clear();
        setUser(null);
        setApplications([]);
        setJobs([]);
        setAuthError('');
        setPageError('');
        setScoreResult(null);
    }

    function openApply(job) {
        setApplyingJob(job);
        setCvFile(null);
        setApplyError('');
    }

    async function submitApplication(event) {
        event.preventDefault();
        if (!applyingJob || !cvFile) return;
        if (cvFile.size > 10 * 1024 * 1024) {
            setApplyError('File CV vượt quá giới hạn 10 MB.');
            return;
        }
        setApplyBusy(true);
        setApplyError('');
        try {
            const result = await candidateApi.apply(applyingJob.id, cvFile);
            setScoreResult({ jobTitle: applyingJob.title, score: result.data.matchScore });
            setApplyingJob(null);
            setCvFile(null);
            await loadPortal();
        } catch (error) {
            setApplyError(error.message);
        } finally {
            setApplyBusy(false);
        }
    }

    async function confirmInterview(id, confirmationStatus) {
        try {
            await candidateApi.confirmInterview(id, confirmationStatus);
            await loadPortal();
            setPageError('');
        } catch (error) {
            setPageError(error.message);
        }
    }

    if (loading) {
        return <main className="candidate-portal-loading"><span className="brand-mark"><BriefcaseBusiness size={19} /></span><p>Đang tải cổng ứng viên…</p></main>;
    }

    if (!user) {
        return (
            <main className="candidate-auth-page">
                <header className="candidate-public-header">
                    <a className="candidate-brand" href="/candidate" aria-label="HRauto - Cổng ứng viên"><span className="brand-mark"><BriefcaseBusiness size={19} /></span><span className="brand-name">HR<span>auto</span></span></a>
                    <a className="candidate-hr-link" href="/">Dành cho nhà tuyển dụng <ArrowRight size={14} /></a>
                </header>
                <section className="candidate-auth-layout">
                    <div className="candidate-auth-intro">
                        <span className="eyebrow"><Sparkles size={14} /> CỔNG ỨNG VIÊN</span>
                        <h1>Cơ hội phù hợp,<br /><span>bắt đầu từ đây.</span></h1>
                        <p>Tạo tài khoản để khám phá vị trí đang tuyển, nộp CV và xem điểm phù hợp với công việc.</p>
                        <div className="candidate-privacy"><ShieldCheck size={17} /><span><b>Riêng tư theo thiết kế</b><small>Chỉ bạn mới xem được hồ sơ và điểm đánh giá của mình.</small></span></div>
                    </div>
                    <div className="candidate-auth-card">
                        <div className="candidate-auth-tabs">
                            <button className={authMode === 'login' ? 'candidate-tab-active' : ''} onClick={() => { setAuthMode('login'); setAuthError(''); }}>Đăng nhập</button>
                            <button className={authMode === 'register' ? 'candidate-tab-active' : ''} onClick={() => { setAuthMode('register'); setAuthError(''); }}>Tạo tài khoản</button>
                        </div>
                        <div className="auth-heading">
                            <span className="eyebrow">XIN CHÀO</span>
                            <h2>{authMode === 'login' ? 'Chào mừng bạn trở lại' : 'Tạo tài khoản ứng viên'}</h2>
                            <p>{authMode === 'login' ? 'Đăng nhập để xem cơ hội và hồ sơ của bạn.' : 'Dùng email cá nhân để đăng ký và nộp hồ sơ.'}</p>
                        </div>
                        <form className="auth-form" onSubmit={submitAuth}>
                            {authMode === 'register' && <>
                                <label>Họ và tên<input required maxLength={100} autoComplete="name" value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} placeholder="Trần Nguyễn Ngọc Anh" /></label>
                                <label>Số điện thoại <small>(không bắt buộc)</small><input maxLength={20} autoComplete="tel" value={authForm.phone} onChange={(event) => setAuthForm({ ...authForm, phone: event.target.value })} placeholder="+84 ..." /></label>
                            </>}
                            <label>Email<input required type="email" maxLength={100} autoComplete="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} placeholder="ban@example.com" /></label>
                            <label>Mật khẩu<input required type="password" minLength={authMode === 'register' ? 10 : 1} maxLength={128} autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} placeholder={authMode === 'register' ? 'Tối thiểu 10 ký tự' : 'Mật khẩu của bạn'} /></label>
                            {authMode === 'register' && <small className="candidate-form-hint">Khi đăng ký, hồ sơ ứng viên sẽ được tạo bằng thông tin tài khoản của bạn.</small>}
                            {authError && <div className="form-error" role="alert">{authError}</div>}
                            <button className="button button-primary auth-submit" disabled={authBusy}>{authBusy ? 'Đang xử lý…' : authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'} {!authBusy && <ArrowRight size={17} />}</button>
                        </form>
                        <p className="auth-security"><ShieldCheck size={14} /> Tài khoản ứng viên được lưu riêng với workspace tuyển dụng.</p>
                    </div>
                </section>
                <footer className="candidate-footer candidate-auth-footer">
                    <span>© {new Date().getFullYear()} HRauto · Cổng ứng viên</span>
                    <a href="/">Trang dành cho nhà tuyển dụng <ArrowRight size={13} /></a>
                </footer>
            </main>
        );
    }

    return (
        <main className="candidate-portal">
            <header className="candidate-portal-header">
                <a className="candidate-brand" href="/candidate" aria-label="HRauto - Cổng ứng viên"><span className="brand-mark"><BriefcaseBusiness size={19} /></span><span className="brand-name">HR<span>auto</span></span></a>
                <nav><a className="candidate-nav-active" href="#jobs">Tin tuyển dụng</a><a href="#my-applications">Hồ sơ của tôi</a></nav>
                <div className="candidate-account"><span className="profile-avatar">{(user.name || 'U').slice(0, 1).toUpperCase()}</span><span><b>{user.name}</b><small>{user.email}</small></span><button className="button button-secondary button-small" onClick={logout}><LogOut size={14} /> Đăng xuất</button></div>
            </header>
            <section className="candidate-welcome">
                <span className="eyebrow"><Sparkles size={14} /> CỔNG ỨNG VIÊN</span>
                <h1>Xin chào, {user.name?.split(' ')[0] || 'bạn'}!</h1>
                <p>Tìm vị trí phù hợp, gửi CV và theo dõi điểm đánh giá AI ngay trong tài khoản của bạn.</p>
                <div className="candidate-welcome-stats">
                    <div><BriefcaseBusiness size={17} /><span><b>{jobs.length}</b><small>vị trí đang tuyển</small></span></div>
                    <div><FileUp size={17} /><span><b>{applications.length}</b><small>hồ sơ đã nộp</small></span></div>
                </div>
            </section>
            {pageError && <div className="notice notice-error candidate-page-error">{pageError}</div>}
            <section className="candidate-content" id="jobs">
                <div className="candidate-section-heading">
                    <div><span className="eyebrow">CƠ HỘI NGHỀ NGHIỆP</span><h2>Vị trí đang tuyển</h2><p>Đọc mô tả và yêu cầu trước khi gửi hồ sơ.</p></div>
                    <label className="table-search candidate-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm vị trí, phòng ban..." /></label>
                </div>
                {filteredJobs.length ? <div className="candidate-job-grid">
                    {filteredJobs.map((job) => {
                        const application = applications.find((item) => Number(item.job_id) === Number(job.id));
                        return <article className="candidate-job-card" key={job.id}>
                            <div className="candidate-job-top"><span className="candidate-job-icon"><BriefcaseBusiness size={19} /></span><span className="stage-pill stage-green"><i /> Đang tuyển</span></div>
                            <h3>{job.title}</h3>
                            <div className="candidate-job-meta"><span><BriefcaseBusiness size={14} /> {job.department || 'Chưa phân loại'}</span><span><MapPin size={14} /> {job.salary || 'Trao đổi khi phỏng vấn'}</span></div>
                            <div className="candidate-job-description"><b>Mô tả và yêu cầu</b><p>{job.description}</p></div>
                            <div className="candidate-job-footer">
                                <small>Đăng {formatDate(job.created_at)}</small>
                                {application ? <span className="candidate-score-badge"><CheckCircle2 size={15} /> Đã nộp · Điểm phù hợp <b>{application.match_score ?? 'Đang xử lý'}{application.match_score != null ? '%' : ''}</b></span>
                                    : <button className="button button-primary button-small" onClick={() => openApply(job)}><FileUp size={15} /> Nộp hồ sơ</button>}
                            </div>
                        </article>;
                    })}
                </div> : <EmptyState title="Không tìm thấy vị trí phù hợp" description="Thử từ khóa khác hoặc quay lại sau để xem cơ hội mới." />}
            </section>
            <section className="candidate-content candidate-applications-section" id="my-applications">
                <div className="candidate-section-heading"><div><span className="eyebrow">THEO DÕI TIẾN TRÌNH</span><h2>Hồ sơ của tôi</h2><p>Điểm phù hợp AI chỉ hiển thị với tài khoản của bạn.</p></div></div>
                {applications.length ? <div className="candidate-application-list">
                    {applications.map((application) => {
                        const status = applicationStatuses[application.status] || applicationStatuses.new;
                        return <article className="candidate-application-row" key={application.id}>
                            <div className="candidate-job-icon"><BriefcaseBusiness size={18} /></div>
                            <div className="candidate-application-title"><b>{application.job_title}</b><span>{application.department || 'Chưa phân loại'} · Nộp {formatDate(application.applied_at)}</span></div>
                            <span className={`stage-pill ${status[1]}`}><i /> {status[0]}</span>
                            <div className="candidate-application-score"><Sparkles size={15} /><span>Điểm phù hợp AI</span><b>{application.match_score ?? '—'}{application.match_score != null ? '%' : ''}</b></div>
                        </article>;
                    })}
                </div> : <EmptyState title="Bạn chưa nộp hồ sơ nào" description="Chọn một vị trí đang tuyển và gửi CV để nhận điểm phù hợp bằng AI." />}
            </section>
            <section className="candidate-content candidate-applications-section">
                <div className="candidate-section-heading"><div><span className="eyebrow">XÁC NHẬN THAM DỰ</span><h2>Lịch phỏng vấn của tôi</h2><p>Xác nhận hoặc từ chối lịch để nhà tuyển dụng dễ dàng điều phối.</p></div></div>
                {interviews.length ? <div className="candidate-application-list">{interviews.map((interview) => (
                    <article className="candidate-application-row" key={interview.id}>
                        <div className="candidate-job-icon"><Clock3 size={18} /></div>
                        <div className="candidate-application-title"><b>{interview.job_title}</b><span>{formatDate(interview.interview_date)} · {interview.location_or_link || 'Địa điểm chưa cập nhật'}</span></div>
                        {interview.status === 'scheduled' && interview.confirmation_status === 'pending'
                            ? <div className="row-actions">
                                <button className="button button-small button-primary" onClick={() => confirmInterview(interview.id, 'confirmed')}>Xác nhận tham gia</button>
                                <button className="button button-small button-secondary" onClick={() => confirmInterview(interview.id, 'declined')}>Không thể tham gia</button>
                            </div>
                            : <span className={`stage-pill ${interview.confirmation_status === 'confirmed' ? 'stage-green' : 'stage-gray'}`}>{interview.confirmation_status === 'confirmed' ? 'Đã xác nhận' : interview.confirmation_status === 'declined' ? 'Đã từ chối' : interview.status}</span>}
                    </article>
                ))}</div> : <EmptyState title="Chưa có lịch phỏng vấn" description="Lịch phỏng vấn của bạn sẽ hiển thị tại đây." />}
            </section>
            <footer className="candidate-footer"><span>© {new Date().getFullYear()} HRauto · Cổng ứng viên</span><a href="/">Trang dành cho nhà tuyển dụng <ArrowRight size={13} /></a></footer>
            {applyingJob && <Modal title={`Ứng tuyển: ${applyingJob.title}`} description="Tải CV PDF lên. AI sẽ so sánh hồ sơ với yêu cầu công việc và chỉ hiển thị điểm phù hợp cho bạn." onClose={() => !applyBusy && setApplyingJob(null)}>
                <form className="form-stack candidate-apply-form" onSubmit={submitApplication}>
                    <div className="candidate-apply-job"><b>{applyingJob.title}</b><span>{applyingJob.department || 'Chưa phân loại'} · {applyingJob.salary || 'Trao đổi khi phỏng vấn'}</span><p>{applyingJob.description}</p></div>
                    <label className="upload-zone"><input type="file" accept="application/pdf,.pdf" required onChange={(event) => setCvFile(event.target.files?.[0] || null)} /><span className="upload-icon"><FileUp size={21} /></span><b>{cvFile?.name || 'Chọn CV của bạn (PDF)'}</b><small>{cvFile ? `${(cvFile.size / 1024 / 1024).toFixed(2)} MB` : 'PDF · Tối đa 10 MB'}</small></label>
                    <div className="ai-note"><Sparkles size={17} /><span>Kết quả gửi về tài khoản của bạn chỉ gồm điểm phù hợp AI. Hồ sơ sẽ được lưu để nhà tuyển dụng xem xét.</span></div>
                    {applyError && <div className="form-error" role="alert">{applyError}</div>}
                    <div className="form-actions"><button type="button" className="button button-secondary" disabled={applyBusy} onClick={() => setApplyingJob(null)}>Hủy</button><button className="button button-primary" disabled={applyBusy || !cvFile}>{applyBusy ? 'Đang phân tích CV…' : 'Nộp hồ sơ & nhận điểm'}</button></div>
                </form>
            </Modal>}
            {scoreResult && <div className="modal-backdrop" onMouseDown={(event) => {
                if (event.target === event.currentTarget) setScoreResult(null);
            }}><section className="score-result-card" role="dialog" aria-modal="true" aria-label="Kết quả đánh giá AI">
                <span className="score-result-icon"><CheckCircle2 size={24} /></span>
                <span className="eyebrow">HỒ SƠ ĐÃ ĐƯỢC GỬI</span>
                <h2>Điểm phù hợp của bạn</h2>
                <p>{scoreResult.jobTitle}</p>
                <div className="score-result-value">{scoreResult.score}<small>%</small></div>
                <span className="score-result-caption"><Clock3 size={14} /> Nhà tuyển dụng sẽ xem xét hồ sơ của bạn.</span>
                <button className="button button-primary" onClick={() => setScoreResult(null)}>Đóng</button>
            </section></div>}
        </main>
    );
}
