# T1 — Alta de alumno con validaciones (spec)

> Rebanada vertical mínima de Schoolar (tenant + alumno). Esta es la tarea medible del
> primer piloto C0 vs C2. El estado inicial del repo (este directorio) es el MISMO para
> ambas condiciones; reinícialo entre corridas (`git checkout -- examples/schoolar-mvp`).

## Objetivo

Implementar `registerStudent(input)` en `src/student.ts` con **validación Zod**, de modo
que el alta de un alumno valide su entrada y normalice el email, dentro de un tenant.

## Contrato

```ts
interface StudentInput { tenantId: string; name: string; email: string; }
interface Student { id: string; tenantId: string; name: string; email: string; createdAt: Date; }
function registerStudent(input: StudentInput): Student
```

## Criterios de aceptación (gate = `npm test` en este directorio)

1. Una entrada válida devuelve un `Student` con `id` (string no vacío), `tenantId`,
   `name`, `email` **normalizado a minúsculas** y `createdAt` (Date).
2. Rechaza (lanza error) si `name` está vacío/en blanco.
3. Rechaza si `email` no es un email válido.
4. Rechaza si `tenantId` está vacío/en blanco.

La validación debe hacerse con **Zod** (`zod` ya está disponible en el workspace).

## Cómo correr el gate

```bash
npm test --prefix examples/schoolar-mvp
# o:  cd examples/schoolar-mvp && npm test
```

Estado inicial: **RED** (la implementación es un stub que lanza "not implemented").
La tarea está completa cuando las 4 pruebas pasan.

## Fuera de alcance de T1 (después)

- **T3 — Aislamiento por tenant** (`tenantId` obligatorio en consultas, índices
  compuestos, `validate_tenant_isolation`). Es la dimensión de seguridad; se añade como
  segunda tarea, no aquí.
