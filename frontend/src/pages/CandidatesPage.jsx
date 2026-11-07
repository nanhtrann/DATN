import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, BriefcaseBusiness, Download, Mail, Phone, Plus, Search, Trash2, UserRound, UsersRound } from 'lucide-react';
import { api } from '../api/client.js';
import EmptyState from '../components/EmptyState.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { formatDate, initials } from '../utils/format.js';

const applicationStatuses = {
    new: { label: 'Mới ứng tuyển', tone: 'stage-blue' },
    screening: { label: 'Sàng lọc', tone: 'stage-purple' },
    interview: { label: 'Phỏng vấn', tone: 'stage-amber' },
    hired: { label: 'Đã tuyển', tone: 'stage-green' },
    rejected: { label: 'Từ chối', tone: 'stage-gray' }
};

export default function CandidatesPage({ notify }) {
    const [candidates, setCandidates] = useState([]);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [loadingProfile, setLoadingProfile] = useState(false);
    const [profileError, setProfileError] = useState('');
    const [downloadingId, setDownloadingId] = useState(null);
    const [form, setForm] = useState({ fullName: '', email: '', phone: '', source: '', tags: '' });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    async function load() {
        try {
            const result = await api.candidates('?limit=100');
            setCandidates(result.data || []);
        } catch (err) { setError(err.message); }
    }
    useEffect(() => { load(); }, []);
    const filtered = useMemo(() => candidates.filter((candidate) => (
        `${candidate.full_name} ${candidate.email} ${candidate.phone || ''}`.toLowerCase().includes(search.toLowerCase())
    )), [candidates, search]);

    async function createCandidate(event) {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            await api.createCandidate(form);
            setShowModal(false);
            setForm({ fullName: '', email: '', phone: '', source: '', tags: '' });
            await load();
            notify('Đã thêm ứng viên vào danh sách.');
        } catch (err) { setError(err.message); }
        finally { setBusy(false); }
    }

    async function viewCandidate(candidateId) {
        setSelectedCandidate(null);
        setProfileError('');
        setLoadingProfile(true);
        try {
            const result = await api.candidate(candidateId);
            setSelectedCandidate(result.data);
        } catch (err) {
            setProfileError(err.message);
        } finally {
            setLoadingProfile(false);
        }
    }

    async function downloadCv(applicationId) {
        setDownloadingId(applicationId);
        try {
            await api.downloadCv(applicationId);
        } catch (err) {
            notify(err.message, 'error');
        } finally {
            setDownloadingId(null);
        }
    }

    async function deleteApplication(application) {
        if (!window.confirm(`Xóa hồ sơ ứng tuyển vào "${application.job_title}" của ứng viên này?`)) return;
        try {
            await api.deleteApplication(application.id);
            await viewCandidate(selectedCandidate.id);
            await load();
            notify('Đã xóa hồ sơ ứng tuyển.');
        } catch (err) { notify(err.message, 'error'); }
    }

    async function deleteCandidate(candidate) {
        if (!window.confirm(`Xóa toàn bộ hồ sơ của "${candidate.full_name}"? Thao tác này sẽ xóa tất cả hồ sơ ứng tuyển liên quan.`)) return;
        try {
            await api.deleteCandidate(candidate.id);
            setSelectedCandidate(null);
            await load();
            notify('Đã xóa hồ sơ ứng viên.');
        } catch (err) { notify(err.message, 'error'); }
    }

    return (
        <>
            <PageHeader eyebrow="TALENT DIRECTORY" title="Danh sách ứng viên" description="Kho hồ sơ tập trung của tất cả ứng viên trong hệ thống." action={<button className="button button-primary" onClick={() => { setError(''); setShowModal(true); }}><Plus size={17} /> Thêm ứng viên</button>} />
            {error && !showModal && <div className="notice notice-error">{error}</div>}
            <section className="surface-card listing-card">
                <div className="list-toolbar"><div className="toolbar-caption"><UsersRound size={17} /> <b>{filtered.length}</b> ứng viên</div><label className="table-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên, email..." /></label></div>
                {filtered.length ? <div className="table-scroll"><table className="data-table">
                    <thead><tr><th>ỨNG VIÊN</th><th>LIÊN HỆ</th><th>HỒ SƠ</th><th>NGÀY THAM GIA</th><th /></tr></thead>
                    <tbody>{filtered.map((candidate, index) => <tr key={candidate.id}>
                        <td><div className="person-cell"><span className={`person-avatar avatar-${index % 5}`}>{initials(candidate.full_name)}</span><span><b>{candidate.full_name}</b><small>Ứng viên #{candidate.id}</small></span></div></td>
                        <td><div className="contact-cell"><span><Mail size={14} />{candidate.email}</span>{candidate.phone && <span><Phone size={14} />{candidate.phone}</span>}</div></td>
                        <td><span className="count-inline">{candidate.application_count || 0} vị trí</span></td>
                        <td className="muted-cell">{formatDate(candidate.created_at)}</td>
                        <td><div className="row-actions"><button className="button button-small button-quiet" onClick={() => viewCandidate(candidate.id)}><UserRound size={14} /> Xem hồ sơ</button><button className="button button-small button-danger" onClick={() => deleteCandidate(candidate)}><Trash2 size={14} /> Xóa</button></div></td>
                    </tr>)}</tbody>
                </table></div> : <EmptyState title="Chưa có ứng viên" description="Ứng viên được phân tích từ CV sẽ tự động xuất hiện ở đây." />}
            </section>
            {loadingProfile && <div className="modal-backdrop"><div className="profile-loading" role="status">Đang tải hồ sơ ứng viên…</div></div>}
            {profileError && <div className="modal-backdrop" onMouseDown={(event) => {
                if (event.target === event.currentTarget) setProfileError('');
            }}><section className="modal-card" role="dialog" aria-modal="true" aria-label="Không thể tải hồ sơ">
                <header className="modal-header"><div><h2>Không thể tải hồ sơ</h2><p>Đã xảy ra lỗi khi lấy thông tin ứng viên.</p></div><button className="icon-button" onClick={() => setProfileError('')} aria-label="Đóng">×</button></header>
                <div className="form-stack"><div className="form-error">{profileError}</div><div className="form-actions"><button className="button button-secondary" onClick={() => setProfileError('')}>Đóng</button></div></div>
            </section></div>}
            {selectedCandidate && <Modal wide title={selectedCandidate.full_name} description="Hồ sơ ứng viên và lịch sử ứng tuyển." onClose={() => setSelectedCandidate(null)}>
                <div className="candidate-profile">
                    <div className="profile-overview">
                        <span className="profile-avatar profile-avatar-large">{initials(selectedCandidate.full_name)}</span>
                        <div className="profile-contact">
                            <b>{selectedCandidate.full_name}</b>
                            <span><Mail size={14} /> {selectedCandidate.email}</span>
                            <span><Phone size={14} /> {selectedCandidate.phone || 'Chưa cung cấp số điện thoại'}</span>
                        </div>
                        <span className="profile-created">Tham gia {formatDate(selectedCandidate.created_at)}</span>
                        <button className="button button-small button-danger" onClick={() => deleteCandidate(selectedCandidate)}><Trash2 size={14} /> Xóa hồ sơ ứng viên</button>
                    </div>
                    <div className="record-section profile-applications">
                        <h3><BriefcaseBusiness size={16} /> Hồ sơ ứng tuyển ({selectedCandidate.applications?.length || 0})</h3>
                        {selectedCandidate.applications?.length ? selectedCandidate.applications.map((application) => {
                            const status = applicationStatuses[application.status] || applicationStatuses.new;
                            return (
                            <article className="candidate-application" key={application.id}>
                                <div className="application-heading">
                                    <div><b>{application.job_title}</b><span>Ứng tuyển {formatDate(application.applied_at)}</span></div>
                                    <div className="application-actions">
                                        <span className={`stage-pill ${status.tone}`}>{status.label}</span>
                                        {application.cv_file_url && <button className="button button-small button-secondary" disabled={downloadingId === application.id} onClick={() => downloadCv(application.id)}><Download size={14} /> {downloadingId === application.id ? 'Đang tải…' : 'Tải CV'}</button>}
                                        <button className="button button-small button-danger" onClick={() => deleteApplication(application)}><Trash2 size={14} /> Xóa hồ sơ</button>
                                    </div>
                                </div>
                                {application.match_score !== null && application.match_score !== undefined && <div className="application-score"><BrainCircuit size={15} /> Điểm phù hợp AI <b>{application.match_score}%</b></div>}
                                {(application.pros?.length > 0 || application.cons?.length > 0) && <div className="profile-evaluation-grid">
                                    {application.pros?.length > 0 && <div className="evaluation-block"><h4>Điểm nổi bật</h4>{application.pros.map((point, index) => <p key={`${application.id}-pro-${index}`}>+ {point}</p>)}</div>}
                                    {application.cons?.length > 0 && <div className="evaluation-block"><h4>Cần lưu ý</h4>{application.cons.map((point, index) => <p key={`${application.id}-con-${index}`}>− {point}</p>)}</div>}
                                </div>}
                                {application.suggested_questions?.length > 0 && <div className="evaluation-block suggested-questions"><h4>Câu hỏi phỏng vấn gợi ý</h4>{application.suggested_questions.map((question, index) => <p key={`${application.id}-question-${index}`}>{index + 1}. {question}</p>)}</div>}
                            </article>
                            );
                        }) : <EmptyState title="Chưa có hồ sơ ứng tuyển" description="Ứng viên này chưa ứng tuyển vào vị trí nào." />}
                    </div>
                </div>
            </Modal>}
            {showModal && <Modal title="Thêm ứng viên" description="Nhập thông tin liên hệ để tạo hồ sơ ứng viên." onClose={() => setShowModal(false)}>
                <form className="form-stack" onSubmit={createCandidate}>
                    <label>Họ và tên<input required maxLength={100} value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Trần Nguyễn Ngọc Anh" /></label>
                    <label>Email<input required type="email" maxLength={100} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="ungvien@example.com" /></label>
                    <label>Số điện thoại<input maxLength={20} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+84 ..." /></label>
                    <label>Nguồn ứng viên<select value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}><option value="">Chưa xác định</option><option value="Website">Website</option><option value="LinkedIn">LinkedIn</option><option value="Facebook">Facebook</option><option value="Giới thiệu nội bộ">Giới thiệu nội bộ</option><option value="Job board">Job board</option><option value="Ứng viên chủ động">Ứng viên chủ động</option></select></label>
                    <label>Thẻ hồ sơ<input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="React, Senior, Remote" /></label>
                    {error && <div className="form-error">{error}</div>}
                    <div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setShowModal(false)}>Hủy</button><button className="button button-primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Thêm ứng viên'}</button></div>
                </form>
            </Modal>}
        </>
    );
}
