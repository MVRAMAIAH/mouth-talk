const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();
const SECRET = "MTALK_SECRET";

// SIGNUP
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "User exists" });

    const hashed = await bcrypt.hash(password, 10);
    await User.create({ name, email, password: hashed });

    res.json({ message: "User created" });
  } catch (err) {
    res.status(500).json({ error: "Signup failed" });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "Wrong password" });

    const token = jwt.sign({ id: user._id }, SECRET, { expiresIn: "1d" });
    res.json({ token });

  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

module.exports = router;
