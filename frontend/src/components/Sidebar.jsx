import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, AlertTriangle, Brain } from 'lucide-react';
import { useState, useEffect } from 'react';
import { alertsAPI } from '../services/api';
import { BrandLockup } from './BrandLogo';

export default function Sidebar() {
  const location = useLocation();
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    alertsAPI.getAll()
      .then(data => {
        const alerts = Array.isArray(data) ? data : (data.alerts || []);
        const high = alerts.filter(a => a.prioridad === 'alta' || a.prioridad === 'critica').length;
        setAlertCount(high);
      })
      .catch(() => {});
  }, [location.pathname]);

  const links = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/socios', icon: Users, label: 'Socios' },
    { to: '/alertas', icon: AlertTriangle, label: 'Alertas', badge: alertCount },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <BrandLockup variant="sidebar" />
      </div>

      <div className="sidebar-divider" />

      <nav className="sidebar-nav">
        {links.map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <link.icon size={20} />
            <span>{link.label}</span>
            {link.badge > 0 && <span className="sidebar-badge">{link.badge}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-footer-text">
          <div>Perfilamiento Inteligente</div>
          <div className="ai-badge">
            <Brain size={12} />
            Powered by IA
          </div>
        </div>
      </div>
    </aside>
  );
}
