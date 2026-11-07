import { useState } from 'react';
import { ArrowRight, BriefcaseBusiness, Eye, EyeOff, LockKeyhole, Mail, Sparkles, UserRound } from 'lucide-react';

export default function AuthScreen({ onLogin, onBootstrap, busy, error }) {
    const [mode, setMode] = useState('login');
    const [showPassword, setShowPassword] = useState(false);
    const [fields, setFields] = useState({ name: '', email: '', password: '', setupKey: '' });

    function update(event) {
        setFields((current) => ({ ...current, [event.target.name]: event.target.value }));
    }

    function submit(event) {
        event.preventDefault();
        if (mode === 'login') return onLogin({ email: fields.email, password: fields.password });
        return onBootstrap({
            name: fields.name,
            email: fields.email,
            password: fields.password
        }, fields.setupKey);
    }

    return (
        <main className="auth-page">
            <div className="auth-visual">
                <div className="auth-brand">
                    <span className="brand-mark"><BriefcaseBusiness size={21} /></span>
                    <span className="brand-name">HR<span className="brand-light">auto</span></span>
                </div>
                <div className="auth-copy">
                    <span className="eyebrow"><Sparkles size={14} /> HR WORKSPACE</span>
                    <h1>Tìm đúng người.<br /><span>Tuyển đúng lúc.</span></h1>
                    <p>Một không gian gọn gàng để theo dõi từng ứng viên, phối hợp phỏng vấn và đưa ra quyết định tốt hơn.</p>
                    <div className="auth-proof">
                        <div className="avatar-stack"><span>LT</span><span>MH</span><span>AN</span><b>+8</b></div>
                        <span>Đội ngũ của bạn, cùng tiến về phía trước.</span>
                    </div>
                </div>
                <div className="visual-orbit orbit-one" />
                <div className="visual-orbit orbit-two" />
                <div className="auth-bottom">Tuyển dụng thông minh hơn, bắt đầu từ hôm nay.</div>
            </div>
            <section className="auth-panel">
                <div className="auth-form-wrap">
                    <span className="mobile-brand"><BriefcaseBusiness size={19} /><span className="brand-name">HR<span className="brand-light">auto</span></span></span>
                    <div className="auth-heading">
                        <span className="eyebrow">CHÀO MỪNG BẠN</span>
                        <h2>{mode === 'login' ? 'Đăng nhập vào workspace' : 'Thiết lập quản trị viên'}</h2>
                        <p>{mode === 'login' ? 'Tiếp tục hành trình tìm kiếm nhân tài.' : 'Chỉ cần thực hiện một lần cho database mới.'}</p>
                    </div>
                    <form className="auth-form" onSubmit={submit}>
                        {mode === 'bootstrap' && (
                            <>
                                <label>Tên hiển thị
                                    <input name="name" value={fields.name} onChange={update} placeholder="Nguyễn Minh Anh" required maxLength={100} />
                                </label>
                                <label>Khóa khởi tạo
                                    <input name="setupKey" type="password" autoComplete="new-password" value={fields.setupKey} onChange={update} placeholder="Nhập ADMIN_SETUP_KEY từ .env" required />
                                </label>
                            </>
                        )}
                        <label>Email công việc
                            <span className="input-icon"><Mail size={17} />
                                <input name="email" type="email" value={fields.email} onChange={update} placeholder="ban@congty.com" required autoComplete="username" />
                            </span>
                        </label>
                        <label>Mật khẩu
                            <span className="input-icon"><LockKeyhole size={17} />
                                <input name="password" type={showPassword ? 'text' : 'password'} value={fields.password} onChange={update} placeholder="••••••••••••" required minLength={mode === 'bootstrap' ? 12 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                                <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label="Hiện/ẩn mật khẩu">
                                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                                </button>
                            </span>
                            {mode === 'bootstrap' && <small>Mật khẩu quản trị viên cần ít nhất 12 ký tự.</small>}
                        </label>
                        {error && <div className="form-error" role="alert">{error}</div>}
                        <button className="button button-primary auth-submit" disabled={busy}>
                            {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản admin'}
                            {!busy && <ArrowRight size={17} />}
                        </button>
                    </form>
                    <div className="auth-switch">
                        {mode === 'login' ? 'Database chưa có tài khoản?' : 'Đã có tài khoản admin?'}
                        <button type="button" onClick={() => { setMode(mode === 'login' ? 'bootstrap' : 'login'); }}>
                            {mode === 'login' ? 'Thiết lập admin đầu tiên' : 'Quay lại đăng nhập'}
                        </button>
                    </div>
                    <a className="candidate-entry-link" href="/candidate"><UserRound size={15} /> Bạn là ứng viên? Đăng nhập hoặc tạo tài khoản <ArrowRight size={14} /></a>
                    <p className="auth-security"><LockKeyhole size={14} /> Kết nối bảo mật · Phiên đăng nhập được bảo vệ</p>
                </div>
            </section>
        </main>
    );
}
