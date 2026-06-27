import { query } from "./pg";
import { ensureSchemaSql } from "./schema";
import bcrypt from "bcryptjs";

let initialized = false;

const ensureInitialAdmin = async () => {
  const fullName = (process.env.ADMIN_FULL_NAME || "").trim();
  const email = (process.env.ADMIN_EMAIL || "").trim();
  const password = process.env.ADMIN_PASSWORD || "";
  const isActive = (process.env.ADMIN_IS_ACTIVE || "true").trim() === "true";

  if (!fullName || !email || !password) {
    console.log(
      "Skipping admin seed. Set ADMIN_FULL_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD in .env to create the initial admin.",
    );
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await query(
    `
    INSERT INTO admins (id, full_name, email, password, is_active, created_at, updated_at)
    VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW(), NOW())
    ON CONFLICT (email) DO UPDATE
    SET
      full_name = EXCLUDED.full_name,
      password = EXCLUDED.password,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()
    `,
    [fullName, email, hashedPassword, isActive],
  );

  console.log(`Initial admin ensured for ${email}.`);
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
