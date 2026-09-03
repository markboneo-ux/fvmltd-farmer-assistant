import type { CaseStoreAdminClient, CaseStoreQueryBuilder } from "./supabase-store";

type Row = Record<string, unknown>;

export type FakeCaseSupabase = CaseStoreAdminClient & {
  db: Record<string, Row[]>;
  failNext: Set<string>;
  reset(): void;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createFakeCaseSupabase(): FakeCaseSupabase {
  const db: Record<string, Row[]> = emptyDb();
  const failNext = new Set<string>();

  function emptyDb(): Record<string, Row[]> {
    return {
      crop_cases: [],
      case_messages: [],
      case_observations: [],
      case_assessments: [],
      case_actions: [],
      case_outcomes: [],
      case_photos: [],
      case_followups: [],
    };
  }

  function from(table: string): CaseStoreQueryBuilder {
    let pendingInsert: Row[] | null = null;
    let pendingUpdate: Row | null = null;
    const equality: Array<{ column: string; value: unknown; mode: "eq" | "is" | "in" }> = [];
    let orExpr: string | null = null;
    let orderKey: string | null = null;
    let orderAsc = true;
    let wantSingle = false;
    let wantMaybe = false;

    const matches = (row: Row): boolean => {
      for (const filter of equality) {
        if (filter.mode === "eq" && row[filter.column] !== filter.value) return false;
        if (filter.mode === "is") {
          if (filter.value === null && row[filter.column] != null) return false;
          if (filter.value !== null && row[filter.column] !== filter.value) return false;
        }
        if (filter.mode === "in") {
          const allowed = filter.value as unknown[];
          if (!allowed.includes(row[filter.column])) return false;
        }
      }
      if (orExpr) {
        const parts = orExpr.split(",");
        const any = parts.some((part) => {
          const [column, op, ...rest] = part.split(".");
          const value = rest.join(".");
          if (op === "eq") return String(row[column] ?? "") === value;
          return false;
        });
        if (!any) return false;
      }
      return true;
    };

    const execute = async () => {
      if (!db[table]) db[table] = [];
      if (failNext.has(table) || failNext.has("*")) {
        failNext.delete(table);
        failNext.delete("*");
        return { data: null, error: { message: `forced failure for ${table}` } };
      }

      if (pendingInsert) {
        const inserted = pendingInsert.map((row) => {
          const next = {
            ...row,
            id: row.id ?? crypto.randomUUID(),
            created_at: row.created_at ?? new Date().toISOString(),
          };
          db[table].push(next);
          return next;
        });
        const data = wantSingle || wantMaybe ? inserted[0] ?? null : inserted;
        return { data, error: null };
      }

      let rows = db[table].filter(matches);
      if (pendingUpdate) {
        for (const row of rows) {
          Object.assign(row, pendingUpdate);
        }
        rows = db[table].filter(matches);
      }
      if (orderKey) {
        const key = orderKey;
        rows = [...rows].sort((a, b) => {
          const left = String(a[key] ?? "");
          const right = String(b[key] ?? "");
          return orderAsc ? left.localeCompare(right) : right.localeCompare(left);
        });
      }

      if (wantSingle) {
        if (!rows[0]) return { data: null, error: { message: "not found" } };
        return { data: clone(rows[0]), error: null };
      }
      if (wantMaybe) {
        return { data: rows[0] ? clone(rows[0]) : null, error: null };
      }
      return { data: clone(rows), error: null };
    };

    const builder = {
      insert(values: Row | Row[]) {
        pendingInsert = Array.isArray(values) ? values : [values];
        return builder;
      },
      update(values: Row) {
        pendingUpdate = values;
        return builder;
      },
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        equality.push({ column, value, mode: "eq" });
        return builder;
      },
      is(column: string, value: unknown) {
        equality.push({ column, value, mode: "is" });
        return builder;
      },
      in(column: string, values: unknown[]) {
        equality.push({ column, value: values, mode: "in" });
        return builder;
      },
      or(filters: string) {
        orExpr = filters;
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderKey = column;
        orderAsc = options?.ascending !== false;
        return builder;
      },
      single() {
        wantSingle = true;
        return execute();
      },
      maybeSingle() {
        wantMaybe = true;
        return execute();
      },
      then(onfulfilled?: ((value: unknown) => unknown) | null, onrejected?: ((reason: unknown) => unknown) | null) {
        return execute().then(onfulfilled ?? undefined, onrejected ?? undefined) as Promise<never>;
      },
    } as CaseStoreQueryBuilder;

    return builder;
  }

  return {
    from,
    db,
    failNext,
    reset() {
      const empty = emptyDb();
      for (const key of Object.keys(db)) delete db[key];
      Object.assign(db, empty);
      failNext.clear();
    },
  };
}
