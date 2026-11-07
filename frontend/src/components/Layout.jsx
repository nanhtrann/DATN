import { useState } from 'react';
import {
    BriefcaseBusiness, CalendarDays, CircleHelp, LayoutDashboard, LogOut, Menu, Settings2, UsersRound, X, Handshake
} from 'lucide-react';

const navItems = [
    { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard, section: 'WORKSPACE' },
    { id: 'jobs', label: 'Tin tuyển dụng', icon: BriefcaseBusiness },
    { id: 'pipeline', label: 'Pipeline', icon: UsersRound },
    { id: 'candidates', label: 'Danh sách ứng viên', icon: UsersRound },
    { id: 'interviews', label: 'Lịch phỏng vấn', icon: CalendarDays, section: 'QUẢN LÝ' },
    { id: 'offers', label: 'Thư mời nhận việc', icon: Handshake },
    { id: 'team', label: 'Thành viên', icon: Settings2, adminOnly: true }
];

export default function Layout({ user, active, onNavigate, onLogout, children }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const visibleItems = navItems.filter((item) => !item.adminOnly || user.role === 'admin');
    return (
        <div className="app-shell">
            {mobileOpen && <button className="sidebar-scrim" aria-label="Đóng menu" onClick={() => setMobileOpen(false)} />}
            <aside className={`sidebar${mobileOpen ? ' sidebar-open' : ''}`}>
                <div className="sidebar-brand">
                    <span className="brand-mark"><BriefcaseBusiness size={19} /></span>
                    <span className="brand-name">HR<span className="brand-light">auto</span></span>
                    <button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Đóng menu"><X size={19} /></button>
                </div>
                <div className="workspace-switch">
                    <span className="workspace-avatar">H</span>
                    <span className="workspace-label"><b>HR Workspace</b><small>Recruitment team</small></span>
                </div>
                <div className="nav-label">MENU CHÍNH</div>
                <nav className="side-nav">
                    {visibleItems.map((item) => (
                        <div key={item.id}>
                            {item.section && <div className="nav-section">{item.section}</div>}
                            <button className={`nav-item${active === item.id ? ' nav-active' : ''}`} onClick={() => { onNavigate(item.id); setMobileOpen(false); }}>
                                <item.icon size={18} strokeWidth={1.8} />
                                <span>{item.label}</span>
                            </button>
                        </div>
                    ))}
                </nav>
                <div className="sidebar-spacer" />
                <div className="sidebar-help">
                    <div className="help-icon"><CircleHelp size={17} /></div>
                    <b>Cần hỗ trợ?</b>
                    <span>Khám phá cách sử dụng workspace.</span>
                    <span>Quản lý ứng viên và lịch phỏng vấn tại một nơi.</span>
                </div>
                <button className="user-profile" onClick={onLogout} title="Đăng xuất">
                    <span className="profile-avatar">{(user.name || user.email || 'U').slice(0, 1).toUpperCase()}</span>
                    <span className="profile-label"><b>{user.name}</b><small>{user.role === 'admin' ? 'Quản trị viên' : 'Nhân sự'}</small></span>
                    <LogOut size={16} />
                </button>
            </aside>
            <main className="main-area">
                <header className="topbar">
                    <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Mở menu"><Menu size={20} /></button>
                    <div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{navItems.find((item) => item.id === active)?.label || 'Tổng quan'}</strong></div>
                    <div className="topbar-actions">
                        <button className="logout-button" type="button" onClick={onLogout}>
                            <LogOut size={16} />
                            <span>Đăng xuất</span>
                        </button>
                    </div>
                </header>
                <section className="page-content">{children}</section>
            </main>
        </div>
    );
}
