import { useEffect, useState } from 'react';
import { Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { api } from '../api/client.js';
import EmptyState from '../components/EmptyState.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { formatDate, initials } from '../utils/format.js';

export default function TeamPage({ notify }) {
    const [users, setUsers] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', password: '', role: 'hr' });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    async function load() {
        try {
            const result = await api.users('?limit=100');
            setUsers(result.data || []);
        } catch (err) { setError(err.message); }
    }
    useEffect(() => { load(); }, []);

    async function createUser(event) {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            await api.createUser(form);
            setShowModal(false);
            setForm({ name: '', email: '', password: '', role: 'hr' });
            await load();
            notify('Đã thêm thành viên mới.');
        } catch (err) { setError(err.message); }
        finally { setBusy(false); }
    }

    async function deleteUser(user) {
        if (!window.confirm(`Xóa tài khoản "${user.name}"?`)) return;
        try {
            await api.deleteUser(user.id);
            await load();
            notify('Đã xóa tài khoản thành viên.');
        } catch (err) { notify(err.message, 'error'); }
    }

    return (
        <>
            <PageHeader eyebrow="WORKSPACE SETTINGS" title="Thành viên" description="Quản lý tài khoản và quyền truy cập workspace." action={<button className="button button-primary" onClick={() => { setError(''); setShowModal(true); }}><Plus size={17} /> Mời thành viên</button>} />
            {error && !showModal && <div className="notice notice-error">{error}</div>}
            <section className="surface-card listing-card">
                <div className="list-toolbar"><div className="toolbar-caption"><UserRound size={17} /> <b>{users.length}</b> thành viên</div><span className="permission-note"><ShieldCheck size={15} /> Quyền quản trị được bảo vệ</span></div>
                {users.length ? <div className="table-scroll"><table className="data-table">
                    <thead><tr><th>THÀNH VIÊN</th><th>EMAIL</th><th>VAI TRÒ</th><th>NGÀY THAM GIA</th><th /></tr></thead>
                    <tbody>{users.map((user, index) => <tr key={user.id}>
                        <td><div className="person-cell"><span className={`person-avatar avatar-${index % 5}`}>{initials(user.name)}</span><span><b>{user.name}</b><small>Thành viên</small></span></div></td>
                        <td>{user.email}</td><td><span className={`stage-pill ${user.role === 'admin' ? 'stage-purple' : 'stage-blue'}`}>{user.role === 'admin' ? 'Quản trị viên' : 'Nhân sự'}</span></td>
                        <td className="muted-cell">{formatDate(user.created_at)}</td>
                        <td><button className="icon-button danger-icon" title="Xóa thành viên" onClick={() => deleteUser(user)}><Trash2 size={16} /></button></td>
                    </tr>)}</tbody>
                </table></div> : <EmptyState title="Chưa có thành viên" description="Tạo admin đầu tiên từ màn hình đăng nhập để quản lý thành viên." />}
            </section>
            {showModal && <Modal title="Thêm thành viên" description="Tài khoản mới có thể đăng nhập ngay sau khi tạo." onClose={() => setShowModal(false)}>
                <form className="form-stack" onSubmit={createUser}>
                    <label>Họ và tên<input required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Tên thành viên" /></label>
                    <label>Email<input required type="email" maxLength={100} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="thanhvien@congty.com" /></label>
                    <label>Mật khẩu tạm thời<input required type="password" minLength={10} maxLength={128} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Ít nhất 10 ký tự" /></label>
                    <label>Vai trò<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="hr">Nhân sự</option><option value="admin">Quản trị viên</option></select></label>
                    {error && <div className="form-error">{error}</div>}
                    <div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setShowModal(false)}>Hủy</button><button className="button button-primary" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo tài khoản'}</button></div>
                </form>
            </Modal>}
        </>
    );
}
