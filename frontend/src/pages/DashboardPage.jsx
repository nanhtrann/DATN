import { useEffect, useState } from 'react';
import {
    ArrowRight, BarChart3, BriefcaseBusiness, CalendarDays, Download,
    CheckCircle2, Clock3, Plus, Sparkles, TimerReset, UsersRound
} from 'lucide-react';
import { api } from '../api/client.js';
import { formatDateTime, initials } from '../utils/format.js';
import EmptyState from '../components/EmptyState.jsx';
import PageHeader from '../components/PageHeader.jsx';

const pipelineLabels = {
    new: ['Mới ứng tuyển', 'stage-blue'],
    screening: ['Sàng lọc', 'stage-purple'],
    interview: ['Phỏng vấn', 'stage-amber'],
    hired: ['Đã tuyển', 'stage-green'],
    rejected: ['Từ chối', 'stage-gray']
};

export default function DashboardPage({ onNavigate, onCreateJob, onUploadCv }) {
    const [data, setData] = useState(null);
    const [recent, setRecent] = useState([]);
    const [period, setPeriod] = useState('30');
    const [error, setError] = useState('');

    useEffect(() => {
        let alive = true;
        const from = period === 'all' ? '' : (() => {
            const date = new Date();
            date.setDate(date.getDate() - Number(period));
            return `?from=${date.toISOString().slice(0, 10)}`;
        })();
        Promise.all([api.dashboard(from), api.applications('?limit=5')])
            .then(([dashboard, applications]) => {
                if (!alive) return;
                setData(dashboard.data);
                setRecent(applications.data || []);
            })
            .catch((err) => alive && setError(err.message));
        return () => { alive = false; };
    }, [period]);

    const status = data?.applications?.byStatus || {};
    const total = Object.values(status).reduce((sum, count) => sum + Number(count || 0), 0);
    const stages = [
        ['Mới ứng tuyển', Number(status.new || 0), 'stage-fill-blue'],
        ['Sàng lọc', Number(status.screening || 0), 'stage-fill-purple'],
        ['Phỏng vấn', Number(status.interview || 0), 'stage-fill-amber'],
        ['Đã tuyển', Number(status.hired || 0), 'stage-fill-green'],
        ['Từ chối', Number(status.rejected || 0), 'stage-fill-gray']
    ];

    return (
        <>
            <PageHeader
                eyebrow={new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toLocaleUpperCase('vi-VN')}
                title="Chào buổi sáng 👋"
                description="Đây là những gì đang diễn ra với quy trình tuyển dụng của bạn."
                action={<button className="button button-primary" onClick={onCreateJob}><Plus size={17} /> Tạo tin tuyển dụng</button>}
            />
            {error && <div className="notice notice-error">{error}</div>}
            <div className="welcome-strip">
                <div className="welcome-icon"><Sparkles size={19} /></div>
                <div><b>Không gian tuyển dụng của bạn đã sẵn sàng</b><span>Tạo vị trí đầu tiên hoặc tải CV để bắt đầu xây dựng pipeline.</span></div>
                <button className="welcome-link" onClick={onUploadCv}>Tải CV <ArrowRight size={15} /></button>
            </div>
            <div className="report-toolbar">
                <div><BarChart3 size={17} /><span><b>Báo cáo thống kê</b><small>Số liệu theo dữ liệu thực tế trong hệ thống</small></span></div>
                <div className="report-controls">
                    <select aria-label="Khoảng thời gian" value={period} onChange={(event) => setPeriod(event.target.value)}>
                        <option value="30">30 ngày gần nhất</option>
                        <option value="90">90 ngày gần nhất</option>
                        <option value="365">12 tháng gần nhất</option>
                        <option value="all">Toàn bộ</option>
                    </select>
                    <button className="button button-secondary" type="button" onClick={async () => {
                        try {
                            await api.downloadFullExport();
                        } catch (error) {
                            window.alert(error.message);
                        }
                    }}><Download size={15} /> Xuất Excel đầy đủ</button>
                </div>
            </div>
            <div className="stats-grid">
                <StatCard icon={<BriefcaseBusiness size={19} />} tone="blue" label="Tin đang tuyển" value={data?.jobs?.open ?? '—'} note={`${data?.jobs?.total ?? 0} tin tuyển dụng`} />
                <StatCard icon={<UsersRound size={19} />} tone="violet" label="Tổng ứng viên" value={data?.candidates?.total ?? '—'} note="Trong danh sách ứng viên" />
                <StatCard icon={<Clock3 size={19} />} tone="amber" label="Đang trong pipeline" value={total} note={`${status.interview || 0} ứng viên chờ phỏng vấn`} />
                <StatCard icon={<CheckCircle2 size={19} />} tone="green" label="Đã tuyển thành công" value={data?.applications?.hired ?? '—'} note={`Tỷ lệ tuyển dụng ${data?.applications?.hireRate ?? 0}%`} />
                <StatCard icon={<TimerReset size={19} />} tone="blue" label="Thời gian tuyển trung bình" value={data?.applications?.averageDaysToHire == null ? '—' : `${data.applications.averageDaysToHire} ngày`} note="Tính từ ngày hồ sơ ứng tuyển" />
                <StatCard icon={<CalendarDays size={19} />} tone="amber" label="Lịch phỏng vấn" value={data?.interviews?.total ?? 0} note={`${data?.interviews?.scheduled ?? 0} lịch sắp tới · ${data?.interviews?.completionRate ?? 0}% hoàn thành`} />
            </div>
            <div className="report-grid">
                <section className="surface-card report-card">
                    <div className="card-heading"><div><h2>Hồ sơ ứng tuyển theo tháng</h2><p>Xu hướng 12 tháng gần nhất</p></div></div>
                    <TrendChart rows={data?.trend || []} />
                </section>
                <section className="surface-card report-card">
                    <div className="card-heading"><div><h2>Hiệu quả theo phòng ban</h2><p>Số hồ sơ và ứng viên được tuyển</p></div></div>
                    <DepartmentBars rows={data?.byDepartment || []} />
                </section>
            </div>
            <div className="dashboard-grid">
                <section className="surface-card pipeline-summary">
                    <div className="card-heading">
                        <div><h2>Tổng quan pipeline</h2><p>Phân bố ứng viên theo từng giai đoạn</p></div>
                        <button className="text-button" onClick={() => onNavigate('pipeline')}>Xem pipeline <ArrowRight size={15} /></button>
                    </div>
                    <div className="pipeline-total"><b>{total}</b><span>ứng viên đang theo dõi</span></div>
                    <div className="pipeline-bar">
                        {stages.map(([name, count, color]) => (
                            <span key={name} title={`${name}: ${count}`} className={color} style={{ width: `${total ? Math.max((count / total) * 100, count ? 5 : 0) : 0}%` }} />
                        ))}
                    </div>
                    <div className="stage-legend">
                        {stages.map(([name, count, color]) => (
                            <div key={name}><span className={`legend-dot ${color}`} /><span>{name}</span><b>{count}</b></div>
                        ))}
                    </div>
                </section>
                <section className="surface-card upcoming-card">
                    <div className="card-heading">
                        <div><h2>Phỏng vấn sắp tới</h2><p>Lịch gần nhất trong đội ngũ</p></div>
                        <button className="icon-button subtle-icon" onClick={() => onNavigate('interviews')} aria-label="Xem lịch"><CalendarDays size={18} /></button>
                    </div>
                    {data?.upcomingInterviews?.length ? (
                        <div className="upcoming-list">
                            {data.upcomingInterviews.slice(0, 4).map((item) => (
                                <div className="upcoming-item" key={item.id}>
                                    <div className="date-chip"><b>{new Date(String(item.interview_date).replace(' ', 'T')).getDate()}</b><small>{new Date(String(item.interview_date).replace(' ', 'T')).toLocaleDateString('vi-VN', { month: 'short' })}</small></div>
                                    <div className="upcoming-info"><b>{item.candidate_name}</b><span>{item.job_title}</span><small><Clock3 size={12} /> {formatDateTime(item.interview_date)}</small></div>
                                    <span className="avatar-mini">{initials(item.candidate_name)}</span>
                                </div>
                            ))}
                        </div>
                    ) : <EmptyState title="Chưa có lịch phỏng vấn" description="Các buổi phỏng vấn sắp tới sẽ hiển thị ở đây." />}
                    <button className="upcoming-footer" onClick={() => onNavigate('interviews')}>Mở lịch phỏng vấn <ArrowRight size={14} /></button>
                </section>
            </div>
            <section className="surface-card recent-card">
                <div className="card-heading">
                    <div><h2>Ứng viên mới nhất</h2><p>Theo dõi những hồ sơ vừa được cập nhật</p></div>
                    <button className="text-button" onClick={() => onNavigate('pipeline')}>Xem tất cả <ArrowRight size={15} /></button>
                </div>
                {recent.length ? (
                    <div className="table-scroll"><table className="data-table">
                        <thead><tr><th>ỨNG VIÊN</th><th>VỊ TRÍ ỨNG TUYỂN</th><th>ĐIỂM PHÙ HỢP</th><th>TRẠNG THÁI</th><th>NGÀY ỨNG TUYỂN</th></tr></thead>
                        <tbody>{recent.map((item, index) => {
                            const stage = pipelineLabels[item.status] || pipelineLabels.new;
                            return <tr key={item.id}>
                                <td><div className="person-cell"><span className={`person-avatar avatar-${index % 5}`}>{initials(item.candidate_name)}</span><span><b>{item.candidate_name}</b><small>{item.candidate_email}</small></span></div></td>
                                <td>{item.job_title}</td>
                                <td><span className="score-cell"><i><em style={{ width: `${item.match_score || 0}%` }} /></i><b>{item.match_score == null ? '—' : `${item.match_score}%`}</b></span></td>
                                <td><span className={`stage-pill ${stage[1]}`}>{stage[0]}</span></td>
                                <td className="muted-cell">{item.applied_at ? new Date(item.applied_at).toLocaleDateString('vi-VN') : '—'}</td>
                            </tr>;
                        })}</tbody>
                    </table></div>
                ) : <EmptyState title="Chưa có ứng viên nào" description="Thêm ứng viên bằng cách tải CV và để AI hỗ trợ phân tích hồ sơ." />}
            </section>
        </>
    );
}

