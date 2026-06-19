# 🏆 Radar Mora — CoopTech Tulcán

<div align="center">

![Ganador DevIAthon](https://img.shields.io/badge/🥇%20GANADOR-CoopTech%20Hackathon%202026-gold?style=for-the-badge&logo=trophy)
![Equipo](https://img.shields.io/badge/Equipo-Toad%20Code-6DB33F?style=for-the-badge&logo=frog&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-18+-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Vercel](https://img.shields.io/badge/Demo-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

**🥇 Proyecto ganador del CoopTech Hackathon 2026 — Equipo Toad Code**

Sistema de **perfilamiento de riesgo crediticio y cobranza preventiva** para la **Cooperativa de Ahorro y Crédito Tulcán**, con predicción de morosidad en tiempo real mediante **Machine Learning (Random Forest)**.

[🚀 Ver Demo en Vivo](https://radar-mora.vercel.app) · [📖 Guía de Instalación](./INSTALACION.md) · [🐛 Reportar Bug](https://github.com/CristopherLomas/Radar-Mora/issues)

## 👨‍💻 Sobre mi participación (Fork Personal)

En la versión original de este proyecto colaborativo, mi rol principal se centró en:
* **Desarrollo del Frontend:** Estructuración de las interfaces de usuario (React/Vite) y garantía del diseño responsivo para dispositivos móviles.
* **Control de Calidad (QA):** Depuración de código y corrección de errores para asegurar la estabilidad.

**Objetivo de este repositorio:**
He creado esta copia como mi entorno de desarrollo individual. Mis metas aquí son refactorizar mi código del Frontend, y experimentar con nuevas integraciones independientes para expandir mi portafolio profesional.
</div>

---

## ✨ ¿Qué hace Radar Mora?

Radar Mora es una plataforma integral que permite a los asesores financieros de la cooperativa:

- 📊 **Visualizar el riesgo** de toda la cartera crediticia en tiempo real (29,821 socios · $408.6M)
- 🤖 **Predecir la morosidad** con un modelo Random Forest entrenado con datos reales SEPS
- 🔔 **Detectar alertas tempranas** de desvíos conductuales (saldos críticos, retiros inusuales)
- 📞 **Gestionar la cobranza preventiva** de socios con cuotas próximas a vencer (ventana 15 días)
- 📈 **Analizar la cartera** por agencia, tipo de crédito, zona geográfica y actividad económica

---

## 🏅 Reconocimiento — CoopTech Hackathon 2026

> Este proyecto fue desarrollado por el equipo **🐸 Toad Code** para el **CoopTech Hackathon 2026** organizado por la **Cooperativa de Ahorro y Crédito Tulcán**, resultando **ganador** de la competencia entre los equipos participantes.

### Métricas del Sistema (Producción)

| Indicador | Valor |
|---|---|
| Socios Activos | 29,821 |
| Créditos en Cartera | 32,088 |
| Cartera Total | $408.6M |
| Tasa de Morosidad (SEPS) | 21.4% |
| Exposición en Riesgo | $80.4M |
| Precisión del Modelo ML | **95.24%** |
| Cuotas Preventivas Monitoreadas | 571 / 15 días |

---

## 🖥️ Demo en Vivo

Accede a la versión pública del dashboard en:

**👉 [https://radar-mora.vercel.app](https://radar-mora.vercel.app)**

> La demo corre en **Modo Presentación** con datos de alta fidelidad para que puedas explorar todas las funcionalidades sin necesidad de levantar el backend.

---

## 🚀 Instalación Local (con datos reales)

Consulta la guía completa en [INSTALACION.md](./INSTALACION.md).

**Resumen rápido:**

```bash
# 1. Clonar el repositorio
git clone https://github.com/CristopherLomas/Radar-Mora.git
cd Radar-Mora

# 2. Levantar el backend (primera vez: genera DB y entrena el modelo)
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux
pip install -r requirements.txt
python start.py

# 3. En otra terminal, levantar el frontend
cd frontend
npm install
npm run dev
```

Abre: **http://localhost:5173**

---

## 📁 Estructura del Proyecto

```text
Radar-Mora/
├── backend/
│   ├── main.py                 # API FastAPI
│   ├── database.py             # SQLite / helpers
│   ├── start.py                # Inicialización: DB + modelo + servidor
│   ├── models/
│   │   ├── risk_model.py       # 🤖 Modelo Random Forest de riesgo
│   │   └── data_generator.py   # Generador de datos sintéticos
│   └── routes/
│       ├── dashboard.py        # Endpoints del panel principal
│       ├── socios.py           # Perfil y listado de socios
│       └── alerts.py           # Alertas + Cobranza Preventiva
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── Dashboard.jsx               # Panel de riesgo
    │   │   ├── AlertsPanel.jsx             # Radar de alertas + Cobranza
    │   │   ├── SocioProfile.jsx            # Perfil individual del socio
    │   │   └── DashboardExtendedStats.jsx  # Estadísticas avanzadas
    │   └── services/api.js     # Cliente API con modo offline/demo
    └── vercel.json             # Configuración de despliegue
```

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|---|---|
| **Frontend** | React 18 · Vite · Recharts · React Router |
| **Backend** | Python · FastAPI · Uvicorn |
| **Base de Datos** | SQLite (local) |
| **Machine Learning** | Scikit-learn · Random Forest · Joblib |
| **Datos** | Pandas · NumPy |
| **Despliegue** | Vercel (frontend) |

---

## 📜 Licencia

Proyecto desarrollado para la **Cooperativa de Ahorro y Crédito Tulcán** como parte del CoopTech Hackathon 2026. Todos los derechos reservados.

---

<div align="center">

Hecho con ❤️ por el equipo **🐸 Toad Code** · CoopTech Hackathon 2026 🏆

</div>
