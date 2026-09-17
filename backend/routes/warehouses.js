const express = require("express");
const db = require("../db");

const router = express.Router();

// GET /api/warehouses - list all warehouses with parsed stock
router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM warehouses ORDER BY id ASC").all();
  res.json(
    rows.map((w) => ({
      ...w,
      blood_stock: JSON.parse(w.blood_stock || "{}"),
    }))
  );
});

module.exports = router;
