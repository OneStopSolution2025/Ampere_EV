import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { STATUS_LABEL, STATUS_TONE, titleCase } from '../utils';

/* ---------- Toasts ---------- */
const ToastContext = createContext(() => {});
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

/* ---------- Modal ---------- */
export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost sm icon" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = useState(null);
  const confirm = (message, { title = 'Please confirm', action = 'Confirm', danger = false } = {}) =>
    new Promise((resolve) => setState({ message, title, action, danger, resolve }));
  const close = (v) => { state?.resolve(v); setState(null); };
  const dialog = state && (
    <Modal title={state.title} onClose={() => close(false)}
      footer={<>
        <button className="btn" onClick={() => close(false)}>Go back</button>
        <button className={`btn ${state.danger ? 'danger' : 'primary'}`} onClick={() => close(true)}>{state.action}</button>
      </>}>
      <p style={{ margin: 0 }}>{state.message}</p>
    </Modal>
  );
  return [confirm, dialog];
}

/* ---------- Small pieces ---------- */
export const Badge = ({ status, children, tone }) => (
  <span className={`badge ${tone || STATUS_TONE[status] || 'gray'}`}>{children || STATUS_LABEL[status] || titleCase(status)}</span>
);

export function Stat({ label, value, hint, trend, to }) {
  const Tag = to ? Link : 'div';
  return (
    <Tag className={`card stat ${to ? 'stat-link' : ''}`} to={to}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className={`hint ${trend || ''}`}>{hint}</div>}
    </Tag>
  );
}

export function Empty({ icon = 'file', title = 'Nothing here yet', children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={36} />
      <div style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{title}</div>
      {children && <div className="small" style={{ marginTop: 4 }}>{children}</div>}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…', delay = 300 }) {
  const [v, setV] = useState(value);
  const t = useRef();
  useEffect(() => setV(value), [value]);
  return (
    <div className="search">
      <Icon name="search" size={16} />
      <input className="input" type="search" value={v} placeholder={placeholder} aria-label={placeholder}
        onChange={(e) => { setV(e.target.value); clearTimeout(t.current); const val = e.target.value; t.current = setTimeout(() => onChange(val), delay); }} />
    </div>
  );
}

export function Tabs({ value, onChange, options }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/**
 * Responsive data table. On small screens rows become cards using data-label.
 * columns: [{ key, label, render?, num?, primary?, hideSm? }]
 */
export function DataTable({ columns, rows, onRowClick, empty, loading }) {
  if (loading) return <div className="empty">Loading…</div>;
  if (!rows?.length) return empty || <Empty />;
  return (
    <div className="table-wrap">
      <table className="table responsive">
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={`${c.num ? 'num' : ''} ${c.hideSm ? 'hide-sm' : ''}`}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} className={onRowClick ? 'click' : ''} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.label}
                  className={`${c.num ? 'num' : ''} ${c.primary ? 'primary' : ''} ${c.hideSm ? 'hide-sm' : ''}`}>
                  {c.render ? c.render(r) : r[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ total, offset, limit, onChange }) {
  if (total <= limit) return null;
  return (
    <div className="pager">
      <span className="small muted">{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
      <div className="row">
        <button className="btn sm" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>Previous</button>
        <button className="btn sm" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>Next</button>
      </div>
    </div>
  );
}

export function Field({ label, children, full }) {
  return <label className={`field ${full ? 'full' : ''}`}>{label}{children}</label>;
}
