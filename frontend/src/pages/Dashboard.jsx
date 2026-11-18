import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import Icon from '../components/Icon';
import { Badge, Empty, Stat } from '../components/ui';
import { ROLE_LABELS } from '../permissions';
import { fmtDate, fmtDateTime, modeLabel, money, money0, n2, titleCase } from '../utils';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const CAT_COLORS = { vehicle: '#2563eb', spare: '#0ea5e9', service: '#10b981' };
const CAT_LABEL = { vehicle: 'Vehicles', spare: 'Spares', service: 'Service' };

function Section({ title, hint, to, children }) {
  return (
    <>
      <div className="section-title"><h2>{title}</h2>{hint && <span>{hint}</span>}{to && <Link to={to} className="small" style={{ marginLeft: 'auto' }}>Open →</Link>}</div>
      {children}
    </>
  );
}

function StackedBars({ series }) {
  const max = Math.max(...series.map((s) => s.total), 1);
  return (
    <>
      <div className="bars">
        {series.map((s) => (
          <div key={s.date} className="bar" title={`${fmtDate(s.date)}: ${money(s.total)}`}>
            <div className="stack-bar" style={{ height: `${(s.total / max) * 100}%` }}>
              {['vehicle', 'spare', 'service'].map((c) => s[c] > 0 && <i key={c} style={{ height: `${(s[c] / s.total) * 100}%`, background: CAT_COLORS[c] }} />)}
            </div>
            <span>{new Date(`${s.date}T00:00:00`).getDate()}</span>
          </div>
        ))}
      </div>
      <div className="row small muted" style={{ gap: 16, marginTop: 8 }}>
        {Object.entries(CAT_LABEL).map(([k, v]) => <span key={k} className="row" style={{ gap: 6 }}><i className="cat-dot" style={{ background: CAT_COLORS[k] }} />{v}</span>)}
      </div>
    </>
  );
}

const catHint = (o) => ['vehicle', 'spare', 'service'].map((c) => `${CAT_LABEL[c]} ${money0(o[c])}`).join(' · ');

function JobList({ rows, empty, cta }) {
  if (!rows.length) return <Empty icon="wrench" title={empty} />;
  return rows.map((j) => (
    <Link key={j.id} to={`/jobcards/${j.id}`} className="list-row">
      <div>
        <b>{j.vehicle_reg}</b> <span className="muted small">{j.vehicle_name}</span>
        <div className="small muted">{j.number} · {j.customer_name}{j.estimated_delivery ? ` · Due ${fmtDate(j.estimated_delivery)}` : ''}</div>
      </div>
      {cta ? <span className="btn sm primary">{cta}</span> : <Badge status={j.status} />}
    </Link>
  ));
}

function DueList({ rows }) {
  if (!rows.length) return <Empty icon="check" title="No pending payments" />;
  return rows.map((i) => (
    <Link key={i.id} to={`/billing/${i.id}`} className="list-row">
      <div><b>{i.customer_name}</b>{i.is_subdealer && <span className="badge amber" style={{ marginLeft: 6 }}>Sub-dealer</span>}<div className="small muted">{i.number} · {fmtDate(i.date)}</div></div>
      <div className="right"><b className="mono">{money(i.balance)}</b><div><Badge status={i.status} /></div></div>
    </Link>
  ));
}

function QuickActions({ mgmt }) {
  return (
    <div className="row">
      <Link to="/jobcards/new" className="btn"><Icon name="clipboard" size={16} />Job card</Link>
      <Link to="/billing/new?category=spare" className="btn"><Icon name="receipt" size={16} />Spare bill</Link>
      {mgmt && <Link to="/purchases/new" className="btn"><Icon name="truck" size={16} />Purchase</Link>}
      <Link to="/billing/new?category=vehicle" className="btn primary"><Icon name="bolt" size={16} />Sell vehicle</Link>
    </div>
  );
}

/* ---------------- Technician ---------------- */
function TechnicianDashboard({ d, user }) {
  const c = d.counts;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>{greeting()}, {user.name.split(' ')[0]}</h1><p>Your workshop queue.</p></div></div>
      <div className="grid g4">
        <Stat label="Waiting to start" value={c.open || 0} />
        <Stat label="In progress" value={c.in_progress || 0} />
        <Stat label="Completed this month" value={d.completed_this_month} />
        <Stat label="Total assigned" value={Object.values(c).reduce((a, b) => a + b, 0)} />
      </div>
      <div className="card">
        <div className="card-head"><h2>My active jobs</h2><Link to="/jobcards" className="small">View all</Link></div>
        <JobList rows={d.queue} empty="No jobs assigned right now" />
      </div>
    </div>
  );
}

