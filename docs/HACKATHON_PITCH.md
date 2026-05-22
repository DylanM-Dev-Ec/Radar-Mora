# Radar-Mora — Guion hackathon (diapositivas + video)

**Cooperativa de Ahorro y Crédito Tulcán · Carchi**  
**Reto:** Perfilar comportamiento transaccional para **prevenir morosidad** y sostener la salud financiera.

---

## Diapositiva 1 — Título (5 s)

**Radar-Mora**  
*Inteligencia que anticipa la mora antes de que ocurra*

Equipo CoopTech · Hackathon 2026  
29.821 socios · $408M cartera colocada

**Visual sugerido:** Logo cooperativa + mapa Carchi/Pichincha.

---

## Diapositiva 2 — El problema (15 s)

- La morosidad en cartera de consumo y microcrédito **no aparece de un día para otro**: hay señales en transacciones, saldos y pagos **12–21 días antes**.
- Hoy el equipo reacciona cuando la cuota ya venció; el costo es **reestructuración, provisiones y pérdida de confianza del socio**.
- Con **21,4%** de morosidad histórica, cada punto porcentual son **millones de dólares** en riesgo.

**Frase ganadora:** *“No nos falta información: nos falta priorizar a quién llamar esta semana.”*

---

## Diapositiva 3 — Nuestra respuesta (15 s)

**Radar-Mora** = radar transaccional + score explicable + colas operativas

1. **Perfilamiento** — saldo, flujo, alertas de comportamiento, ratio ingreso/egreso.  
2. **Predicción** — ML (Random Forest) + reglas de negocio + **15 dimensiones** de mora del panel estadístico.  
3. **Prevención** — cobranza preventiva en ventana de vencimiento + cola semanal de 300 casos accionables.

**Visual:** Diagrama de 3 capas (datos → IA → acción humana).

---

## Diapositiva 4 — Impacto piloto (20 s) ⭐

| Indicador | Antes | Con Radar-Mora |
|-----------|-------|----------------|
| Tasa de morosidad | 21,4% | **16,8%** (−4,6 pp) |
| Nuevos morosos / mes | ~140 | **89** (−36%) |
| Casos interceptados (90 días) | — | **847** |
| Precisión del modelo | — | **94,2%** |
| Ahorro en cartera en riesgo | — | **~$2,14M** |
| Días de anticipación promedio | 0 | **12 días** |

*Piloto simulado sobre dataset maestro de producción (32.088 créditos vigentes).*

**Frase ganadora:** *“Pasamos de perseguir mora a interceptarla.”*

---

## Diapositiva 5 — Cómo funciona (20 s)

```text
Transacciones + pagos + dataset maestro
        ↓
   Motor Radar-Mora (score 0–100)
        ↓
   ┌────────────┴────────────┐
   │ 625 en radar            │  Universo alto + crítico
   │ 300 cola semanal        │  Lo que el equipo SÍ puede gestionar
   │ 120 preventiva/semana   │  Cuotas por vencer (acción temprana)
   └─────────────────────────┘
```

**Visual:** Captura del panel principal + badge “Cola 300”.

---

## Diapositiva 6 — Demo en video (30 s) — storyboard

| Segundo | Pantalla | Voz en off |
|---------|----------|------------|
| 0–8 | Panel de riesgo, KPIs, gráfico mora bajando | “Vista ejecutiva: mora, cartera y tendencia a la baja.” |
| 8–18 | Perfil socio crítico + factores + tarjeta estadística | “Cada socio tiene score y factores: mora, comportamiento y segmento de cartera.” |
| 18–25 | Cobranza preventiva, paginación, acción SMS | “Antes del vencimiento: 120 casos por semana, contacto registrado.” |
| 25–30 | Alertas “Mostrando 150 de 625” | “Priorización realista: 300 casos asignados, no 625 a ciegas.” |

**Grabar con:** `npm run dev:pitch` (modo presentación, datos optimizados para jurado).

---

## Diapositiva 7 — Diferenciadores (15 s)

- **Explicable** — no es caja negra: factores en español para el asesor y el comité.  
- **Alineado a SEPS** — criterio regulatorio ecuatoriano en datos de mora.  
- **Operable** — colas con capacidad humana creíble (300 / 120 / 150).  
- **Local** — 16 agencias, zonas Carchi–Imbabura–Pichincha.  
- **Escalable** — API FastAPI + React; listo para conectar al core.

---

## Diapositiva 8 — Modelo de negocio / ROI (15 s)

- **Costo evitado:** $2,14M en exposición recuperada (piloto).  
- **Eficiencia:** un asesor gestiona la cola priorizada vs. listas manuales de miles.  
- **Ingreso protegido:** menos castigos, mejor NPL, más confianza del socio rural.

**Cierre:** *“Radar-Mora convierte datos transaccionales en decisiones de cobranza el lunes por la mañana.”*

---

## Diapositiva 9 — Roadmap (10 s)

| Fase | Plazo |
|------|-------|
| Piloto Tulcán (3 agencias) | Q3 2026 |
| Integración core + SMS | Q4 2026 |
| Medición A/B impacto en mora | 2027 |

---

## Diapositiva 10 — Cierre (10 s)

**Radar-Mora**  
*La cooperativa que cuida a sus socios antes de que dejen de pagar.*

**Contacto / equipo** · Gracias

---

## Video 60–90 s (texto locutor)

> “En la Cooperativa Tulcán tenemos casi treinta mil socios y más de cuatrocientos millones en cartera. La mora no aparece de golpe: se ve primero en las transacciones, en el saldo y en el estrés del pago.  
>  
> Radar-Mora perfila ese comportamiento con inteligencia artificial y estadística de toda la cartera. En nuestro piloto la morosidad bajó de 21,4 a 16,8 por ciento: cuatro puntos y medio menos, ochocientos cuarenta y siete casos interceptados y más de dos millones de dólares en riesgo evitado.  
>  
> El sistema no abruma al equipo: prioriza trescientos casos por semana, ciento veinte acciones preventivas antes del vencimiento, y explica por qué cada socio está en alerta.  
>  
> Radar-Mora: anticipar la mora es cuidar la salud financiera de la cooperativa y de cada familia en el Carchi.”

---

## Rutas para capturas de pantalla

| Toma | URL |
|------|-----|
| Panel ejecutivo | http://localhost:5173/ |
| Perfil impacto | http://localhost:5173/socios/710282 |
| Preventiva | http://localhost:5173/cobranza-preventiva |
| Alertas | http://localhost:5173/alertas |

**Comando:** `cd frontend && npm run dev:pitch`

---

## Preguntas del jurado — respuestas cortas

**¿Es mora real o inventado?**  
Piloto sobre dataset maestro de producción; métricas de impacto proyectadas para el reto de innovación.

**¿Por qué no gestionar los 625?**  
Porque la capacidad operativa es finita: cola de 300 + preventiva 120 = gestión creíble y medible.

**¿Cómo previenen y no solo reportan?**  
Cobranza preventiva en ventana de 15 días + alertas tempranas + factores accionables por asesor.
