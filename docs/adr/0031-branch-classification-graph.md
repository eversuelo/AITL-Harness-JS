# ADR-0031 — Clasificación de ramas y grafo de branches estilo GitHub

## Status

accepted

## Context

El campo `branch` (ADR-0028) era texto plano. El usuario pidió que cada rama diga su
rol (main/prod, master, develop, staging) y, si no es canónica, **de qué rama deriva**,
para dibujar un grafo de ramas estilo GitHub dentro del knowledge map.

## Decision

- **Clasificador puro** `src/util/branches.ts` — `classifyBranch(name, trunks)` →
  `{ kind (main|master|develop|staging|release|hotfix|feature|other), environment
  (prod|staging|dev|none), derivesFrom, protected }`, por reglas de nombre/gitflow.
- **Colección `branches`** (clave `(project, repo, name)`) con schema/store; campos
  `kind/environment/base/protectedBranch/head_sha/remote`.
- **Sync git** `src/branches/sync.ts` — enumera ramas locales
  (`git for-each-ref`), clasifica, y detecta la base **real** vía fork-point
  (`detectBaseBranch` usa `git rev-list --count base..branch` eligiendo el trunk con
  menor divergencia), cayendo a la convención del clasificador. Helpers git en
  `src/util/git.ts` (`listLocalBranches`, `branchHeadSha`, `aheadCount`,
  `detectBaseBranch`).
- **Superficie** — MCP `sync_branches`/`list_branches`/`delete_branch` (gateadas bajo
  el recurso RBAC nuevo `branches`); CLI `aitl branch {sync,list,rm}`; API
  `GET /api/branches`.
- **Knowledge map** — `NodeKind` += `branch`, `EdgeKind` += `derives`;
  `GraphSource.branches(project)`; `buildKnowledgeGraph` crea nodos `branch` bajo su
  repo (`contains`) y edges `derives` (branch→base) dentro del mismo repo; la UI gana
  color/filtro/legend para `branch` y estilo para `derives`.

## Consequences

- Cada rama queda clasificada (rol + entorno) y con su derivación explícita,
  habilitando un grafo de ramas estilo GitHub navegable junto al resto de entidades.
- La base se detecta con git real (fork-point) y cae a la convención gitflow si git no
  está disponible.
- `project` sigue siendo el scope; `branches` cuelga de `repo`.
- Verificado: 37 tests; live contra este repo dio `master (master) [prod]` y
  `ciclo-01/foundation (other) ← master` (base detectada por git), y el KG produjo
  nodes `{project, branch}` con edge `derives`.
- **Diseño (DSR):** clasificar ramas por rol y derivación convierte el historial git en
  un grafo de topología legible; detectar el fork-point por git y caer a convención
  mantiene la utilidad sin acoplarse a git.
- Fuera de alcance: commits/PRs en el grafo y sync de ramas remotas.
