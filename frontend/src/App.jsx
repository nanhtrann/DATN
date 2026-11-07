import { useCallback, useEffect, useState } from 'react';
import { api, session } from './api/client.js';
import CandidatePortalPage from './pages/CandidatePortalPage.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import Layout from './components/Layout.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import JobsPage from './pages/JobsPage.jsx';
import PipelinePage from './pages/PipelinePage.jsx';
import CandidatesPage from './pages/CandidatesPage.jsx';
import InterviewsPage from './pages/InterviewsPage.jsx';
import TeamPage from './pages/TeamPage.jsx';
import OffersPage from './pages/OffersPage.jsx';

export default function App() {
    if (window.location.pathname.startsWith('/candidate')) return <CandidatePortalPage />;
    return <RecruiterApp />;
}

function RecruiterApp() {
    const [user, setUser] = useState(session.user);
    const [active, setActive] = useState('dashboard');
    const [authError, setAuthError] = useState('');
    const [authBusy, setAuthBusy] = useState(false);
    const [toast, setToast] = useState(null);
    const [uploadOpen, setUploadOpen] = useState(false);

    useEffect(() => {
        if (!session.token) return;
        api.me().then((result) => setUser(result.user)).catch((error) => {
            if (error.status === 401) {
                session.clear();
                setUser(null);
            }
        });
    }, []);

    useEffect(() => {
        const logout = () => setUser(null);
        window.addEventListener('hr:unauthorized', logout);
        return () => window.removeEventListener('hr:unauthorized', logout);
    }, []);

    useEffect(() => {
        if (!toast) return undefined;
        const timer = window.setTimeout(() => setToast(null), 3600);
        return () => window.clearTimeout(timer);
    }, [toast]);

    const notify = useCallback((message, type = 'success') => setToast({ message, type }), []);

    async function login(credentials) {
        setAuthBusy(true);
        setAuthError('');
        try {
            const result = await api.login(credentials);
            session.save(result);
            setUser(result.user);
            setActive('dashboard');
        } catch (error) { setAuthError(error.message); }
        finally { setAuthBusy(false); }
    }

    async function bootstrap(credentials, setupKey) {
        setAuthBusy(true);
        setAuthError('');
        try {
            await api.bootstrap(credentials, setupKey);
            const result = await api.login({ email: credentials.email, password: credentials.password });
            session.save(result);
            setUser(result.user);
            setActive('dashboard');
            notify('Admin đầu tiên đã được tạo.');
        } catch (error) { setAuthError(error.message); }
        finally { setAuthBusy(false); }
    }

    function logout() {
        session.clear();
        setUser(null);
        setAuthError('');
    }

    function openUpload() {
        setUploadOpen(true);
        setActive('pipeline');
    }

    let page;
    switch (active) {
        case 'jobs': page = <JobsPage notify={notify} />; break;
        case 'pipeline': page = <PipelinePage notify={notify} uploadOpen={uploadOpen} onUploadClosed={() => setUploadOpen(false)} />; break;
        case 'candidates': page = <CandidatesPage notify={notify} />; break;
        case 'interviews': page = <InterviewsPage notify={notify} />; break;
        case 'offers': page = <OffersPage notify={notify} />; break;
        case 'team': page = user?.role === 'admin' ? <TeamPage notify={notify} /> : <DashboardPage onNavigate={setActive} onCreateJob={() => setActive('jobs')} onUploadCv={openUpload} />; break;
        default: page = <DashboardPage onNavigate={setActive} onCreateJob={() => setActive('jobs')} onUploadCv={openUpload} />;
    }

    if (!user) return (
        <>
            <AuthScreen onLogin={login} onBootstrap={bootstrap} busy={authBusy} error={authError} />
            {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
        </>
    );

    return (
        <>
            <Layout user={user} active={active} onNavigate={setActive} onLogout={logout}>{page}</Layout>
            {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
        </>
    );
}
