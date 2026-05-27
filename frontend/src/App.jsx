import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, AlertTriangle, Shield } from 'lucide-react';
import AppHeader from './components/AppHeader';
import Dashboard from './components/Dashboard';
import SociosList from './components/SociosList';
import SocioProfile from './components/SocioProfile';
import AlertsPanel from './components/AlertsPanel';
import PreventiveCollectionPanel from './components/PreventiveCollectionPanel';
import ApiOfflineBanner from './components/ApiOfflineBanner';
import { checkApiHealth, alertsAPI, getColaSemanal, getPreventiveTotal } from './services/api';

/** Barra de navegación inferior para móvil */
function MobileBottomNav() {
  const location = useLocation();
  const [alertCount, setAlertCount] = useState(0);
  const [preventiveCount, setPreventiveCount] = useState(0);

  useEffect(() => {
    alertsAPI.getAll()
      .then((data) => setAlertCount(getColaSemanal(data)))
      .catch(() => setAlertCount(0));
    alertsAPI.getPreventiveSummary()
      .then((data) => setPreventiveCount(getPreventiveTotal(data)))
      .catch(() => setPreventiveCount(0));
  }, [location.pathname]);

  return (
    <nav className="mobile-bottom-nav">
      <NavLink to="/" end className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
        <LayoutDashboard size={22} />
        <span className="mobile-nav-label">Riesgo</span>
      </NavLink>

      <NavLink to="/cobranza-preventiva" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
        <Shield size={22} />
        {preventiveCount > 0 && (
          <span className="mobile-nav-badge">{preventiveCount > 99 ? '99+' : preventiveCount}</span>
        )}
        <span className="mobile-nav-label">Cobranza</span>
      </NavLink>

      <NavLink to="/socios" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
        <Users size={22} />
        <span className="mobile-nav-label">Socios</span>
      </NavLink>

      <NavLink to="/alertas" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
        <AlertTriangle size={22} />
        {alertCount > 0 && (
          <span className="mobile-nav-badge">{alertCount > 99 ? '99+' : alertCount}</span>
        )}
        <span className="mobile-nav-label">Alertas</span>
      </NavLink>
    </nav>
  );
}

function App() {
  const [apiOk, setApiOk] = useState(null);

  useEffect(() => {
    const probe = () =>
      checkApiHealth()
        .then(() => setApiOk(true))
        .catch(() => setApiOk(false));
    probe();
    const id = setInterval(probe, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <Router>
      <div className="app-shell">
        <AppHeader />
        <main className="main-content">
          {apiOk === false && <ApiOfflineBanner />}
          {apiOk === null && (
            <div className="loading-container" style={{ minHeight: 120 }}>
              <div className="spinner" />
              <div className="loading-text">Comprobando conexión con el servidor...</div>
            </div>
          )}
          {apiOk !== false && (
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/socios" element={<SociosList />} />
              <Route path="/socios/:id" element={<SocioProfile />} />
              <Route path="/alertas" element={<AlertsPanel />} />
              <Route path="/cobranza-preventiva" element={<PreventiveCollectionPanel />} />
            </Routes>
          )}
        </main>
        {/* Bottom nav solo visible en móvil (CSS lo oculta en desktop) */}
        <MobileBottomNav />
      </div>
    </Router>
  );
}

export default App;
