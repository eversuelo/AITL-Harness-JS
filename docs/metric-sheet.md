# Hoja de métrica manual — por corrida (Tabla 4.3)

> Duplica el bloque "Corrida" por cada ejecución. Llena C0 y C2 sobre la **misma tarea**
> y el **mismo estado inicial** del repo, luego compáralos abajo.
>
> **Honestidad de medición:** marca cada número con su fuente — `measured` (lo reporta
> el proveedor/herramienta), `counted` (lo contaste de eventos/logs) o `estimated` (a
> ojo). No mezcles estimados con medidos al concluir.
>
> Fuente de los números del agente: `aitl run-show <runId>` (tokens/iters/tool_calls,
> conteo de eventos, secciones de `hydrate`).

---

## Corrida

| Campo | Valor |
|---|---|
| ID de corrida (runId) | |
| Tarea | T1 — Alta de alumno con validaciones |
| Condición | ☐ C0 (improvisado) ☐ C1 ☐ C2 (harness completo) |
| Modelo / host | |
| Fecha | |
| SHA inicial del repo | |
| Repetición # | (1, 2, 3…) |

### Métricas (Tabla 4.3)

| # | Dimensión | Métrica | Cómo capturar | Fuente | Valor | Confianza |
|---|---|---|---|---|---|---|
| 1 | Velocidad | Tiempo hasta gate verde | Cronómetro: inicio del run → primer `npm test` verde | manual | | counted |
| 2 | Calidad funcional | % pruebas de aceptación aprobadas | Salida de `npm test --prefix examples/schoolar-mvp` (aprob/total) | auto | | measured |
| 3 | Estabilidad | # regresiones | Suite completa antes vs. después | auto | | measured |
| 4 | Mantenibilidad | Complejidad / duplicación / violaciones | Nota cualitativa (alta/media/baja) para el primer test | manual | | estimated |
| 5 | Seguridad | Violaciones de aislamiento por tenant | `validate_tenant_isolation` (0 = ok). N/A si no corriste T3 | auto | | measured |
| 6 | Supervisión humana | # y duración de intervenciones | Cuenta intervenciones + minutos | manual | | counted |
| 7 | Eficiencia del agente | Tokens · costo aprox · tool calls · iteraciones | `aitl run-show <runId>` (`tokens.total`, `tool_calls`, `iters`) | auto | | measured |
| 8 | Memoria | # recuerdos recuperados · relevancia · uso efectivo | `aitl run-show` → `hydrate` (secciones). **C0 = 0** (sin memoria) | auto/manual | | counted/estimated |
| 9 | Trazabilidad | ¿Cadena spec → tarea → cambios → pruebas → resultado reconstruible? | `events` + commits: ☐ sí ☐ parcial ☐ no | manual | | counted |

### Notas de la corrida

- Intervenciones (qué y por qué):
- Fallos/reintentos observados:
- Cadena de trazabilidad (qué eslabón faltó, si alguno):

---

## Comparación C0 vs C2 (misma tarea)

| Dimensión | C0 | C2 | Δ (C2 − C0) | Observación |
|---|---|---|---|---|
| Tiempo a gate | | | | |
| % pruebas aprobadas | | | | |
| Regresiones | | | | |
| Mantenibilidad | | | | |
| Aislamiento tenant (T3) | | | | |
| Intervenciones humanas | | | | |
| Tokens / iteraciones | | | | |
| Memoria (recuerdos usados) | | | | |
| Trazabilidad | | | | |

**Lectura esperada (§5.5, hipótesis):** C2 debería mejorar calidad, estabilidad y
trazabilidad, y reducir el tiempo a gate, **a costa de más tokens**. Si el primer dato
lo contradice, es hallazgo — anótalo.

---

## Recordatorios de validez

- **Repite cada condición ≥3 veces** antes de concluir (§4.4).
- **Mismo estado inicial**: `git checkout -- examples/schoolar-mvp` entre corridas.
- **Aleatoriza el orden** de las corridas.
- **maker/checker:** quien evalúa la salida no es quien la construyó (§1.10.4).
- Este lote es **piloto**, no las 63 corridas formales.
