---
name: adr-ledger-reconcile
description: >-
  Reordena y reconcilia el ledger de ADRs (decisiones arquitectónicas) y su memoria durable.
  Úsala SIEMPRE que la numeración de ADRs pueda estar desincronizada: antes de registrar un ADR
  nuevo (para verificar el next-free real), cuando un puntero "next free id" en CLAUDE.md no cuadre
  con la base, cuando haya huecos o duplicados en la secuencia, cuando un ADR esté citado en TODO.md
  o en docs pero no exista en la colección `decisions`, o como higiene periódica del ciclo SDD+ADR.
  Fuente de verdad: la colección `decisions` en MongoDB/Atlas vía `list_decisions`, NUNCA los docs.
  No registra ADRs; solo reconcilia, reordena y corrige punteros. Invócala aunque el usuario solo
  diga "revisa la numeración", "reordena los ADRs", "reconcilia las decisiones" o "¿cuál es el
  siguiente ADR?".
---

# Reconciliación del ledger de ADRs y su memoria

Mantiene consistentes tres cosas: (1) la secuencia de ADRs en la colección `decisions`, (2) las
referencias a ADRs en la memoria durable, y (3) los punteros derivados en docs (`CLAUDE.md`,
`TODO.md`, backlogs).

## Regla de oro (no negociable)

La **fuente de verdad es la colección `decisions`** (Atlas/Mongo), leída vía `list_decisions`.
`CLAUDE.md`, `TODO.md` y los backlogs son **derivados**: se corrigen *hacia* el ledger, jamás al
revés. Si el ledger y un doc discrepan, el doc está mal.

## Cuándo invocarla

- Antes de iniciar un ciclo que registrará ADRs → confirmar el next-free real.
- Cuando un "next free id" en `CLAUDE.md` no coincide con la base (puntero stale).
- Cuando hay huecos, duplicados o desorden en la secuencia.
- Cuando un ADR se cita en `TODO.md`/docs pero no está en `decisions` (huérfano).
- Como higiene periódica del loop SDD+ADR.

## Procedimiento

### 1 · Leer el ledger real (read-only)
- `list_decisions` por proyecto.
- Construir: secuencia ordenada de ids, conjunto de huecos, duplicados y **next-free** (primer id
  libre tras el bloque contiguo).

### 2 · Detectar desincronización

| Chequeo | Cómo | Señal |
|---|---|---|
| Huecos | ids faltantes en la secuencia | `0001..0023, 0025` → falta 0024 |
| Duplicados | mismo id ≥2 veces | colisión |
| Puntero stale | `CLAUDE.md` "next free id" vs. real | doc desactualizado |
| Huérfanos | id citado en `TODO.md`/docs, ausente en `decisions` | ADR nunca registrado |
| Desorden | ids fuera de orden cronológico/lógico | requiere reordenamiento |

### 3 · Producir un PLAN antes de mutar (nunca silencioso)
- Si ya está contiguo y los punteros cuadran → **no hacer nada** (idempotente). Reportar "consistente".
- Si hay que renumerar → tabla explícita `old → new` (shift por N) como contrato del cambio.
- Esperar confirmación humana antes de cualquier escritura.

### 4 · Reordenar / renumerar (solo con confirmación)
- Aplicar el mapa `old → new` al ledger.
- **NUNCA registrar un ADR nuevo aquí.** Crear un ADR es una acción de la fase BUILD de su tarea,
  no de la reconciliación.

### 5 · Reconciliar la memoria durable
- Buscar referencias a ADRs en la colección `memory`: `search_memory` + wikilinks `[[ADR-00NN]]`.
- Si un id cambió en el paso 4, actualizar cada referencia al nuevo id y **re-embeber** el doc
  afectado (la búsqueda vectorial debe seguir resolviendo).
- Objetivo: cero referencias colgantes ledger ↔ memoria.

### 6 · Actualizar punteros derivados (docs)
- `CLAUDE.md`: "next free id" → valor real verificado.
- Backlogs/TODO: **de-pinnear** los números que se movieron; referir ADRs aún no registrados por su
  rol, no por número fijo (tomarán su next-free al escribirse).

### 7 · Verificación post (read-only)
- Re-ejecutar `list_decisions`: confirmar que el next-free es el esperado y que **no se escribió
  ningún ADR por accidente** durante las ediciones.
- Si verificas en docs con grep, **acota a las líneas de ADR**, no al archivo completo: los números
  de roadmap mencionados en prosa son falsos positivos.
  ```bash
  grep -E '^\*\*ADR\.\*\*' docs/<archivo>.md | grep -oE 'ADR-00[0-9]{2}' | sort -u
  ```

## Guardrails

- **Read-only por defecto.** Toda mutación requiere confirmación explícita y un plan `old→new` previo.
- **Jamás crear/registrar un ADR** en esta skill.
- **Idempotente:** correrla dos veces sobre un ledger consistente no cambia nada.
- **Trazabilidad:** emitir un evento con qué se reordenó, el mapa `old→new` y el actor que lo ordenó.
- **Atomicidad:** si renumeras en la base, actualiza memoria y docs en la misma operación lógica; no
  dejes el sistema a medias.

## Tools MCP que usa

| Tool | Uso |
|---|---|
| `list_decisions` | leer el ledger (fuente de verdad) |
| `search_memory` / `write_memory` | encontrar y reconciliar referencias a ADRs |
| `adr-sync` | re-espejar `docs/adr/NNNN-*.md` ↔ `decisions` si cambian ids |
| `record_decision` | **NO** se usa aquí (crear ADR es BUILD, no reconciliación) |

## Salida esperada (reporte)

1. Estado del ledger: secuencia, next-free, contigüidad.
2. Issues detectados (tabla del paso 2).
3. Plan `old → new` (si aplica) o "consistente, sin cambios".
4. Punteros corregidos (`CLAUDE.md`, docs).
5. Verificación post (next-free confirmado, sin escrituras accidentales).

## Registro como skill GLOBAL

Aplica a **todos los proyectos**, no a uno. Regístrala en el scope reservado `__global__`:

```bash
write_skill project="__global__" slug="adr-ledger-reconcile" type="procedure" \
  description="<la del frontmatter>" body="<este SKILL.md>"
```

Requisito: que `routeSkills`/`hydrate` incluyan el scope `__global__` además del scope del proyecto
activo (ver dependencia en **ADR-0038**). Mientras no exista el agrupamiento completo (E6), el scope
`__global__` reservado es la vía mínima para skills globales.

## Procedencia (dogfooding)

Esta skill **codifica el procedimiento que el harness ya ejecutó a mano** al reconciliar el Ciclo 01
(descubrir que `CLAUDE.md` decía 0022, que Atlas tenía 0001–0023 y que el ADR-0024 de `TODO.md`
nunca se registró). Convertir esa corrida manual en skill reutilizable es evidencia de que el harness
aprende sus propios procedimientos de mantenimiento — útil para la narrativa DSR.
