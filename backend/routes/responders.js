const express = require("express");
const db = require("../db");

const router = express.Router();

// GET /api/responders - list all responders (optionally filter by ?type=Blood)
router.get("/", (req, res) => {
  const { type } = req.query;
  const rows = type
    ? db.prepare("SELECT * FROM responders WHERE type = ? ORDER BY id DESC").all(type)
    : db.prepare("SELECT * FROM responders ORDER BY id DESC").all();
  res.json(rows);
});

// POST /api/responders - register a new donor / pharmacy / ambulance
router.post("/", (req, res) => {
  const { name, type, tag, blood_group, lat, lng } = req.body;

  if (!name || !type || !tag || lat == null || lng == null) {
    return res.status(400).json({ error: "name, type, tag, lat and lng are required" });
  }
  if (!["Blood", "Medicine", "Ambulance"].includes(type)) {
    return res.status(400).json({ error: "type must be Blood, Medicine or Ambulance" });
  }

  const stmt = db.prepare(`
    INSERT INTO responders (name, type, tag, blood_group, lat, lng, available)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  const info = stmt.run(name, type, tag, blood_group || null, lat, lng);
  const created = db.prepare("SELECT * FROM responders WHERE id = ?").get(Number(info.lastInsertRowid));
  res.status(201).json(created);
});

// PATCH /api/responders/:id - toggle availability
router.patch("/:id", (req, res) => {
  const { available } = req.body;
  const result = db
    .prepare("UPDATE responders SET available = ? WHERE id = ?")
    .run(available ? 1 : 0, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "responder not found" });
  res.json(db.prepare("SELECT * FROM responders WHERE id = ?").get(req.params.id));
});

module.exports = router;
