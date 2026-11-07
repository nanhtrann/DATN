import { useEffect, useMemo, useState } from 'react';
import { ArrowDownWideNarrow, BrainCircuit, ChevronDown, ChevronRight, FileUp, Search, SlidersHorizontal, Star } from 'lucide-react';
import { api } from '../api/client.js';
import EmptyState from '../components/EmptyState.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { formatDate, initials } from '../utils/format.js';

const columns = [
    { id: 'new', label: 'Mới ứng tuyển', color: 'kanban-blue' },
    { id: 'screening', label: 'Sàng lọc', color: 'kanban-purple' },
    { id: 'interview', label: 'Phỏng vấn', color: 'kanban-amber' },
    { id: 'hired', label: 'Đã tuyển', color: 'kanban-green' },
    { id: 'rejected', label: 'Từ chối', color: 'kanban-gray' }
];

export default function PipelinePage({ notify, uploadOpen = false, onUploadClosed }) {
    const [applications, setApplications] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [jobId, setJobId] = useState('');
    const [search, setSearch] = useState('');
    const [descendingScore, setDescendingScore] = useState(true);
    const [detail, setDetail] = useState(null);
    const [uploadModal, setUploadModal] = useState(false);
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [activeStage, setActiveStage] = useState('all');
    const [collapsedStages, setCollapsedStages] = useState([]);
    const [visibleCounts, setVisibleCounts] = useState({});

    async function load() {
        try {
            const [appResult, jobResult] = await Promise.all([
                api.applications(`?limit=100${jobId ? `&jobId=${jobId}` : ''}`),
                api.jobs('?status=opening&limit=100')
            ]);
            setApplications(appResult.data || []);
            setJobs(jobResult.data || []);
        } catch (err) { setError(err.message); }
    }
    useEffect(() => { load(); }, [jobId]);
    useEffect(() => {
        if (uploadOpen) setUploadModal(true);
    }, [uploadOpen]);
    useEffect(() => {
        if (!uploadModal && uploadOpen) onUploadClosed?.();
    }, [uploadModal]);

    const filtered = useMemo(() => applications.filter((item) => (
        `${item.candidate_name} ${item.candidate_email} ${item.job_title}`.toLowerCase().includes(search.toLowerCase())
    )).sort((left, right) => {
        const leftScore = Number(left.match_score ?? -1);
        const rightScore = Number(right.match_score ?? -1);
        return descendingScore ? rightScore - leftScore : leftScore - rightScore;
    }), [applications, search, descendingScore]);

    const visibleColumns = activeStage === 'all' ? columns : columns.filter((column) => column.id === activeStage);
    const stageCounts = Object.fromEntries(columns.map((column) => [
        column.id,
        filtered.filter((item) => item.status === column.id).length
    ]));

    function toggleCollapsed(stageId) {
        setCollapsedStages((current) => current.includes(stageId)
            ? current.filter((id) => id !== stageId)
            : [...current, stageId]);
    }

    function showMore(stageId) {
        setVisibleCounts((current) => ({
            ...current,
            [stageId]: (current[stageId] || 12) + 12
        }));
    }

    async function moveApplication(id, status) {
        try {
            let outcome = {};
            if (status === 'hired' || status === 'rejected') {
                const reason = window.prompt(status === 'hired'
                    ? 'Lý do tuyển dụng hoặc ghi chú kết quả (không bắt buộc):'
                    : 'Lý do từ chối ứng viên (không bắt buộc):', '');
                if (reason !== null) outcome = { outcomeReason: reason.trim() || undefined };
            }
            const result = await api.updateApplication(id, { status, ...outcome });
            await load();
            if (status === 'hired' || status === 'rejected') {
                notify(result.outcomeEmail === 'sent'
                    ? status === 'hired' ? 'Đã cập nhật: ứng viên trúng tuyển và đã nhận email thông báo.' : 'Đã cập nhật: ứng viên bị từ chối và đã nhận email thông báo.'
                    : result.outcomeEmail === 'failed' ? 'Đã cập nhật trạng thái nhưng không gửi được email kết quả.' : 'Đã cập nhật trạng thái hồ sơ.');
            } else {
                notify('Đã cập nhật trạng thái hồ sơ.');
            }
        } catch (err) { notify(err.message, 'error'); }
    }

    async function uploadResume(event) {
        event.preventDefault();
        const form = new FormData();
        form.append('cvFile', file);
        form.append('jobId', jobId || jobs[0]?.id || '');
        setBusy(true);
        setError('');
        try {
            const result = await api.processCv(form);
            setUploadModal(false);
            setFile(null);
            setDetail({ ...result.data, id: result.applicationId, status: 'new', job_title: jobs.find((job) => String(job.id) === String(jobId || jobs[0]?.id))?.title });
            await load();
            notify('AI đã phân tích và thêm hồ sơ vào pipeline.');
        } catch (err) { setError(err.message); }
        finally { setBusy(false); }
    }

    return (
        <>
            <PageHeader eyebrow="TALENT PIPELINE" title="Pipeline ứng viên" description="Theo dõi tiến trình tuyển dụng và phối hợp đánh giá hồ sơ." action={<button className="button button-primary" onClick={() => { setError(''); setUploadModal(true); }}><FileUp size={17} /> Tải CV & phân tích AI</button>} />
            {error && !uploadModal && <div className="notice notice-error">{error}</div>}
            <section className="surface-card board-toolbar">
                <label className="table-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm ứng viên hoặc vị trí..." /></label>
                <div className="toolbar-right">
                    <label className="select-with-icon"><SlidersHorizontal size={15} /><select value={jobId} onChange={(event) => setJobId(event.target.value)}><option value="">Tất cả vị trí</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
                    <button className="button button-small button-secondary" onClick={() => setDescendingScore((value) => !value)}><ArrowDownWideNarrow size={15} /> Điểm {descendingScore ? 'cao' : 'thấp'} trước</button>
                    <span className="board-total">{filtered.length} hồ sơ</span>
                </div>
            </section>
            <nav className="pipeline-stage-tabs" aria-label="Lọc giai đoạn pipeline">
                <button className={activeStage === 'all' ? 'active' : ''} onClick={() => setActiveStage('all')}>
                    Tất cả <span>{filtered.length}</span>
                </button>
                {columns.map((column) => (
                    <button key={column.id} className={activeStage === column.id ? 'active' : ''} onClick={() => setActiveStage(column.id)}>
                        {column.label} <span>{stageCounts[column.id]}</span>
                    </button>
                ))}
            </nav>
            <div className={`kanban-board ${activeStage !== 'all' ? 'pipeline-board-focused' : ''}`}>
                {visibleColumns.map((column) => {
                    const cards = filtered.filter((item) => item.status === column.id);
                    const collapsed = collapsedStages.includes(column.id);
                    const visibleCount = visibleCounts[column.id] || 12;
                    return <section className={`kanban-column ${column.color}`} key={column.id}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData('application-id'); if (id) moveApplication(id, column.id); }}>
                        <header className="kanban-heading">
                            <span><i />{column.label}</span>
                            <div><b>{cards.length}</b><button type="button" className="column-collapse-button" aria-label={collapsed ? 'Mở rộng cột' : 'Thu gọn cột'} onClick={() => toggleCollapsed(column.id)}>{collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button></div>
                        </header>
                        {!collapsed && <>
                        <div className="kanban-cards">
                            {cards.slice(0, visibleCount).map((item, index) => <article className="candidate-card" key={item.id} draggable
                                onDragStart={(event) => event.dataTransfer.setData('application-id', String(item.id))}
                                onClick={() => setDetail(item)}>
                                <div className="candidate-card-top"><span className={`person-avatar avatar-${index % 5}`}>{initials(item.candidate_name)}</span><button className="card-menu" aria-label="Tùy chọn">···</button></div>
                                <h3>{item.candidate_name}</h3><p>{item.candidate_email}</p>
                                <div className="candidate-role">{item.job_title}</div>
                                <div className="candidate-card-bottom">
                                    <span className="match-score"><Star size={13} fill="currentColor" />{item.match_score == null ? 'Chưa chấm' : `${item.match_score}%`}</span>
                                    <span>{formatDate(item.applied_at)}</span>
                                </div>
                                <div className="card-status-select"><select aria-label="Chuyển trạng thái" value={item.status} onClick={(event) => event.stopPropagation()} onChange={(event) => moveApplication(item.id, event.target.value)}>{columns.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></div>
                            </article>)}
                            {!cards.length && <div className="kanban-empty">Thả hồ sơ vào đây</div>}
                        </div>
                        {cards.length > visibleCount && <button className="pipeline-load-more" onClick={() => showMore(column.id)}>Xem thêm {Math.min(12, cards.length - visibleCount)} hồ sơ</button>}
                        {column.id === 'new' && <button className="add-candidate-hint" onClick={() => setUploadModal(true)}><FileUp size={14} /> Thêm hồ sơ mới</button>}
                        </>}
                    </section>;
                })}
            </div>
            {uploadModal && <Modal title="Tải CV & phân tích bằng AI" description="CV sẽ được so khớp với vị trí và tự thêm vào pipeline." onClose={() => setUploadModal(false)}>
                <form className="form-stack" onSubmit={uploadResume}>
                    <label>Vị trí tuyển dụng<select required value={jobId || jobs[0]?.id || ''} onChange={(event) => setJobId(event.target.value)}><option value="" disabled>Chọn vị trí đang tuyển</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
                    <label className="upload-zone"><input type="file" accept="application/pdf,.pdf" required onChange={(event) => setFile(event.target.files?.[0] || null)} /><span className="upload-icon"><FileUp size={21} /></span><b>{file?.name || 'Chọn file CV PDF'}</b><small>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Tối đa 10 MB · Định dạng PDF'}</small></label>
                    <div className="ai-note"><BrainCircuit size={17} /><span>AI trích xuất thông tin, chấm điểm phù hợp và gợi ý câu hỏi phỏng vấn.</span></div>
                    {error && <div className="form-error">{error}</div>}
                    <div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setUploadModal(false)}>Hủy</button><button className="button button-primary" disabled={busy || !file || !jobs.length}>{busy ? 'AI đang phân tích…' : 'Phân tích CV'}</button></div>
                    {!jobs.length && <small className="inline-warning">Cần có ít nhất một vị trí đang tuyển trước khi tải CV.</small>}
                </form>
            </Modal>}
            {detail && <Modal title={detail.candidate_name || detail.name || 'Hồ sơ ứng viên'} description={detail.job_title || 'Thông tin trích xuất từ CV'} onClose={() => setDetail(null)}>
                <div className="candidate-detail">
                    <div className="detail-score"><span className="score-ring">{detail.match_score ?? '—'}<small>{detail.match_score == null ? '' : '%'}</small></span><div><b>Điểm phù hợp AI</b><span>{detail.status || 'Phân tích CV thành công'}</span></div></div>
                    <div className="detail-contact"><b>{detail.candidate_email || detail.email}</b><span>{detail.candidate_phone || detail.phone || 'Chưa có số điện thoại'}</span></div>
                    {detail.summary && <div className="detail-block"><h4>Tóm tắt hồ sơ</h4><p>{detail.summary}</p></div>}
                    <div className="detail-grid">
                        <div className="detail-block"><h4>Điểm nổi bật</h4>{(detail.pros || []).length ? detail.pros.map((point) => <p className="detail-bullet" key={point}>+ {point}</p>) : <p>Chưa có dữ liệu</p>}</div>
                        <div className="detail-block"><h4>Cần lưu ý</h4>{(detail.cons || []).length ? detail.cons.map((point) => <p className="detail-bullet" key={point}>− {point}</p>) : <p>Chưa có dữ liệu</p>}</div>
                    </div>
                </div>
            </Modal>}
        </>
    );
}
