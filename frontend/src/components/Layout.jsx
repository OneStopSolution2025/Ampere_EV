import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Icon from './Icon';
import { useAuth } from '../auth';
import { navFor, ROLE_LABELS } from '../permissions';
import { Modal } from './ui';
import { PasswordCard } from '../pages/Settings';

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

function useInstallPrompt() {
  const [evt, setEvt] = useState(null);
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setEvt(e); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  return evt ? async () => { evt.prompt(); await evt.userChoice; setEvt(null); } : null;
}

export default function Layout() {
  const { user, business, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState(false);
  const loc = useLocation();
  const online = useOnline();
  const install = useInstallPrompt();
  const nav = navFor(user.role);
  const links = nav.filter((n) => !n.section);
  const current = [...links].reverse().find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)));
  const bottom = links.slice(0, 4);

  useEffect(() => setOpen(false), [loc.pathname]);

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="brand">
          <img src="/pwa-192.png" alt="" />
          <div><b>{business?.name || 'Ampere EV'}</b><span>{user.role === 'subdealer' ? user.subdealer_name : 'Sales & service'}</span></div>
        </div>
        <nav className="nav">
          {nav.map((n) => (n.section
            ? <div key={n.section} className="nav-section">{n.section}</div>
            : <NavLink key={n.to} to={n.to} end={n.end}><Icon name={n.icon} />{n.label}</NavLink>))}
        </nav>
        <div className="side-foot">
          {install && (
            <button className="btn sm" style={{ width: '100%', marginBottom: 12 }} onClick={install}>
              <Icon name="install" size={16} />Install app
            </button>
          )}
          <div className="user-chip">
            <button className="avatar" style={{ border: 0, cursor: 'pointer' }} title="Change password" onClick={() => setPwd(true)}>{user.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</button>
            <div className="who grow"><b>{user.name}</b><span>{ROLE_LABELS[user.role]}</span></div>
            <button className="btn ghost sm icon" style={{ color: '#94a3b8' }} onClick={logout} title="Sign out" aria-label="Sign out">
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />

      <div className="main">
        {!online && <div className="offline">You are offline. Changes will fail until the connection is back.</div>}
        <header className="topbar">
          <button className="btn ghost icon menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
          <div className="title grow">{current?.label}</div>
          <span className="badge blue hide-sm">{ROLE_LABELS[user.role]}</span>
        </header>
        <main className="content"><Outlet /></main>
      </div>

      <nav className="bottom-nav" aria-label="Quick navigation">
        {bottom.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}><Icon name={n.icon} size={20} />{n.label}</NavLink>
        ))}
        {links.length > 4 && <button onClick={() => setOpen(true)}><Icon name="more" size={20} />More</button>}
      </nav>
      {pwd && <Modal title="Change password" onClose={() => setPwd(false)}><PasswordCard plain /></Modal>}
    </div>
  );
}
