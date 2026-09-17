const crypto = require("crypto");
const db = require("./db");

const OTP_TTL_MINUTES = 5;

function generateOtp() {
  return String(Math.floor(1000 + Math.random() * 9000)); // 4-digit
}

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

/**
 * Express middleware: reads `Authorization: Bearer <token>` and attaches
 * req.user if the session is valid. Does NOT reject the request if missing —
 * routes that require auth should check req.user themselves (see requireAuth).
 */
function attachUser(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (token) {
    const session = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
    if (session) {
      req.user = db.prepare("SELECT id, phone, name FROM users WHERE id = ?").get(session.user_id);
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Login required. Send an Authorization: Bearer <token> header." });
  }
  next();
}

module.exports = { generateOtp, generateToken, attachUser, requireAuth, OTP_TTL_MINUTES };
