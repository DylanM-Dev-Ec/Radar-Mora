import { NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { LayoutDashboard, Users, AlertTriangle, Shield } from 'lucide-react';
import { BrandLockup } from './BrandLogo';
import { alertsAPI, getColaSemanal, getPreventiveTotal } from '../services/api';

export default function AppHeader() {
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
    <header className="app-header">
      <div className="app-header-top">
        <BrandLockup variant="header" />
      </div>

      <nav className="app-header-nav">
        <NavLink to="/" end className={({ isActive }) => `header-nav-link ${isActive ? 'active' : ''}`}>
          <LayoutDashboard size={18} />
          Panel de Riesgo
        </NavLink>
        <NavLink to="/cobranza-preventiva" className={({ isActive }) => `header-nav-link ${isActive ? 'active' : ''}`}>
          <Shield size={18} />
          Cobranza Preventiva
          {preventiveCount > 0 && (
            <span className="header-nav-badge" title="Casos en ventana preventiva">
              {preventiveCount.toLocaleString('es-EC')}
            </span>
          )}
        </NavLink>
        <NavLink to="/socios" className={({ isActive }) => `header-nav-link ${isActive ? 'active' : ''}`}>
          <Users size={18} />
          Perfil del Socio
        </NavLink>
        <NavLink to="/alertas" className={({ isActive }) => `header-nav-link ${isActive ? 'active' : ''}`}>
          <AlertTriangle size={18} />
          Alertas
          {alertCount > 0 && (
            <span className="header-nav-badge" title="Cola semanal operativa">
              {alertCount.toLocaleString('es-EC')}
            </span>
          )}
        </NavLink>
      </nav>
    </header>
  );
}
