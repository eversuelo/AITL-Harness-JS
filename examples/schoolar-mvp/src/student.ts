/**
 * T1 — Alta de alumno con validaciones.  ← TASK (maker = the agent under C0/C2)
 *
 * Implement `registerStudent` with Zod validation so `student.test.ts` passes.
 * See ../SPEC.md for the acceptance criteria. This stub keeps the gate RED.
 */

export interface StudentInput {
  tenantId: string;
  name: string;
  email: string;
}

export interface Student {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  createdAt: Date;
}

export function registerStudent(_input: StudentInput): Student {
  throw new Error("not implemented (T1) — see SPEC.md");
}
