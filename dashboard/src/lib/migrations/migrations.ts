import type { Migration } from "./index";

/**
 * All schema migrations, ordered chronologically.
 * Each migration runs once per clinic tenant.
 *
 * Naming convention: {sequence}_{snake_case_description}
 */
export const MIGRATIONS: Migration[] = [
  {
    id: "001_add_schema_version",
    description: "Initialize schema version tracking",
    up: async () => {
      // No-op — the migration framework itself creates the _schema_version doc.
    },
  },
];
