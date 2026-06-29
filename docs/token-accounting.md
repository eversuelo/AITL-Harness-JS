# Contabilidad de tokens en el harness (cómo se cuentan los Runs)

> Por qué la pestaña **Runs** muestra ~42.6M tokens mientras `/context` de Claude Code
> muestra ~250k. **No es una contradicción: miden cosas distintas.**

## TL;DR

| Medida | Qué es | Valor (run `d4227793`) |
|---|---|---|
| `/context` (Claude Code) | **Tamaño actual** de la ventana de contexto — una foto instantánea | ~250.3k / 1M (25%) |
| Runs → `tokens total` | **Suma acumulada** facturada en TODAS las llamadas a la API de la sesión | 42,664,539 |

`/context` responde *"¿qué tan llena está la ventana ahora?"*.
Runs responde *"¿cuántos tokens se procesaron/facturaron sumando los 272 turnos?"*.

Son dos preguntas diferentes. Una es un **stock** (instantáneo); la otra es un **flujo
acumulado** (integral sobre el tiempo).

## Por qué el número de Runs es tan grande

Un agente como Claude Code corre un **loop**: en cada turno re-envía **casi todo el
contexto** a la API. Con prompt caching, ese contexto repetido se factura como
`cache_read` (≈0.1× del precio del input fresco), pero **se cuenta como tokens** en cada
turno.

El harness, en `parseTranscript` (`src/context/capture.ts`), suma el `usage` de **cada
turno asistente** del transcript:

```
token_usage.input = Σ_turnos ( input_tokens + cache_creation_input_tokens + cache_read_input_tokens )
token_usage.output = Σ_turnos ( output_tokens )
```

Con 272 turnos y una ventana que crece hasta ~150–250k, re-leer el contexto cada turno
acumula decenas de millones de `cache_read`.

## Desglose real de este run (272 turnos)

| Componente | Tokens | % del input | Qué significa |
|---|---:|---:|---|
| **cache_read** | 41,367,842 | 97.7% | Contexto **re-leído** de caché cada turno (barato, ~0.1×) |
| cache_creation | 963,253 | 2.3% | Contexto **escrito** a caché una vez (~1.25×) |
| fresh input | 24,779 | 0.06% | Input nunca antes visto (tu prompt nuevo por turno) |
| **input total** | **42,355,874** | 100% | Suma de los tres de arriba |
| **output** | **308,665** | — | Tokens **generados** por el modelo (sin doble conteo) |
| **total** | **42,664,539** | — | input + output |

`cache_read` es el **97.7%** del total. Por eso 42.6M ≠ "se gastaron 42.6M tokens únicos".

## Qué número usar para qué

Dependiendo de lo que quieras reportar:

1. **Trabajo real generado** → `output` = **308,665**. Sólido, sin re-conteo.
2. **Contenido único ingerido** (lo que el modelo leyó *alguna vez*, sin re-lecturas) →
   `fresh input + cache_creation` ≈ **988k**.
3. **Costo facturado** → hay que **ponderar** por los multiplicadores de caché de Anthropic:

   ```
   input-equivalente = fresh×1.0 + cache_creation×1.25 + cache_read×0.1
                     = 24,779 + 1,204,066 + 4,136,784
                     ≈ 5,365,629 tokens-equivalentes de input
   ```

   Más el `output` a su tarifa (para Opus, ~5× el input). Es decir, el **costo real**
   equivale a ~5.4M de input + ~309k de output, **no** a 42.6M.
4. **Throughput acumulado** (tokens procesados sumando turnos, métrica de eficiencia del
   loop) → los **42.6M**. Útil para comparar C0 vs C2: un loop que itera más, re-procesa
   más contexto.

## Relación entre `/context` y Runs

- `/context` ≈ el tamaño del input de **un** turno (el actual, el más grande).
- Runs `input` ≈ **Σ** del input de **todos** los turnos.
- Como cada turno re-lee ~150k, y hubo 272 turnos:
  `41.4M cache_read / 272 ≈ 152k por turno`, que coincide con el tamaño de la ventana.

En otras palabras: **Runs ≈ /context × número de turnos** (a grandes rasgos, porque la
ventana crece). El 25% de `/context` es el estado final; los 42.6M son la integral.

## Cómo lo muestra la UI

La pestaña **Runs** muestra el `total` (42.6M) como titular **y** el desglose de caché
(`creation`/`read`/`fresh`) debajo, precisamente para que el total no engañe:
`host_meta.cache = { creation, read }` y `raw_input_tokens` (fresh) quedan persistidos en
el doc del run. `aitl run-show <runId>` expone lo mismo.

## Recomendación para la tesis (métrica #7, eficiencia)

Para que la métrica sea defendible y no inflada por re-lecturas de caché, reporta de forma
separada:

- **output_tokens** (generación) — el indicador más limpio de "esfuerzo del modelo".
- **unique input** (`fresh + cache_creation`) — contexto realmente cargado.
- **costo ponderado** (fórmula de arriba) — para comparaciones económicas.
- **throughput acumulado** (total) — sólo si la hipótesis es sobre el *trabajo del loop*
  (p. ej. C0 vs C2: más iteraciones ⇒ más re-procesamiento).

Comparar el `total` crudo entre condiciones sigue siendo válido **si** ambas se miden
igual (mismo modelo, mismo prompt caching), porque el sesgo de `cache_read` es sistemático.

---

*Fuente de los datos: colección `runs` (ADR-0034 para `run-host`; ADR-0034/0035 para
sesiones capturadas con `aitl capture-session`). El desglose se extrae del `usage` por
turno del transcript JSONL de Claude Code.*
