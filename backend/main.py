"""
main.py - Aplicación FastAPI principal para CoopTech Tulcán.
Sistema de Perfilamiento de Riesgo Crediticio.
"""

import sys
import os

# Agregar el directorio backend al path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.dashboard import router as dashboard_router
from routes.dashboard_extended import router as dashboard_extended_router
from routes.socios import router as socios_router
from routes.alerts import router as alerts_router

app = FastAPI(
    title="CoopTech Tulcán - API de Riesgo Crediticio",
    description="Sistema de perfilamiento y análisis de riesgo crediticio para la Cooperativa de Ahorro y Crédito CoopTech Tulcán",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS - permitir frontend Vite
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar routers
app.include_router(dashboard_router)
app.include_router(dashboard_extended_router)
app.include_router(socios_router)
app.include_router(alerts_router)


@app.get("/")
def root():
    """Endpoint raíz con información del API."""
    return {
        "nombre": "CoopTech Tulcán - API de Riesgo Crediticio",
        "version": "1.0.0",
        "descripcion": "Sistema de perfilamiento y análisis de riesgo crediticio",
        "documentacion": "/docs",
        "endpoints": {
            "dashboard": "/api/dashboard/overview",
            "socios": "/api/socios",
            "alertas": "/api/alerts",
            "modelo": "/api/model/info",
        }
    }


@app.get("/health")
def health_check():
    """Health check endpoint."""
    from database import db_exists
    from models.risk_model import model_exists

    return {
        "status": "ok",
        "database": "ready" if db_exists() else "not_initialized",
        "model": "ready" if model_exists() else "not_trained",
    }
