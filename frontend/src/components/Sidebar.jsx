import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, AlertTriangle, Shield, Brain } from 'lucide-react';
import { useState, useEffect } from 'react';
import { alertsAPI } from '../services/api';

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
        <div className="sidebar-logo-icon">
          <Shield size={22} />
        </div>
        <div className="sidebar-logo-text">
          <h1>CoopTech Tulcán</h1>
          <span>Sistema de Riesgo</span>
        </div>
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
