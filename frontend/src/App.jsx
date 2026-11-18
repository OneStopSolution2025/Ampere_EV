import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import JobCards from './pages/JobCards';
import JobCardDetail from './pages/JobCardDetail';
import Billing from './pages/Billing';
import InvoiceForm from './pages/InvoiceForm';
import InvoiceView from './pages/InvoiceView';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Inventory from './pages/Inventory';
import VehicleStock from './pages/VehicleStock';
import Purchases from './pages/Purchases';
import PurchaseForm from './pages/PurchaseForm';
import PurchaseView from './pages/PurchaseView';
import Subdealers, { SubdealerDetail } from './pages/Subdealers';
import Reports from './pages/Reports';
import Activity from './pages/Activity';
import Users from './pages/Users';
import Settings from './pages/Settings';

const STAFF = ['admin', 'manager', 'cashier'];
const INTERNAL = [...STAFF, 'technician'];
const MGMT = ['admin', 'manager'];

function Guard({ roles, children }) {
  const { user } = useAuth();
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="empty" style={{ paddingTop: '40vh' }}>Loading…</div>;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;

  const g = (roles, el) => <Guard roles={roles}>{el}</Guard>;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        {/* Sales & billing */}
        <Route path="vehicle-sales" element={g(STAFF, <Billing key="vehicle" category="vehicle" />)} />
        <Route path="spare-billing" element={g(STAFF, <Billing key="spare" category="spare" />)} />
        <Route path="service-billing" element={g(STAFF, <Billing key="service" category="service" />)} />
        <Route path="billing/new" element={g(STAFF, <InvoiceForm />)} />
        <Route path="billing/:id" element={g([...STAFF, 'subdealer'], <InvoiceView />)} />
        <Route path="billing/:id/edit" element={g(STAFF, <InvoiceForm />)} />
        {/* Workshop */}
        <Route path="jobcards" element={g(INTERNAL, <JobCards />)} />
        <Route path="jobcards/new" element={g(STAFF, <JobCardDetail />)} />
        <Route path="jobcards/:id" element={g(INTERNAL, <JobCardDetail />)} />
        {/* Stock */}
        <Route path="vehicle-stock" element={g(STAFF, <VehicleStock />)} />
        <Route path="inventory" element={g(STAFF, <Inventory />)} />
        <Route path="purchases" element={g(MGMT, <Purchases />)} />
        <Route path="purchases/new" element={g(MGMT, <PurchaseForm />)} />
        <Route path="purchases/:id" element={g(MGMT, <PurchaseView />)} />
        {/* Partners */}
        <Route path="subdealers" element={g(STAFF, <Subdealers />)} />
        <Route path="subdealers/:id" element={g(STAFF, <SubdealerDetail />)} />
        <Route path="customers" element={g(STAFF, <Customers />)} />
        <Route path="customers/:id" element={g(STAFF, <CustomerDetail />)} />
        {/* Sub-dealer portal */}
        <Route path="my-stock" element={g(['subdealer'], <VehicleStock mine />)} />
        <Route path="my-bills" element={g(['subdealer'], <SubdealerDetail portal />)} />
        {/* Control */}
        <Route path="reports" element={g(MGMT, <Reports />)} />
        <Route path="activity" element={g(['admin'], <Activity />)} />
        <Route path="users" element={g(['admin'], <Users />)} />
        <Route path="settings" element={g(['admin'], <Settings />)} />
        <Route path="billing" element={<Navigate to="/service-billing" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
