import { query } from "./pg";
import { ensureSchemaSql } from "./schema";

let initialized = false;

export const ensureDatabaseSchema = async () => {
  if (initialized) {
    return;
  }

  console.log("Ensuring database tables exist...");
  await query(ensureSchemaSql);
  console.log("Database tables are ready.");
  initialized = true;
};
