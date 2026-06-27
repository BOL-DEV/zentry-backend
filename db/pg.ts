import { Pool, PoolClient, type QueryConfig, type QueryResultRow } from "pg";

const host =
  process.env.PGHOST ||
  process.env.DB_HOST ||
  process.env.POSTGRES_HOST ||
  process.env.RDS_HOSTNAME;
const port = Number(
  process.env.PGPORT ||
    process.env.DB_PORT ||
    process.env.POSTGRES_PORT ||
    process.env.RDS_PORT ||
    5432,
);
const database =
  process.env.PGDATABASE ||
  process.env.DB_NAME ||
  process.env.POSTGRES_DB ||
  process.env.RDS_DB_NAME;
const user =
  process.env.PGUSER ||
  process.env.DB_USER ||
  process.env.POSTGRES_USER ||
  process.env.RDS_USERNAME;
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.PG_CONNECTION_STRING;
const password =
  process.env.PGPASSWORD || process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD;
const useIamAuth =
  String(process.env.AWS_RDS_IAM_AUTH || "").toLowerCase() === "true";
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-north-1";
const ssl =
  String(process.env.PG_SSL || "").toLowerCase() === "true"
    ? { rejectUnauthorized: false }
    : undefined;

const buildIamConnectionConfig = () => {
  if (!host || !database || !user) {
    return null;
  }

  const AWS = require("aws-sdk") as typeof import("aws-sdk");
  AWS.config.update({ region });
  const signer = new AWS.RDS.Signer({
    region,
    hostname: host,
    port,
    username: user,
  });

  return {
    host,
    port,
    database,
    user,
    password: signer.getAuthToken({}),
    ssl: ssl ?? { rejectUnauthorized: false },
  };
};

const useConnectionString = Boolean(connectionString) && !useIamAuth;
const iamConnectionConfig = useIamAuth ? buildIamConnectionConfig() : null;
const passwordAuthConfig = !useConnectionString
  ? host && database && user && password
    ? { host, port, database, user, password }
    : null
  : null;

if (!useConnectionString && !iamConnectionConfig && !passwordAuthConfig) {
  console.warn(
    "Postgres config is incomplete. Set DATABASE_URL, or set PGHOST, PGPORT, PGDATABASE, PGUSER, and PGPASSWORD (or enable AWS_RDS_IAM_AUTH=true).",
  );
}

export const pool = new Pool({
  ...(useConnectionString
    ? { connectionString }
    : iamConnectionConfig
      ? iamConnectionConfig
      : passwordAuthConfig
        ? passwordAuthConfig
        : {}),
  max: Number(process.env.PG_POOL_MAX || 10),
  ssl,
});

export const query = async <T extends QueryResultRow = QueryResultRow>(
  text: string | QueryConfig<any[]>,
  params: any[] = [],
  client?: PoolClient,
) => {
  const executor = client ?? pool;
  return executor.query<T>(text as any, params as any);
};

export class PostgresSession {
  private client: PoolClient | null = null;
  private inTransaction = false;

  async startTransaction() {
    if (!this.client) {
      this.client = await pool.connect();
    }

    if (!this.inTransaction) {
      await this.client.query("BEGIN");
      this.inTransaction = true;
    }
  }

  async commitTransaction() {
    if (this.client && this.inTransaction) {
      await this.client.query("COMMIT");
      this.inTransaction = false;
    }
  }

  async abortTransaction() {
    if (this.client && this.inTransaction) {
      await this.client.query("ROLLBACK");
      this.inTransaction = false;
    }
  }

  async endSession() {
    if (this.client) {
      if (this.inTransaction) {
        await this.client.query("ROLLBACK");
        this.inTransaction = false;
      }

      this.client.release();
      this.client = null;
    }
  }

  getClient() {
    return this.client ?? undefined;
  }
}

export const startSession = async () => new PostgresSession();
