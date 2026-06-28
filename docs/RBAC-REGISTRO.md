# RBAC y registro de usuarios

## Objetivo

AITL debe funcionar como gateway seguro entre usuarios/agentes y MongoDB. Ningun cliente
web, agente remoto o usuario no-root debe conocer ni usar directamente `MONGODB_URI`.

La cadena de MongoDB vive solo en el host donde corre AITL:

```text
AITL Web / cliente MCP / host agent
  -> AITL Server
    -> MongoDB Atlas
```

## Principios

- Solo el usuario `root` puede registrar usuarios nuevos.
- El registro inicial se ejecuta durante `check-db` o bootstrap equivalente, no desde una
  pantalla publica.
- Los usuarios normales no administran memoria, decisiones, agentes, skills, indices ni
  configuracion global.
- Los usuarios normales solo pueden eliminar sus propios prompts.
- Las operaciones privilegiadas las ejecutan `aitl web` y `aitl server` a traves de un
  host agent autenticado/autorizado.
- Todo evento sensible debe registrar actor, rol, origen, accion, recurso y resultado.

## Roles

| Rol | Proposito |
|---|---|
| `root` | Dueño del sistema. Puede registrar usuarios, rotar credenciales, inicializar DB y administrar RBAC. |
| `admin` | Opera AITL Web/Server, pero no crea usuarios root ni rota secretos base. |
| `user` | Usa UI y prompts propios. Solo puede borrar sus propios prompts. |
| `agent` | Identidad de servicio para AITL Server/host agent. Ejecuta operaciones internas autorizadas. |
| `auditor` | Solo lectura de bitacoras y eventos, sin mutaciones. |

## Registro inicial

El bootstrap lee estas variables:

```env
AITL_BOOTSTRAP_USERNAME=
AITL_BOOTSTRAP_EMAIL=
AITL_BOOTSTRAP_PASSWORD=
AITL_BOOTSTRAP_ROLE=root
```

Reglas:

1. Si no existe ningun usuario en `users`, `check-db` puede crear el primer usuario solo si
   `AITL_BOOTSTRAP_ROLE=root`.
2. Si ya existe al menos un usuario, `check-db` no registra mas usuarios.
3. Si ya existe un `root`, todo registro posterior requiere una sesion autenticada como
   `root`.
4. `username`, `email` y `password` son obligatorios.
5. La contraseña nunca se guarda en texto plano; se guarda hash con salt.
6. `username` y `email` son unicos.

## Flujo de `check-db`

`aitl check-db` debe validar en este orden:

1. Conexion a MongoDB.
2. Existencia de coleccion `users`.
3. Indices unicos:
   - `users.username`
   - `users.email`
4. Existencia de usuario `root`.
5. Si no hay usuarios y hay bootstrap completo, crear usuario `root`.
6. Si falta root, devolver advertencia accionable.

Salida esperada:

```text
MongoDB ping OK via primary: <redacted-uri> (db=aitl)
Users collection OK
Root user: exists
RBAC status: ready
```

Si no existe root:

```text
RBAC status: missing-root
Set AITL_BOOTSTRAP_USERNAME, AITL_BOOTSTRAP_EMAIL, AITL_BOOTSTRAP_PASSWORD,
AITL_BOOTSTRAP_ROLE=root and run aitl check-db again.
```

## Permisos

| Recurso | Accion | `root` | `admin` | `user` | `agent` | `auditor` |
|---|---:|---:|---:|---:|---:|---:|
| usuarios | crear | si | no | no | no | no |
| usuarios | leer | si | si | propio | no | si |
| usuarios | cambiar rol | si | no | no | no | no |
| usuarios | desactivar | si | no | no | no | no |
| prompts | crear | si | si | propio | si | no |
| prompts | leer | si | si | propio | si | si |
| prompts | eliminar | si | si | propio | si | no |
| memory | crear/editar/eliminar | si | via AITL Server | no | si | no |
| decisions | crear/editar/eliminar | si | via AITL Server | no | si | no |
| agents/skills | crear/editar/eliminar | si | via AITL Server | no | si | no |
| config/secrets | leer/escribir | si | no | no | no | no |
| indexes/init-db | ejecutar | si | no | no | no | no |

## Politica para usuarios normales

Un usuario `user` puede:

- iniciar sesion;
- ver sus prompts;
- crear prompts propios;
- eliminar prompts propios;
- solicitar acciones al host agent por medio de AITL Web.

Un usuario `user` no puede:

- escribir memoria durable directamente;
- registrar decisiones directamente;
- crear agentes o skills;
- ejecutar `init-db`;
- ejecutar registro de usuarios;
- ver o exportar secretos;
- borrar prompts de otros usuarios.

## Politica para AITL Web y AITL Server

AITL Web no debe ejecutar mutaciones privilegiadas directamente como el usuario final.
Debe enviar solicitudes al AITL Server con actor autenticado.

AITL Server decide si:

- responde directamente;
- rechaza por RBAC;
- delega a un host agent con identidad `agent`;
- registra una decision o memoria como resultado de una accion autorizada.

