# 🏦 Radar Mora — CoopTech Tulcán

Sistema de perfilamiento de riesgo crediticio y cobranza preventiva para la **Cooperativa de Ahorro y Crédito Tulcán**, con predicción de morosidad mediante Machine Learning.

Puede ejecutarse **en local** (SQLite + FastAPI + React) o en **modo presentación** para demo sin backend.

---

## 📁 Estructura del proyecto

```text
cooptech-deviaton/
├── backend/
│   ├── main.py                 # API FastAPI
│   ├── database.py             # SQLite / helpers
│   ├── start.py                # DB + modelo + servidor
│   ├── models/
│   │   ├── risk_model.py       # Modelo de riesgo
│   │   ├── preventive_cache.py # Cola cobranza preventiva
│   │   └── cobranza_priority.py
│   └── routes/
│       ├── dashboard.py
│       ├── socios.py
│       └── alerts.py
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── Dashboard.jsx
    │   │   ├── PreventiveCollectionPanel.jsx
    │   │   ├── SocioProfile.jsx
    │   │   └── RiskGauge.jsx
    │   └── services/api.js
    └── vercel.json
```

---

## 🏆 Modo presentación (hackathon)

Sin depender del backend en vivo:

```bash
cd frontend
npm run dev:pitch
```

Abre **http://localhost:5173/** — guion en [`docs/HACKATHON_PITCH.md`](docs/HACKATHON_PITCH.md).

---

## 🚀 Inicio rápido (local)

### Backend

```bash
cd backend
pip install -r requirements.txt
python start.py
```

API: **http://localhost:8000** · Docs: **http://localhost:8000/docs**

### Frontend

```bash
cd frontend
npm install
npm run dev
```

UI: **http://localhost:5173**

---

## 💡 Demo sugerida

1. **Panel de riesgo** — distribución alto/crítico y cola semanal.
2. **Cobranza preventiva** — cuotas que vencen en 3–15 días desde la fecha de corte.
3. **Perfil del socio** — score, factores explicables y panel de reestructuración (alto/crítico).

---

## 🔗 Repositorio

[GitHub — Radar-Mora](https://github.com/CristopherLomas/Radar-Mora)
