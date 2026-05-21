# 🏦 CoopTech Tulcán - Sistema de Riesgo Crediticio e IA de Alertas Tempranas

¡Bienvenido al proyecto de la hackathon! Este repositorio contiene la implementación completa para la **Cooperativa de Ahorro y Crédito Tulcán**, diseñada para perfilar el comportamiento transaccional y predecir el riesgo de morosidad mediante Inteligencia Artificial (Machine Learning).

El proyecto está diseñado para funcionar de manera **100% autónoma y local**, garantizando estabilidad y velocidad durante la presentación y demo en vivo frente al jurado.

---

## 📁 Estructura General del Proyecto

El código está organizado de manera limpia y modular en dos directorios principales:

```text
cooptech-deviaton/
├── backend/                    # Motor de IA y API (Python)
│   ├── main.py                 # Punto de entrada de la API FastAPI y CORS
│   ├── database.py             # Helpers de base de datos SQLite y esquemas
│   ├── start.py                # Script de inicio automatizado (Base de datos + ML + Servidor)
│   ├── requirements.txt        # Dependencias de Python
│   ├── models/
│   │   ├── data_generator.py   # Generador inteligente de datos sintéticos realistas ecuatorianos
│   │   └── risk_model.py       # Modelo de Machine Learning (Random Forest de Scikit-learn)
│   └── routes/
│       ├── dashboard.py        # Endpoints para métricas generales y gráficos
│       ├── socios.py           # Gestión y perfilamiento detallado de los socios
│       └── alerts.py           # Motor de Alertas Tempranas y predicciones
│
└── frontend/                   # Interfaz de Usuario y Dashboard (Vite + React)
    ├── package.json            # Dependencias del frontend (React, Recharts, Lucide, Vite)
    ├── vite.config.js          # Configuración de compilación rápida
    ├── index.html              # Plantilla HTML base con fuentes premium (Inter)
    └── src/
        ├── main.jsx            # Entrada de renderizado de React
        ├── App.jsx             # Enrutador y estructura base de la UI
        ├── index.css           # Estilos personalizados (Glassmorphism, Dark mode)
        ├── services/
        │   └── api.js          # Cliente API integrado con Axios/Fetch
        └── components/
            ├── Sidebar.jsx     # Panel de navegación lateral responsive
            ├── Dashboard.jsx   # Pantalla principal (Vista Ejecutiva, KPIs y Gráficos)
            ├── SociosList.jsx  # Explorador interactivo con filtros avanzados
            ├── SocioProfile.jsx# Perfil de socio con radar, análisis transaccional e importancia de features
            └── RiskGauge.jsx   # Indicador visual animado del Score de Riesgo (Velocímetro HSL)
```

---

## 🚀 Guía de Inicio Rápido (En Local)

Sigue estos pasos para arrancar la aplicación completa en menos de 3 minutos:

### 1. Requisitos Previos
* **Python 3.10 o superior** instalado.
* **Node.js v18 o superior** instalado.

---

### 2. Iniciar el Backend (API & Inteligencia Artificial)

Abre una terminal en el directorio del backend y ejecuta:

```bash
# 1. Navegar al directorio de backend
cd backend

# 2. Crear un entorno virtual (opcional pero recomendado)
python -m venv venv
# Activar entorno virtual:
# En Windows (CMD/PowerShell):
.\venv\Scripts\activate
# En Mac/Linux:
source venv/bin/activate

# 3. Instalar las dependencias
pip install -r requirements.txt

# 4. Iniciar la aplicación
python start.py
```

**¿Qué hace `start.py` automáticamente por ti?**
1. **Generador de Datos**: Si no existe la base de datos `cooptech.db`, genera de forma inteligente más de 500 socios, 800 créditos y 15,000 transacciones con nombres reales ecuatorianos (Tulcán, Ipiales, Quito, etc.) y patrones transaccionales realistas de morosidad y comportamiento de ahorro.
2. **Entrenamiento del Modelo**: Si no hay un modelo entrenado, extrae los features conductuales complejos, entrena un clasificador **Random Forest** de Scikit-learn para predecir morosidad, y guarda el modelo serializado.
3. **Servidor API**: Inicializa el servidor de FastAPI en `http://localhost:8000`. Puedes ingresar a `http://localhost:8000/docs` para ver e interactuar con la documentación Swagger.

---

### 3. Iniciar el Frontend (Dashboard Interactiva)

En otra terminal, navega al directorio del frontend:

```bash
# 1. Navegar al directorio de frontend
cd frontend

# 2. Instalar dependencias de Node
npm install

# 3. Levantar el servidor de desarrollo
npm run dev
```

El frontend estará disponible en `http://localhost:5173`. Abre este enlace en tu navegador para ver la interfaz interactiva.

---

## 💡 Estrategia Ganadora para el Pitch de la Hackathon

1. **Storytelling centrado en el Socio**: No muestres solo código. Elige un socio de la lista (ej. un socio que el sistema califique en riesgo "Alto" o "Crítico"), entra a su perfil y explica al jurado **por qué** la IA lo detectó antes de que cayera en mora:
   * Muestra la **importancia de las variables (Feature Importance)**: explica que su riesgo aumentó por una caída en su tendencia de saldo y retrasos incrementales en cuotas.
   * Resalta que esto le permite a la Cooperativa Tulcán hacer **gestión proactiva** (reestructurar la deuda) en lugar de reactiva.
2. **Ventaja Competitiva**: Remarca que tu solución combina el perfil demográfico (edad, empleo) con el **perfil conductual transaccional** (frecuencia de depósitos/retiros, volatilidad de ingresos), lo cual es el estándar moderno en Fintech y Neobancos.
