import mongoose, { ConnectOptions } from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

const DB = process.env.MONGO_URI?.replace(
  "<db_password>",
  process.env.DB_PASSWORD as string,
);

const clientOptions = {
  serverApi: { version: "1", strict: true, deprecationErrors: true },
};

let connectionPromise: Promise<typeof mongoose> | null = null;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  try {
    connectionPromise = mongoose.connect(
      DB as string,
      clientOptions as ConnectOptions,
    );

    await connectionPromise;
    await mongoose.connection.db?.admin().ping();
    console.log("Database connection successful");

    return mongoose;
  } catch (error) {
    console.error("Database connection error:", error);
    connectionPromise = null;
    await mongoose.disconnect();
    process.exit(1);
  }
};


export default connectDB;