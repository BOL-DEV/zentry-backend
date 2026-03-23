import app from "./app";
import { createServer } from "http";


const server = createServer(app);

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