/* ---------------- Sub-dealer portal ---------------- */
function SubdealerDashboard({ d, user }) {
  const s = d.subdealer;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>{greeting()}, {user.name.split(' ')[0]}</h1><p>{s.name} · your account with us</p></div>
        <Link to="/my-stock" className="btn primary"><Icon name="scooter" size={16} />My vehicles</Link></div>
      <div className="grid g4">
        <Stat label="Vehicles in stock" value={s.vehicles_holding} to="/my-stock" hint="Mark each one sold on delivery" />
        <Stat label="Retailed this month" value={s.retailed_this_month} />
        <Stat label="Amount due" value={money0(s.outstanding)} to="/my-bills" hint={s.outstanding > 0 ? `Oldest unpaid bill ${s.oldest_due_days} days` : 'All settled'} trend={s.oldest_due_days > 30 ? 'down' : ''} />
        <Stat label="Credit available" value={s.credit_limit ? money0(s.credit_available) : 'No limit'} hint={s.credit_limit ? `Limit ${money0(s.credit_limit)}` : ''} />
      </div>
      <div className="grid g2">
        <div className="card">
          <div className="card-head"><h2>Vehicles awaiting sale</h2><Link to="/my-stock" className="small">Manage</Link></div>
          {d.holding.length ? d.holding.slice(0, 8).map((u) => (
            <Link key={u.id} to="/my-stock" className="list-row">
              <div><b>{u.model}</b> <span className="muted">· {u.color || '—'}</span><div className="small muted mono">{u.chassis_no}</div></div>
              <span className="small muted">{u.age_days} days</span>
            </Link>
          )) : <Empty icon="scooter" title="No vehicles in stock" />}
        </div>
        <div className="card">
          <div className="card-head"><h2>Recent bills</h2><Link to="/my-bills" className="small">Ledger</Link></div>
          <DueList rows={d.recent_invoices} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Billing executive ---------------- */
function CashierDashboard({ d, user }) {
  return (
    <div className="stack">
      <div className="page-head"><div><h1>{greeting()}, {user.name.split(' ')[0]}</h1><p>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div><QuickActions /></div>
      <div className="grid g4">
        <Stat label="Today's sales" value={money0(d.today.total)} hint={`${d.today_bills} bills`} />
        <Stat label="Collected today" value={money0(d.today_collected)} hint={Object.entries(d.today_collections).map(([m, a]) => `${modeLabel(m)} ${money0(a)}`).join(' · ') || 'No payments yet'} />
        <Stat label="Ready to bill" value={d.jobcards.completed || 0} hint="Completed job cards" to="/jobcards" />
        <Stat label="Receivables" value={money0(d.receivables.total)} />
      </div>
      <div className="grid g3">
        <Stat label="Vehicle sales today" value={money0(d.today.vehicle)} to="/vehicle-sales" />
        <Stat label="Spare sales today" value={money0(d.today.spare)} to="/spare-billing" />
        <Stat label="Service billing today" value={money0(d.today.service)} to="/service-billing" />
      </div>
      <div className="grid g3">
        <div className="card"><div className="card-head"><h2>Ready to bill</h2></div><JobList rows={d.ready_to_bill} empty="No completed jobs waiting" cta="Bill" /></div>
        <div className="card"><div className="card-head"><h2>Pending payments</h2></div><DueList rows={d.due_invoices} /></div>
        <div className="card"><div className="card-head"><h2>Vehicles available</h2><Link to="/vehicle-stock" className="small">Stock</Link></div>
          {d.vehicles_available.map((v) => <div key={v.model} className="list-row"><span>{v.model}</span><b>{v.stock}</b></div>)}</div>
      </div>
    </div>
  );
}

/* ---------------- Admin & manager: complete view ---------------- */
function OverviewDashboard({ d, user }) {
  const vs = d.vehicle_stock;
  const jc = d.jobcards;
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>{greeting()}, {user.name.split(' ')[0]}</h1><p>{user.role === 'admin' ? 'Complete view of sales, stock, purchases, workshop and sub-dealers.' : 'Business overview'}</p></div>
        <QuickActions mgmt />
      </div>

      <div className="grid g4">
        <Stat label="Today's sales" value={money0(d.today.total)} hint={`${d.today_bills} bills · collected ${money0(d.today_collected)}`} />
        <Stat label="This month" value={money0(d.month.total)} trend={d.month_growth === null ? '' : d.month_growth >= 0 ? 'up' : 'down'}
          hint={d.month_growth === null ? 'No sales last month to compare' : `${d.month_growth >= 0 ? '▲' : '▼'} ${Math.abs(d.month_growth)}% vs same period last month`} />
        <Stat label="Receivables" value={money0(d.receivables.total)} hint={`Customers ${money0(d.receivables.customers)} · Sub-dealers ${money0(d.receivables.subdealers)}`} to="/reports?tab=receivables" />
        <Stat label="Payable to suppliers" value={money0(d.payables)} hint={`Purchased ${money0(d.month_purchases)} this month`} to="/purchases" />
      </div>

      <div className="grid g3">
        <div className="card card-pad span2">
          <div className="between" style={{ marginBottom: 8 }}><h2>Sales · last 14 days</h2><span className="small muted">{money0(d.series.reduce((a, s) => a + s.total, 0))}</span></div>
          <StackedBars series={d.series} />
        </div>
        <div className="card card-pad stack" style={{ gap: 14 }}>
          <h2>Month by business line</h2>
          {['vehicle', 'spare', 'service'].map((c) => (
            <div key={c}>
              <div className="between small"><span className="row" style={{ gap: 6 }}><i className="cat-dot" style={{ background: CAT_COLORS[c] }} />{CAT_LABEL[c]}</span><b className="mono">{money0(d.month[c])}</b></div>
              <div className="meter" style={{ marginTop: 6 }}><i style={{ width: `${(d.month[c] / (d.month.total || 1)) * 100}%`, background: CAT_COLORS[c] }} /></div>
            </div>
          ))}
          <div className="small muted">Today: {catHint(d.today)}</div>
        </div>
      </div>

      <Section title="Vehicle stock" hint={`${vs.in_stock} in showroom · ${money0(vs.stock_value)}`} to="/vehicle-stock">
        <div className="grid g4">
          <Stat label="In showroom" value={vs.in_stock} to="/vehicle-stock" />
          <Stat label="With sub-dealers" value={vs.with_subdealer} to="/subdealers" />
          <Stat label="Sold this month" value={vs.sold_this_month} />
          <Stat label="Ageing over 60 days" value={vs.aged_60} trend={vs.aged_60 ? 'down' : ''} hint={vs.aged_60 ? 'Needs attention' : 'Healthy'} />
        </div>
        <div className="card">
          {vs.by_model.map((m) => (
            <div key={m.item_id} className="list-row">
              <span><b>{m.model}</b> <span className="small muted">· {money0(m.price)}</span></span>
              <span className="row small" style={{ gap: 14 }}>
                <span>Showroom {m.low ? <Badge tone="red">{m.in_stock}</Badge> : <b>{m.in_stock}</b>}</span>
                <span className="hide-sm">Sub-dealers <b>{m.with_subdealer}</b></span>
                <span>Sold <b>{m.sold_this_month}</b></span>
              </span>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid g2">
        <div className="stack">
          <Section title="Spares" hint={`${d.spares.items} items · ${money0(d.spares.value)} at cost`} to="/inventory">
            <div className="grid g2">
              <Stat label="Spare sales (month)" value={money0(d.month.spare)} to="/spare-billing" />
              <Stat label="Below reorder level" value={d.spares.low} trend={d.spares.low ? 'down' : ''} hint={d.spares.low ? 'Reorder soon' : 'All stocked'} to="/inventory?low=1" />
            </div>
            <div className="card">
              <div className="card-head"><h3>Top spares this month</h3></div>
              {d.spares.top.length ? d.spares.top.map((t) => <div key={t.name} className="list-row"><span>{t.name}<span className="small muted"> · {n2(t.qty)}</span></span><b className="mono">{money0(t.total)}</b></div>)
                : <Empty icon="box" title="No spare sales yet" />}
            </div>
          </Section>
        </div>
        <div className="stack">
          <Section title="Workshop" hint={`Service ${money0(d.month.service)} this month`} to="/jobcards">
            <div className="grid g2">
              <Stat label="Open / in progress" value={(jc.open || 0) + (jc.in_progress || 0)} to="/jobcards" />
              <Stat label="Ready to bill" value={jc.completed || 0} to="/jobcards" />
            </div>
            <div className="card">
              <div className="card-head"><h3>Technician workload</h3></div>
              {d.technician_load.length ? d.technician_load.map((t) => <div key={t.name} className="list-row"><span>{t.name}</span><span className="badge blue">{t.active} active</span></div>)
                : <Empty icon="users" title="No active assignments" />}
            </div>
          </Section>
        </div>
      </div>

      <Section title="Sub-dealers" hint={`Outstanding ${money0(d.receivables.subdealers)}`} to="/subdealers">
        <div className="card">
          {d.subdealers.length ? d.subdealers.map((s) => (
            <Link key={s.id} to={`/subdealers/${s.id}`} className="list-row">
              <div><b>{s.name}</b><div className="small muted">{s.vehicles_holding} vehicles holding · {s.retailed_this_month} retailed this month</div></div>
              <div className="right"><b className="mono">{money0(s.outstanding)}</b>
                <div className="small" style={{ color: s.credit_limit && s.credit_available < 0 ? 'var(--red)' : 'var(--muted)' }}>{s.credit_limit ? `Credit left ${money0(s.credit_available)}` : 'No limit'}</div></div>
            </Link>
          )) : <Empty icon="store" title="No sub-dealers yet" />}
        </div>
      </Section>

      <div className="grid g2">
        <div className="card"><div className="card-head"><h2>Ready to bill</h2></div><JobList rows={d.ready_to_bill} empty="No completed jobs waiting" cta="Bill" /></div>
        <div className="card"><div className="card-head"><h2>Pending payments</h2></div><DueList rows={d.due_invoices} /></div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-head"><h2>Recent invoices</h2></div>
          {d.recent_invoices.length ? d.recent_invoices.map((i) => (
            <Link key={i.id} to={`/billing/${i.id}`} className="list-row">
              <div><b>{i.number}</b> <span className="small muted">· {CAT_LABEL[i.category]}</span><div className="small muted">{i.customer_name}</div></div>
              <div className="right"><b className="mono">{money0(i.total)}</b><div><Badge status={i.status} /></div></div>
            </Link>
          )) : <Empty icon="receipt" title="No invoices yet" />}
        </div>
        <div className="card">
          <div className="card-head"><h2>Recent purchases</h2><Link to="/purchases" className="small">All</Link></div>
          {d.recent_purchases.length ? d.recent_purchases.map((p) => (
            <Link key={p.id} to={`/purchases/${p.id}`} className="list-row">
              <div><b>{p.supplier_name}</b><div className="small muted">{p.number} · {fmtDate(p.date)}{p.vehicles ? ` · ${p.vehicles} vehicles` : ''}</div></div>
              <div className="right"><b className="mono">{money0(p.total)}</b><div><Badge status={p.status} /></div></div>
            </Link>
          )) : <Empty icon="truck" title="No purchases yet" />}
        </div>
      </div>

      {user.role === 'admin' && d.recent_activity && (
        <div className="grid g3">
          <div className="card span2">
            <div className="card-head"><h2>Latest activity</h2><Link to="/activity" className="small">Full log</Link></div>
            {d.recent_activity.map((a) => (
              <div key={a.id} className="list-row">
                <div><b>{a.user_name}</b> <span className="muted">{titleCase(a.action.replace('-', ' ')).toLowerCase()} {a.entity}</span><div className="small muted">{a.detail}</div></div>
                <span className="small muted nowrap">{fmtDateTime(a.created_at)}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-head"><h2>Team</h2><Link to="/users" className="small">Manage</Link></div>
            {Object.entries(d.users).map(([r, c]) => <div key={r} className="list-row"><span>{ROLE_LABELS[r] || r}</span><b>{c}</b></div>)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/dashboard').then(setD).catch((e) => setError(e.message)); }, []);
  if (error) return <Empty icon="alert" title="Could not load dashboard">{error}</Empty>;
  if (!d) return <div className="empty">Loading…</div>;
  if (d.role === 'technician') return <TechnicianDashboard d={d} user={user} />;
  if (d.role === 'subdealer') return <SubdealerDashboard d={d} user={user} />;
  if (d.role === 'cashier') return <CashierDashboard d={d} user={user} />;
  return <OverviewDashboard d={d} user={user} />;
}