function TrendChart({ rows }) {
    const maximum = Math.max(...rows.map((row) => Number(row.applications || 0)), 1);
    if (!rows.length) return <EmptyState title="Chưa có dữ liệu" description="Hồ sơ ứng tuyển theo tháng sẽ xuất hiện tại đây." />;
    return <div className="trend-chart">{rows.map((row) => (
        <div className="trend-column" key={row.month} title={`${row.month}: ${row.applications} hồ sơ`}>
            <b>{row.applications}</b>
            <span><i style={{ height: `${Math.max((row.applications / maximum) * 100, 5)}%` }} /></span>
            <small>{row.month.slice(5)}/{row.month.slice(2, 4)}</small>
        </div>
    ))}</div>;
}

function DepartmentBars({ rows }) {
    if (!rows.length) return <EmptyState title="Chưa có dữ liệu" description="Hồ sơ chưa được phân theo phòng ban." />;
    const maximum = Math.max(...rows.map((row) => Number(row.applications || 0)), 1);
    return <div className="department-bars">{rows.slice(0, 7).map((row) => (
        <div className="department-row" key={row.department}>
            <div><b>{row.department}</b><span>{row.hired} tuyển / {row.applications} hồ sơ</span></div>
            <div className="department-track"><i style={{ width: `${(row.applications / maximum) * 100}%` }} /></div>
        </div>
    ))}</div>;
}

function exportDashboardCsv(data) {
    if (!data) return;
    const rows = [['Nhóm', 'Tên', 'Số lượng'], ['Ứng tuyển', 'Tổng hồ sơ', data.applications?.total || 0], ['Ứng tuyển', 'Đã tuyển', data.applications?.hired || 0], ['Ứng tuyển', 'Từ chối', data.applications?.rejected || 0], ['Phỏng vấn', 'Tổng lịch', data.interviews?.total || 0], ['Phỏng vấn', 'Hoàn thành', data.interviews?.completed || 0]];
    (data.byDepartment || []).forEach((row) => rows.push(['Phòng ban', row.department, row.applications]));
    const csv = '\uFEFF' + rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `bao-cao-tuyen-dung-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

function StatCard({ icon, tone, label, value, note }) {
    return <article className="stat-card">
        <div className="stat-top"><span className={`stat-icon tone-${tone}`}>{icon}</span></div>
        <span className="stat-label">{label}</span>
        <div className="stat-value">{value}</div>
        <span className="stat-note">{note}</span>
    </article>;
}
