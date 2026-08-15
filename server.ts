const dotenv = require("dotenv") as typeof import("dotenv");

dotenv.config({ path: "./.env" });

const { createServer } = require("http");
const app = require("./api").default;
const connectDB = require("./config/db").default as () => Promise<void>;

const PORT = process.env.PORT || 4000;
const server = createServer(app);

(async () => {
  try {
    await connectDB();
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
})();