El host agent debe operar con una identidad de servicio, por ejemplo:

```json
{
  "actor": {
    "type": "agent",
    "id": "agent:aitl-server",
    "role": "agent"
  }
}
```

## Modelo minimo de usuario

```ts
type User = {
  username: string;
  email: string;
  role: "root" | "admin" | "user" | "agent" | "auditor";
  password_hash: string;
  password_salt: string;
  password_algo: string;
  disabled?: boolean;
  created_at: Date;
  updated_at: Date;
};
```

## Modelo minimo de auditoria

```ts
type AuditEvent = {
  actor_id: string;
  actor_role: string;
  source: "web" | "server" | "mcp" | "cli" | "host-agent";
  action: string;
  resource: string;
  resource_owner?: string;
  ok: boolean;
  reason?: string;
  ts: Date;
};
```

## Endpoints sugeridos

| Endpoint | Rol minimo | Descripcion |
|---|---|---|
| `POST /api/auth/login` | publico | Inicia sesion. |
| `POST /api/auth/logout` | autenticado | Cierra sesion. |
| `GET /api/auth/me` | autenticado | Devuelve actor actual. |
| `POST /api/users` | `root` | Registra usuario. |
| `GET /api/users` | `root`/`admin` | Lista usuarios sin hashes. |
| `PATCH /api/users/:username/role` | `root` | Cambia rol. |
| `DELETE /api/prompts/:id` | owner/`admin`/`root` | Borra prompt si es propio o privilegiado. |

## Tareas de implementacion

1. Cambiar bootstrap default a `root` cuando el objetivo sea primer registro.
2. Extender `aitl check-db` para verificar `users`, indices y root.
3. Agregar `owner_user` / `actor_id` a prompts.
4. Aplicar RBAC en API web antes de cada mutacion.
5. Aplicar RBAC en MCP HTTP con token mapeado a actor.
6. Agregar audit log para acciones rechazadas y aceptadas.
7. Evitar que el cliente web reciba `MONGODB_URI`, tokens o hashes.
8. Agregar pruebas de permisos para:
   - root registra usuario;
   - user no registra usuario;
   - user elimina prompt propio;
   - user no elimina prompt ajeno;
   - agent escribe memoria por flujo server autorizado.

## Estado de implementacion

| # | Tarea | Estado | Donde |
|---|---|---|---|
| 1 | Bootstrap default a `root` | hecho | `config.ts` (`bootstrapRole=root`), `auth/users.ts` (`bootstrapBaseUser` solo crea el primer usuario y exige rol root) |
| 2 | `check-db` valida users, indices y root | hecho | `auth/checkdb.ts` (`checkRbac`), comando `aitl check-db` en `cli.ts` |
| 3 | `owner_user` / `actor_id` en prompts | hecho | `prompts/schemas.ts`, `prompts/store.ts` (`getById`/`deleteById`) |
| 4 | RBAC en API web antes de cada mutacion | hecho | `server/api.ts` (`resolveActor` + `guard`); memoria, prompts y usuarios |
| 5 | RBAC en MCP HTTP con token mapeado a actor | hecho | `mcpserver/server.ts` (`mcpActor` + `guardTool` en `runLogged`, mapa `TOOL_RBAC`) |
| 6 | Audit log de acciones aceptadas y rechazadas | hecho | `auth/audit.ts` (`recordAudit`, coleccion `audit`); usado en web, MCP y CLI |
| 7 | El cliente web no recibe `MONGODB_URI`, tokens ni hashes | hecho | `config/store.ts` enmascara secretos; `/api/config` exige rol root; `PUBLIC_USER_PROJECTION` excluye hashes |
| 8 | Pruebas de permisos | hecho | `auth/rbac.test.ts`, `auth/users.test.ts` (`npm test`) |

### Matriz como codigo

La tabla de **Permisos** vive en `src/auth/rbac.ts` (`MATRIX` + `can()`), que es la
fuente unica que consultan la API web, el MCP y la CLI. Cualquier cambio de politica
se hace ahi y queda cubierto por `rbac.test.ts`.

### Identidades de actor por gateway

- **CLI**: el operador del host actua como `root` (`cli:local`).
- **API web**: bearer token -> actor via `AITL_WEB_TOKENS`; sin token valido el llamador
  es un `user` anonimo (minimo privilegio), de modo que las rutas privilegiadas devuelven 403.
- **MCP**: identidad de servicio `agent` por defecto (`AITL_MCP_ACTOR_ID/ROLE`); las tools
  de escritura durable se autorizan como delegacion del servidor.

### Pendiente (fuera de este cambio)

- Sesiones/login con cookie (`POST /api/auth/login`, `/logout`): hoy la identidad web se
  resuelve por bearer token; falta el flujo de sesion completo con contraseña.
- Propagar `owner_user` al crear prompts desde web/MCP para habilitar borrado por el
  dueño (el esquema y el guard de borrado ya lo soportan).
