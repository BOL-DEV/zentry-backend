import { query } from "./pg";
import { ensureSchemaSql } from "./schema";
import bcrypt from "bcryptjs";

let initialized = false;

const ensureInitialAdmin = async () => {
  const fullName = (process.env.ADMIN_FULL_NAME || "").trim();
  const email = (process.env.ADMIN_EMAIL || "").trim();
  const password = process.env.ADMIN_PASSWORD || "";

  if (!fullName || !email || !password) {
    console.log(
      "Skipping admin seed. Set ADMIN_FULL_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD in .env to create the initial admin.",
    );
    return;
  }

  const existingAdmin = await query(
    "SELECT id FROM admins WHERE email = $1 LIMIT 1",
    [email],
  );

  if (existingAdmin.rowCount) {
    console.log(`Admin seed skipped. Admin already exists for ${email}.`);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await query(
    `
    INSERT INTO admins (id, full_name, email, password, is_active, created_at, updated_at)
    VALUES (gen_random_uuid()::text, $1, $2, $3, TRUE, NOW(), NOW())
    `,
    [fullName, email, hashedPassword],
  );

  console.log(`Initial admin seeded for ${email}.`);
};

export const ensureDatabaseSchema = async () => {
  if (initialized) {
    return;
  }

  console.log("Ensuring database tables exist...");
  await query(ensureSchemaSql);
  console.log("Database tables are ready.");
  await ensureInitialAdmin();
  initialized = true;
};
