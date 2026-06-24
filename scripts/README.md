# Scripts

Scripts directos para operar Mongo sin pasar por todo el CLI.

| Script | Comando npm | Proposito |
|---|---|---|
| [checkDb.ts](checkDb.ts) | `npm run check-db` | Hace ping a Mongo y muestra version. |
| [initDb.ts](initDb.ts) | `npm run init-db` | Crea colecciones e indices. |

Equivalentes desde CLI:

```powershell
aitl check-db
aitl init-db
```

La configuracion se resuelve igual que en el resto del harness:

```text
process.env > ~/.aitl/config.json > defaults
```

Ver [ADR-0006](../docs/adr/0006-user-level-config-profile.md).
