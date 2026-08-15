const dotenv = require("dotenv") as typeof import("dotenv");

dotenv.config({ path: "./.env" });

let connectionPromise: Promise<void> | null = null;

const connectDB = async () => {
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    try {
      const { ensureDatabaseSchema } = require("../db/init");
      const { pool } = require("../db/pg");

      await pool.query("SELECT 1");
      await ensureDatabaseSchema();
      console.log("Postgres connection successful");
    } catch (error) {
      console.error("Database connection error:", error);
      connectionPromise = null;
      throw error;
    }
  })();

  return connectionPromise;
};

export default connectDB;
