import express from "express"
import organizerRoute from "./routes/organizerRoute"
import morgan from "morgan" 
import { globalErrorHandler } from "./middlewares/errorMiddleware"


const app = express()

app.use(morgan("dev"))       


app.use(express.json())



app.use("/api/v1/organizer",organizerRoute)

app.use(globalErrorHandler)




export default app