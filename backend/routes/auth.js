const express = require("express");
const db = require("../db");
const { generateOtp, generateToken, OTP_TTL_MINUTES, requireAuth } = require("../auth");

const router = express.Router();

// POST /api/auth/request-otp  { phone }
// DEMO ONLY: no SMS gateway is wired up, so the OTP is returned directly in
// the response (and logged server-side) instead of being sent by text.
// Replace this with a real SMS provider (e.g. MSG91, Twilio) before launch.
router.post("/request-otp", (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: "A valid 10-digit phone number is required" });
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  db.prepare("INSERT INTO otps (phone, otp, expires_at) VALUES (?, ?, ?)").run(phone, otp, expiresAt);
  console.log(`[DEMO OTP] ${phone} -> ${otp} (expires in ${OTP_TTL_MINUTES} min)`);

  res.json({
    message: "OTP generated (demo mode — no SMS sent)",
    demo_otp: otp, // remove this field once a real SMS gateway is connected
    expires_in_minutes: OTP_TTL_MINUTES,
  });
});

// POST /api/auth/verify-otp  { phone, otp, name? }
router.post("/verify-otp", (req, res) => {
  const { phone, otp, name } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ error: "phone and otp are required" });
  }

  const record = db
    .prepare(
      `SELECT * FROM otps WHERE phone = ? AND otp = ? AND consumed = 0
       ORDER BY id DESC LIMIT 1`
    )
    .get(phone, otp);

  if (!record) {
    return res.status(400).json({ error: "Invalid OTP" });
  }
  if (new Date(record.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: "OTP expired — request a new one" });
  }

  db.prepare("UPDATE otps SET consumed = 1 WHERE id = ?").run(record.id);

  let user = db.prepare("SELECT * FROM users WHERE phone = ?").get(phone);
  if (!user) {
    const info = db.prepare("INSERT INTO users (phone, name) VALUES (?, ?)").run(phone, name || null);
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(info.lastInsertRowid));
  }

  const token = generateToken();
  db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, user.id);

  res.json({ token, user: { id: user.id, phone: user.phone, name: user.name } });
});

// GET /api/auth/me — returns the current user for a valid token
router.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

module.exports = router;
