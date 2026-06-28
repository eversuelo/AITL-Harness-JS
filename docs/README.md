# Documentacion

Indice de lectura para explorar AITL-Harness-JS en GitHub.

## Lectura recomendada

1. [../README.md](../README.md): instalacion, comandos y mapa general.
2. [ARQUITECTURA-AITL-JS.md](ARQUITECTURA-AITL-JS.md): resumen con diagramas Mermaid, brechas y mejoras.
3. [adr/README.md](adr/README.md): decisiones de arquitectura.
4. [PARITY.md](PARITY.md): estado de paridad con el port Python.
5. [MONGODB-ATLAS.md](MONGODB-ATLAS.md): setup de Mongo local/cloud.
6. [GOOGLE-FREE.md](GOOGLE-FREE.md): provider `google-free` / `gemini-free`.
7. [RBAC-REGISTRO.md](RBAC-REGISTRO.md): contrato de roles, registro root y permisos.

## ADRs

| ADR | Tema |
|---|---|
| [0001](adr/0001-record-architecture-decisions.md) | Registro de decisiones en git y Mongo. |
| [0002](adr/0002-mongodb-atlas-vector-search.md) | MongoDB Atlas Vector Search como store durable. |
| [0003](adr/0003-interactive-tui-live-agent-chat.md) | TUI live agent chat. |
| [0004](adr/0004-ink-as-tui-rendering-library.md) | Ink para render del TUI. |
| [0005](adr/0005-streaming-in-provider-port.md) | Streaming en providers. |
| [0006](adr/0006-user-level-config-profile.md) | Config global para `npm install -g`. |
| [0007](adr/0007-memory-admin-web-ui.md) | UI web de administracion de memoria. |
| [0008](adr/0008-interactive-control-panel.md) | Panel interactivo sin dependencias. |

## Planes y tareas

| Archivo | Proposito |
|---|---|
| [TUI-IMPLEMENTATION-PLAN.md](TUI-IMPLEMENTATION-PLAN.md) | Plan completo para el TUI live agent chat. |
| [codex-task-A-streaming-provider.md](codex-task-A-streaming-provider.md) | Brief de streaming por provider. |
| [codex-task-B-loop-observer.md](codex-task-B-loop-observer.md) | Brief de observador del loop. |
| [sessions/README.md](sessions/README.md) | Bitacoras de sesiones de implementacion. |

## Contratos y paridad

| Archivo | Proposito |
|---|---|
| [PARITY.md](PARITY.md) | Tabla humana de paridad Python/TypeScript. |
| [parity-contract.json](parity-contract.json) | Contrato estructurado de capacidades. |

## Operacion

| Archivo | Proposito |
|---|---|
| [MONGODB-ATLAS.md](MONGODB-ATLAS.md) | MongoDB local y Atlas cloud. |
| [GOOGLE-FREE.md](GOOGLE-FREE.md) | Perfil Google free tier. |
| [RBAC-REGISTRO.md](RBAC-REGISTRO.md) | RBAC, registro root y permisos de usuarios/agentes. |

## Regla de navegacion

Los README apuntan a carpetas; las ADR explican por que existe cada decision; los archivos
`src/*` muestran como se implementa.
