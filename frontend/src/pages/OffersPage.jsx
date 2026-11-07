import { useEffect, useState } from 'react';
import { Handshake, Plus } from 'lucide-react';
import { api } from '../api/client.js';
import EmptyState from '../components/EmptyState.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { formatDate } from '../utils/format.js';

const statusLabels = {
    draft: ['Nháp', 'stage-gray'],
    sent: ['Đã gửi', 'stage-blue'],
    accepted: ['Ứng viên chấp nhận', 'stage-green'],
    declined: ['Ứng viên từ chối', 'stage-gray'],
    withdrawn: ['Đã rút lại', 'stage-gray']
};

export default function OffersPage({ notify }) {
    const [offers, setOffers] = useState([]);
    const [applications, setApplications] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ applicationId: '', salary: '', startDate: '', details: '', status: 'draft' });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    async function load() {
        try {
            const [offerResult, applicationResult] = await Promise.all([
                api.offers('?limit=100'),
                api.applications('?limit=100&status=hired')
            ]);
            setOffers(offerResult.data || []);
            setApplications(applicationResult.data || []);
        } catch (err) { setError(err.message); }
    }
    useEffect(() => { load(); }, []);

    async function createOffer(event) {
        event.preventDefault();
        setBusy(true);
        try {
            const result = await api.createOffer({ ...form, applicationId: Number(form.applicationId) });
            setShowModal(false);
            setForm({ applicationId: '', salary: '', startDate: '', details: '', status: 'draft' });
            await load();
            notify(result.emailStatus === 'sent'
                ? 'Đã tạo và gửi thư mời nhận việc qua email.'
                : result.emailStatus === 'failed'
                    ? 'Đã lưu thư mời nhưng gửi email thất bại.'
                    : 'Đã tạo thư mời nhận việc ở dạng nháp.');
        } catch (err) { setError(err.message); }
        finally { setBusy(false); }
    }

    async function updateStatus(offer, status) {
        try {
            const result = await api.updateOffer(offer.id, { ...offer, status });
            if (status === 'sent') await api.sendOffer(offer.id);
            await load();
            notify(result.emailStatus === 'sent'
                ? 'Đã gửi thư mời nhận việc qua email.'
                : result.emailStatus === 'failed'
                    ? 'Đã lưu trạng thái nhưng gửi email thất bại.'
                    : 'Đã cập nhật thư mời nhận việc.');
        } catch (err) { notify(err.message, 'error'); }
    }

    async function resendOffer(offer) {
        try {
            await api.sendOffer(offer.id);
            await load();
            notify('Đã gửi lại thư mời nhận việc qua email.');
        } catch (err) { notify(err.message, 'error'); }
    }

    return <>
        <PageHeader eyebrow="OFFER MANAGEMENT" title="Thư mời nhận việc" description="Theo dõi offer, mức lương, ngày bắt đầu và phản hồi ứng viên." action={<button className="button button-primary" onClick={() => setShowModal(true)}><Plus size={17} /> Tạo thư mời</button>} />
        {error && <div className="notice notice-error">{error}</div>}
        <section className="surface-card listing-card">
            <div className="list-toolbar"><div className="toolbar-caption"><Handshake size={17} /> <b>{offers.length}</b> thư mời</div></div>
            {offers.length ? <div className="table-scroll"><table className="data-table">
                <thead><tr><th>ỨNG VIÊN</th><th>VỊ TRÍ</th><th>MỨC LƯƠNG</th><th>NGÀY BẮT ĐẦU</th><th>TRẠNG THÁI</th><th>TRẠNG THÁI</th><th /></tr></thead>
                <tbody>{offers.map((offer) => {
                    const [label, tone] = statusLabels[offer.status] || ['Không xác định', 'stage-gray'];
                    return <tr key={offer.id}>
                        <td><b>{offer.candidate_name}</b><small className="table-subtext">{offer.candidate_email}</small></td>
                        <td>{offer.job_title}</td>
                        <td>{offer.salary || '—'}</td>
                        <td>{offer.start_date ? formatDate(offer.start_date) : '—'}</td>
                        <td><span className={`stage-pill ${tone}`}>{label}</span></td>
                        <td><select className="compact-select" value={offer.status} onChange={(event) => updateStatus(offer, event.target.value)}>
                            {Object.entries(statusLabels).map(([value, [text]]) => <option key={value} value={value}>{text}</option>)}
                        </select></td>
                        <td><button className="button button-small button-quiet" type="button" onClick={() => resendOffer(offer)}>Gửi lại</button></td>
                    </tr>;
                })}</tbody>
            </table></div> : <EmptyState title="Chưa có thư mời nhận việc" description="Tạo offer cho hồ sơ đã được tuyển chọn." />}
        </section>
        {showModal && <Modal title="Tạo thư mời nhận việc" description="Offer chỉ dành cho hồ sơ đã được đánh dấu tuyển." onClose={() => setShowModal(false)}>
            <form className="form-stack" onSubmit={createOffer}>
                <label>Ứng viên<select required value={form.applicationId} onChange={(e) => setForm({ ...form, applicationId: e.target.value })}><option value="">Chọn hồ sơ đã tuyển</option>{applications.map((a) => <option key={a.id} value={a.id}>{a.candidate_name} — {a.job_title}</option>)}</select></label>
                <label>Mức lương<input value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} placeholder="Ví dụ: 25-30 triệu/tháng" /></label>
                <label>Ngày bắt đầu<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
                <label>Ghi chú offer<textarea rows="4" value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} /></label>
                <label>Trạng thái<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="draft">Nháp</option><option value="sent">Đã gửi</option></select></label>
                {error && <div className="form-error">{error}</div>}
                <div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setShowModal(false)}>Hủy</button><button className="button button-primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Tạo thư mời'}</button></div>
            </form>
        </Modal>}
    </>;
}
