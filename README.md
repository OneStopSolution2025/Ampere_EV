# Ampere EV — Sales & Service Billing (PWA)

GST-ready billing, job cards, inventory and reports for Ampere EV sales and service.
Runs on desktop, tablet and phone, and installs like a native app.

**Stack:** FastAPI · SQLAlchemy 2 · PostgreSQL (SQLite for local) · React 18 · Vite · vite-plugin-pwa

---

## Features

| Module | What it does |
|---|---|
| **Vehicle Stock** | Chassis-wise stock (chassis, motor, battery, charger, colour). Status: In showroom → With sub-dealer → Sold. Model-wise position, ageing (60+ days), stock value at cost, opening-stock entry, full unit history (purchase → invoice → retail). |
| **Purchases** | Supplier bills from the OEM / vendors. Vehicles entered by chassis, spares by quantity. Stock and cost prices update on save. Supplier payments, payables, duplicate-bill and duplicate-chassis protection, cancellation with stock reversal. |
| **Vehicle Sales** | Invoices (series `VS/`) and quotations. Pick vehicles from showroom stock by chassis; add accessories. Bill to a retail customer (vehicle auto-added to their profile for service) or a sub-dealer (vehicle moves to their stock). |
| **Spare Billing** | Counter sale of parts (series `SP/`) to customers or sub-dealers, with live stock deduction. |
| **Service Billing** | Workshop bills (series `SV/`) from job cards or direct, parts + labour, vehicle required. |
| **Job Cards** | Check-in with complaints, battery charge, odometer, delivery date, technician assignment and status flow. Bill in one step. |
| **Sub-dealers** | Master records, credit limits (enforced; admin can override), stock they hold, retail reporting, invoices, running ledger with closing balance. Optional sub-dealer portal login. |
| **Customers** | Multiple vehicles, search by name, phone, registration or chassis, lifetime value, outstanding, service history. |
| **Reports** | Sales by business line, vehicle sales with margin per chassis/model, purchase register with input tax, GST rate-wise and HSN summary, receivables ageing (customers and sub-dealers), spares valuation, technician productivity. CSV export everywhere. |
| **Activity Log** | Every sign-in, bill, edit, cancellation, payment, stock change and credit change with user and timestamp (admin only). |
| **PWA** | Installable on desktop and mobile, responsive down to 360 px, offline app shell. |

### Dashboards by role
- **Administrator / Manager** — one page covering today and month sales by business line, 14-day trend, receivables (customer vs sub-dealer), supplier payables, vehicle stock by model, spares, workshop, sub-dealer exposure, recent invoices and purchases. Administrators also see the latest activity and team.
- **Billing Executive** — today's sales by line, collections by mode, jobs ready to bill, pending payments, vehicles available.
- **Technician** — own job queue only.
- **Sub-dealer** — vehicles in stock, retailed this month, amount due, credit available, bills and ledger.

### Permission matrix

| Capability | Admin | Manager | Billing Exec. | Technician | Sub-dealer |
|---|:-:|:-:|:-:|:-:|:-:|
| Vehicle / spare / service billing | ✓ | ✓ | ✓ | — | View own bills |
| Edit invoice after payment | ✓ | — | — | — | — |
| Cancel invoices | ✓ | ✓ | — | — | — |
| Delete customer / supplier payments | ✓ | — | — | — | — |
| Exceed sub-dealer credit limit | ✓ | — | — | — | — |
| Change credit limits | ✓ | — | — | — | — |
| Purchases & suppliers | ✓ | ✓ | — | — | — |
| Vehicle models, spares catalogue, stock adjustments | ✓ | ✓ | View | — | — |
| Delete manually-added vehicles | ✓ | — | — | — | — |
| Sub-dealer master | ✓ | ✓ | View | — | — |
| Mark sub-dealer vehicle retailed | ✓ | ✓ | — | — | Own stock |
| Job cards | All | All | All | Assigned only | — |
| Reports | ✓ | ✓ | — | — | — |
| Activity log, users, settings | ✓ | — | — | — | — |

## Run locally

**Backend**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # optional; defaults work
export SEED_DEMO=1              # demo users, parts and a sample customer
uvicorn app.main:app --reload --port 8000
```
API docs: http://localhost:8000/docs

**Frontend**
```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173 (proxies /api to :8000)
```

### Default logins
| Role | Email | Password |
|---|---|---|
| Admin | admin@ampereev.local | Admin@123 |
| Manager* | manager@ampereev.local | Demo@123 |
| Cashier* | cashier@ampereev.local | Demo@123 |
| Technician* | tech@ampereev.local | Demo@123 |
| Sub-dealer* | subdealer@ampereev.local | Demo@123 |

\* Created only when `SEED_DEMO=1`. Change the admin password after first login (click your avatar).

---

## Deploy to Railway (single service)

1. Push this folder to GitHub and create a Railway project from the repo. The `Dockerfile` builds the PWA and serves it from FastAPI.
2. Add a **PostgreSQL** plugin. Railway sets `DATABASE_URL` automatically.
3. Set variables:
   - `SECRET_KEY` — a long random string
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` — first admin account
   - `SEED_DEMO=0` for production
   - `CORS_ORIGINS` — only needed if the frontend is hosted on a different domain
4. Deploy. Health check: `/api/health`.

Tables are created on first start. For schema changes in later versions, add Alembic migrations.

### Hosting the frontend separately (optional)
Build with `VITE_API_URL=https://your-api.example.com/api npm run build`, deploy `frontend/dist` to any static host with SPA fallback, and set `CORS_ORIGINS` on the API.

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./autobill.db` | Postgres or SQLite URL |
| `SECRET_KEY` | — | JWT signing key (**set in production**) |
| `TOKEN_HOURS` | `12` | Session length |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@ampereev.local` / `Admin@123` | Created on first run |
| `SEED_DEMO` | `0` | Seed demo users, EV models with chassis stock, spares, a supplier and a sub-dealer |
| `CORS_ORIGINS` | `*` | Comma-separated origins |
| `STATIC_DIR` | `../frontend/dist` | Built PWA location |

---

## Project structure
```
backend/app
  main.py          App, routers, SPA hosting
  models.py        Users, business, customers, vehicles, items, stock moves, job cards, invoices, payments
  services.py      GST maths, FY numbering, stock movements, status
  security.py      bcrypt, JWT, role guards
  routers/         auth, users, customers, items, vehicle_stock, purchases, subdealers, jobcards,
                   invoices, dashboard, reports, activity, settings
frontend/src
  pages/           Dashboard, Billing, InvoiceForm, InvoiceView, VehicleStock, Purchases, PurchaseForm,
                   PurchaseView, Subdealers, JobCards, JobCardDetail, Customers, CustomerDetail,
                   Inventory, Reports, Activity, Users, Settings, Login
  components/      Layout, ui kit, pickers & line-item editor, icons
  permissions.js   Role → navigation and UI permissions
```

## GST notes
- Rates are entered exclusive of GST; tax is calculated per line after discount.
- Intra-state supplies split tax 50/50 into CGST and SGST; inter-state uses IGST. This is set automatically by comparing the customer's state to the business state, and can be overridden per bill.
- Common SAC for vehicle repair and maintenance: **998714**.
- Demo GST rates and HSN codes are placeholders. Confirm them with the client's accountant before go-live.
- Each business line has its own invoice series, which GST rules permit. Prefixes are set in Settings.
