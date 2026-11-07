import { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, Eye, Plus, Search, Trash2, UsersRound } from 'lucide-react';
import { api } from '../api/client.js';
import EmptyState from '../components/EmptyState.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { formatDate } from '../utils/format.js';

const initialForm = { title: '', department: '', description: '', salary: '', status: 'opening' };

export default function JobsPage({ notify }) {
    const [jobs, setJobs] = useState([]);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [modal, setModal] = useState(false);
    const [selectedJob, setSelectedJob] = useState(null);
    const [form, setForm] = useState(initialForm);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function load() {
        try {
            const result = await api.jobs('?limit=100');
            setJobs(result.data || []);
        } catch (err) { setError(err.message); }
    }

    useEffect(() => { load(); }, []);
    const filtered = useMemo(() => jobs.filter((job) => (
        (filter === 'all' || job.status === filter)
        && `${job.title} ${job.department || ''}`.toLowerCase().includes(search.toLowerCase())
    )), [jobs, filter, search]);

    async function createJob(event) {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            await api.createJob(form);
            setModal(false);
            setForm(initialForm);
            await load();
            notify('Đã tạo tin tuyển dụng.');
        } catch (err) { setError(err.message); }
        finally { setBusy(false); }
    }

    async function toggleStatus(job) {
        try {
            await api.updateJob(job.id, { status: job.status === 'opening' ? 'closed' : 'opening' });
            await load();
            notify(job.status === 'opening' ? 'Đã đóng tin tuyển dụng.' : 'Đã mở lại tin tuyển dụng.');
        } catch (err) { notify(err.message, 'error'); }
    }

    async function deleteJob(job) {
        if (!window.confirm(`Xóa tin "${job.title}"? Tất cả hồ sơ ứng tuyển thuộc tin này cũng sẽ bị xóa.`)) return;
        try {
            await api.deleteJob(job.id);
            await load();
            notify('Đã xóa tin tuyển dụng.');
        } catch (err) { notify(err.message, 'error'); }
    }

    return (
        <>
            <PageHeader eyebrow="QUẢN LÝ TUYỂN DỤNG" title="Tin tuyển dụng" description="Quản lý các vị trí và theo dõi hiệu quả tuyển dụng." action={<button className="button button-primary" onClick={() => { setError(''); setModal(true); }}><Plus size={17} /> Tạo vị trí mới</button>} />
            {error && !modal && <div className="notice notice-error">{error}</div>}
            <section className="surface-card listing-card">
                <div className="list-toolbar">
                    <div className="filter-tabs">
                        {[['all', 'Tất cả', jobs.length], ['opening', 'Đang tuyển', jobs.filter((job) => job.status === 'opening').length], ['closed', 'Đã đóng', jobs.filter((job) => job.status === 'closed').length]].map(([key, label, count]) => (
                            <button key={key} className={filter === key ? 'filter-active' : ''} onClick={() => setFilter(key)}>{label}<small>{count}</small></button>
                        ))}
                    </div>
                    <label className="table-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm vị trí..." /></label>
                </div>
                {filtered.length ? <div className="table-scroll"><table className="data-table jobs-table">
                    <thead><tr><th>VỊ TRÍ</th><th>PHÒNG BAN</th><th>ỨNG VIÊN</th><th>TRẠNG THÁI</th><th>NGÀY TẠO</th><th /></tr></thead>
                    <tbody>{filtered.map((job, index) => <tr key={job.id}>
                        <td><div className="job-cell"><span className={`job-icon job-icon-${index % 4}`}><BriefcaseBusiness size={18} /></span><span><b>{job.title}</b><small>{job.salary || 'Trao đổi khi phỏng vấn'}</small></span></div></td>
                        <td><span className="dept-chip">{job.department || 'Chưa phân loại'}</span></td>
                        <td><span className="count-inline"><UsersRound size={15} /> {job.application_count || 0} hồ sơ</span></td>
                        <td><span className={`stage-pill ${job.status === 'opening' ? 'stage-green' : 'stage-gray'}`}><i />{job.status === 'opening' ? 'Đang tuyển' : 'Đã đóng'}</span></td>
                        <td className="muted-cell">{formatDate(job.created_at)}</td>
                        <td><div className="row-actions"><button className="button button-small button-quiet" onClick={() => setSelectedJob(job)}><Eye size={14} /> Xem tin</button><button className="button button-small button-quiet" onClick={() => toggleStatus(job)}>{job.status === 'opening' ? 'Đóng vị trí' : 'Mở lại'}</button><button className="button button-small button-danger" onClick={() => deleteJob(job)}><Trash2 size={14} /> Xóa</button></div></td>
                    </tr>)}</tbody>
                </table></div> : <EmptyState title="Chưa có tin tuyển dụng" description="Tạo vị trí đầu tiên để bắt đầu xây dựng pipeline tuyển dụng." />}
            </section>
            {selectedJob && <Modal wide title={selectedJob.title} description="Chi tiết tin tuyển dụng và yêu cầu cho vị trí này." onClose={() => setSelectedJob(null)}>
                <div className="record-detail">
                    <div className="record-facts">
                        <div><span>Phòng ban</span><b>{selectedJob.department || 'Chưa phân loại'}</b></div>
                        <div><span>Mức lương</span><b>{selectedJob.salary || 'Trao đổi khi phỏng vấn'}</b></div>
                        <div><span>Trạng thái</span><b>{selectedJob.status === 'opening' ? 'Đang tuyển' : 'Đã đóng'}</b></div>
                        <div><span>Số hồ sơ</span><b>{selectedJob.application_count || 0} ứng viên</b></div>
                    </div>
                    <section className="record-section">
                        <h3><BriefcaseBusiness size={16} /> Mô tả và yêu cầu tuyển dụng</h3>
                        <p className="record-description">{selectedJob.description || 'Tin tuyển dụng chưa có mô tả.'}</p>
                    </section>
                    <div className="record-meta">Ngày đăng: {formatDate(selectedJob.created_at)}</div>
                </div>
            </Modal>}
            {modal && <Modal title="Tạo tin tuyển dụng" description="Nhập thông tin vị trí để bắt đầu nhận hồ sơ." onClose={() => setModal(false)}>
                <form className="form-stack" onSubmit={createJob}>
                    <label>Tên vị trí<input required maxLength={255} placeholder="Ví dụ: Senior Product Designer" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
                    <div className="form-grid"><label>Phòng ban<input maxLength={100} placeholder="Design" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label><label>Mức lương<input maxLength={100} placeholder="30–40 triệu" value={form.salary} onChange={(event) => setForm({ ...form, salary: event.target.value })} /></label></div>
                    <label>Mô tả công việc<textarea required rows={5} placeholder="Mô tả vai trò, trách nhiệm và yêu cầu..." value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
                    {error && <div className="form-error">{error}</div>}
                    <div className="form-actions"><button className="button button-secondary" type="button" onClick={() => setModal(false)}>Hủy</button><button className="button button-primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Tạo vị trí'}</button></div>
                </form>
            </Modal>}
        </>
    );
}
