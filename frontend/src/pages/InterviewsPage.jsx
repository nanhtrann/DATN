import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Clock3, MapPin, Plus, Video, BellRing } from 'lucide-react';
import { api } from '../api/client.js';
import EmptyState from '../components/EmptyState.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { formatDateTime, initials } from '../utils/format.js';

export default function InterviewsPage({ notify }) {
    const [interviews, setInterviews] = useState([]);
    const [applications, setApplications] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ applicationId: '', interviewDate: '', locationOrLink: '', sendInvitation: true });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [filter, setFilter] = useState('upcoming');
    const [completion, setCompletion] = useState(null);
    const [completionForm, setCompletionForm] = useState({ outcome: 'rejected', reason: '', notes: '' });

    async function load() {
        try {
            const [interviewResult, applicationResult] = await Promise.all([
                api.interviews('?limit=100'),
                api.applications('?limit=100&scheduleEligible=true')
            ]);
            setInterviews(interviewResult.data || []);
            setApplications(applicationResult.data || []);
        } catch (err) { setError(err.message); }
    }
    useEffect(() => { load(); }, []);

    const visible = useMemo(() => {
        if (filter === 'all') return interviews;
        if (filter === 'cancelled') return interviews.filter((item) => item.status === 'cancelled');
        return interviews.filter((item) => item.status === 'scheduled');
    }, [filter, interviews]);

    async function schedule(event) {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            const result = await api.createInterview({
                applicationId: Number(form.applicationId),
                interviewDate: new Date(form.interviewDate).toISOString(),
                locationOrLink: form.locationOrLink || null,
                sendInvitation: form.sendInvitation
            });
            setShowModal(false);
            await load();
            notify(result.invitation === 'failed'
                ? 'Đã lưu lịch nhưng không gửi được email mời.'
                : result.invitation === 'sent' ? 'Đã lên lịch và gửi email mời.' : 'Đã lên lịch phỏng vấn.');
        } catch (err) { setError(err.message); }
        finally { setBusy(false); }
    }

    async function updateStatus(id, status) {
        try {
            await api.updateInterview(id, { status });
            await load();
            notify(status === 'cancelled' ? 'Đã hủy lịch phỏng vấn.' : 'Đã cập nhật lịch phỏng vấn.');
        } catch (err) { notify(err.message, 'error'); }
    }

    async function completeInterview(event) {
        event.preventDefault();
        setBusy(true);
        try {
            const result = await api.completeInterview(completion.id, completionForm);
            setCompletion(null);
            await load();
            notify(result.outcomeEmail === 'sent'
                ? `Đã lưu kết quả ${result.outcome === 'hired' ? 'Đậu' : 'Rớt'} và gửi email thông báo.`
                : `Đã lưu kết quả ${result.outcome === 'hired' ? 'Đậu' : 'Rớt'}, nhưng không gửi được email.`);
        } catch (err) { notify(err.message, 'error'); }
        finally { setBusy(false); }
    }

    async function remind(id) {
        try {
            await api.remindInterview(id);
            await load();
            notify('Đã gửi email nhắc lịch.');
        } catch (err) { notify(err.message, 'error'); }
    }

    return (
        <>
            <PageHeader eyebrow="SCHEDULE & COORDINATION" title="Lịch phỏng vấn" description="Điều phối lịch gặp gỡ và giữ mọi người luôn đồng bộ." action={<button className="button button-primary" onClick={() => { setError(''); setShowModal(true); }}><Plus size={17} /> Lên lịch phỏng vấn</button>} />
            {error && !showModal && <div className="notice notice-error">{error}</div>}
            <section className="surface-card listing-card">
                <div className="list-toolbar"><div className="filter-tabs">
                    {[['upcoming', 'Đang lên lịch'], ['all', 'Tất cả'], ['cancelled', 'Đã hủy']].map(([key, label]) => <button className={filter === key ? 'filter-active' : ''} key={key} onClick={() => setFilter(key)}>{label}<small>{key === 'upcoming' ? interviews.filter((item) => item.status === 'scheduled').length : key === 'cancelled' ? interviews.filter((item) => item.status === 'cancelled').length : interviews.length}</small></button>)}
                </div><span className="toolbar-caption"><CalendarDays size={16} /> {visible.length} lịch</span></div>
                {visible.length ? <div className="interview-list">{visible.map((interview, index) => <article className="interview-row" key={interview.id}>
                    <div className="interview-date"><b>{formatDateTime(interview.interview_date).split(' ')[0]}</b><span>{formatDateTime(interview.interview_date).split(' ').slice(1).join(' ')}</span></div>
                    <span className={`person-avatar avatar-${index % 5}`}>{initials(interview.candidate_name)}</span>
                    <div className="interview-main"><b>{interview.candidate_name}</b><span>{interview.job_title}</span><div className="interview-meta"><small><Clock3 size={13} /> {formatDateTime(interview.interview_date)}</small><small>{interview.location_or_link?.startsWith('http') ? <Video size={13} /> : <MapPin size={13} />}{interview.location_or_link || 'Chưa có địa điểm'}</small></div></div>
                    <div className="interview-assignee"><small>NGƯỜI PHỎNG VẤN</small><b>{interview.interviewer_name || 'Chưa phân công'}</b></div>
                    <span className={`stage-pill ${interview.status === 'scheduled' ? 'stage-blue' : interview.status === 'completed' ? 'stage-green' : 'stage-gray'}`}>{interview.status === 'scheduled' ? 'Đã lên lịch' : interview.status === 'completed' ? 'Hoàn thành' : 'Đã hủy'}</span>
                    <span className={`stage-pill ${interview.confirmation_status === 'confirmed' ? 'stage-green' : interview.confirmation_status === 'declined' ? 'stage-gray' : 'stage-amber'}`}>
                        {interview.confirmation_status === 'confirmed' ? 'Ứng viên đã xác nhận' : interview.confirmation_status === 'declined' ? 'Ứng viên từ chối' : 'Chờ xác nhận'}
                    </span>
                    {interview.status === 'scheduled' && <div className="row-actions"><button className="button button-small button-quiet" onClick={() => remind(interview.id)}><BellRing size={14} /> Nhắc lịch</button><button className="button button-small button-quiet" onClick={() => { setCompletion(interview); setCompletionForm({ outcome: 'rejected', reason: '', notes: '' }); }}><Check size={14} /> Hoàn thành</button><button className="button button-small button-quiet" onClick={() => updateStatus(interview.id, 'cancelled')}>Hủy</button></div>}
                </article>)}</div> : <EmptyState title="Chưa có lịch phỏng vấn" description="Lên lịch buổi phỏng vấn từ một hồ sơ đang trong pipeline." />}
            </section>
            {completion && <Modal title="Hoàn thành phỏng vấn" description={`${completion.candidate_name} — ${completion.job_title}`} onClose={() => !busy && setCompletion(null)}>
                <form className="form-stack" onSubmit={completeInterview}>
                    <label>Kết quả phỏng vấn<select required value={completionForm.outcome} onChange={(event) => setCompletionForm({ ...completionForm, outcome: event.target.value })}><option value="">Chọn kết quả</option><option value="hired">Đậu — Tuyển ứng viên</option><option value="rejected">Rớt — Không tiếp tục tuyển</option></select></label>
                    <label>Lý do kết quả<input maxLength={255} value={completionForm.reason} onChange={(event) => setCompletionForm({ ...completionForm, reason: event.target.value })} placeholder={completionForm.outcome === 'hired' ? 'Ví dụ: Đáp ứng tốt vị trí' : 'Ví dụ: Chưa đáp ứng kỹ năng chuyên môn'} /></label>
                    <label>Ghi chú đánh giá<textarea rows={4} maxLength={5000} value={completionForm.notes} onChange={(event) => setCompletionForm({ ...completionForm, notes: event.target.value })} placeholder="Nhập ghi chú cho vòng phỏng vấn..." /></label>
                    <div className="notice notice-success">Kết quả sẽ được cập nhật ngay vào pipeline và gửi email cho ứng viên.</div>
                    <div className="form-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => setCompletion(null)}>Hủy</button><button className="button button-primary" disabled={busy || !completionForm.outcome}>{busy ? 'Đang lưu…' : 'Lưu kết quả phỏng vấn'}</button></div>
                </form>
            </Modal>}
            {showModal && <Modal title="Lên lịch phỏng vấn" description="Chọn hồ sơ, thời gian và gửi lời mời cho ứng viên." onClose={() => setShowModal(false)}>
                <form className="form-stack" onSubmit={schedule}>
                    <label>Hồ sơ ứng viên<select required value={form.applicationId} onChange={(event) => setForm({ ...form, applicationId: event.target.value })}><option value="">Chọn hồ sơ</option>{applications.filter((item) => !['hired', 'rejected'].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.candidate_name} · {item.job_title}</option>)}</select></label>
                    <label>Ngày và giờ<input required type="datetime-local" value={form.interviewDate} onChange={(event) => setForm({ ...form, interviewDate: event.target.value })} /></label>
                    <label>Địa điểm hoặc link họp<input maxLength={255} value={form.locationOrLink} onChange={(event) => setForm({ ...form, locationOrLink: event.target.value })} placeholder="https://meet.google.com/..." /></label>
                    <label className="checkbox-row"><input type="checkbox" checked={form.sendInvitation} onChange={(event) => setForm({ ...form, sendInvitation: event.target.checked })} /> Gửi email mời phỏng vấn cho ứng viên</label>
                    {error && <div className="form-error">{error}</div>}
                    {!applications.length && <small className="inline-warning">Chưa có hồ sơ ứng tuyển để đặt lịch.</small>}
                    <div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setShowModal(false)}>Hủy</button><button className="button button-primary" disabled={busy || !applications.length}>{busy ? 'Đang lưu…' : 'Lưu lịch phỏng vấn'}</button></div>
                </form>
            </Modal>}
        </>
    );
}
