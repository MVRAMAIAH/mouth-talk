const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require("./routes/auth");

const app = express();

// MIDDLEWARE (VERY IMPORTANT)
app.use(cors());
app.use(express.json());

// MONGODB CONNECTION
mongoose.connect("mongodb://127.0.0.1:27017/mtalk")
.then(() => console.log("MongoDB connected"))
.catch(err => console.log(err));

// ROUTES
app.use("/api/auth", authRoutes);

app.listen(5000, () => {
  console.log("Server running on port 5000");
});
