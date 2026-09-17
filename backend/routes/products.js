const express = require("express");
const db = require("../db");

const router = express.Router();

// GET /api/products?category=Blood
router.get("/", (req, res) => {
  const { category } = req.query;
  const rows = category
    ? db.prepare("SELECT * FROM products WHERE category = ? ORDER BY id ASC").all(category)
    : db.prepare("SELECT * FROM products ORDER BY category ASC, id ASC").all();
  res.json(rows);
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "product not found" });
  res.json(row);
});

module.exports = router;
