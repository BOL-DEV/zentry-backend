import app from "./app"
import { createServer } from "http"
import dotenv from "dotenv"
import mongoose,{ConnectOptions} from "mongoose"


dotenv.config({path: "./.env"})


const DB = process.env.MONGO_URI?.replace("<db_password>", process.env.DB_PASSWORD as string)

const clientOptions = {
  serverApi: { version: "1", strict: true, deprecationErrors: true },
};

const connectDB = async () => {
    try {
        await mongoose.connect(DB as string, clientOptions as ConnectOptions)
        await mongoose.connection.db?.admin().ping()
        console.log("Database connection successful")
    } catch (error) {
        console.error("Database connection error:", error)
        await mongoose.disconnect()
        process.exit(1)
    }
}

connectDB()





const server = createServer(app)

const PORT = process.env.PORT || 4000


server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})





