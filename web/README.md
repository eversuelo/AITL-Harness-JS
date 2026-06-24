# Memory Admin Web UI

SPA React para administrar la memoria durable del harness.

Decision relacionada: [ADR-0007](../docs/adr/0007-memory-admin-web-ui.md).

## Ejecutar

Desde el paquete JS:

```powershell
npm run ui
```

O desde instalacion global:

```powershell
aitl ui --project demo
```

`aitl ui` arranca dos procesos:

- API HTTP en `http://localhost:4317/api`
- Vite dev server en `http://localhost:5317`

Puedes cambiar puertos:

```powershell
aitl ui --api-port 4320 --web-port 5320
```

## Archivos

| Ruta | Rol |
|---|---|
| [src/App.tsx](src/App.tsx) | Shell principal de la UI. |
| [src/api.ts](src/api.ts) | Cliente HTTP contra `/api`. |
| [src/styles.css](src/styles.css) | Estilos de la SPA. |
| [vite.config.ts](vite.config.ts) | Proxy `/api` hacia el launcher. |
| [index.html](index.html) | Entrada HTML. |

## Backend

El backend vive en [../src/server/api.ts](../src/server/api.ts) y reusa
[MemoryStore](../src/memory/store.ts). Las escrituras siguen el mismo camino que
`write_memory`: clasificar, embeddear y upsert.

## Limitaciones

La UI corre como dev server Vite. La ADR deja pendiente una version empacada en un solo
puerto para una distribucion global mas cerrada.
