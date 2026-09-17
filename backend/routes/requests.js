const express = require("express");
const db = require("../db");
const { findMatches, findWarehouseMatch } = require("../matching");

const router = express.Router();

// GET /api/requests - live feed, most recent first (for dashboard)
router.get("/", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const rows = db
    .prepare(
      `SELECT requests.*, responders.name AS responder_name, responders.tag AS responder_tag,
              warehouses.name AS warehouse_name
       FROM requests
       LEFT JOIN responders ON responders.id = requests.responder_id
       LEFT JOIN warehouses ON warehouses.id = requests.warehouse_id
       ORDER BY requests.id DESC
       LIMIT ?`
    )
    .all(limit);
  res.json(rows);
});

// GET /api/requests/:id
router.get("/:id", (req, res) => {
  const row = db
    .prepare(
      `SELECT requests.*, responders.name AS responder_name, responders.tag AS responder_tag,
              warehouses.name AS warehouse_name
       FROM requests
       LEFT JOIN responders ON responders.id = requests.responder_id
       LEFT JOIN warehouses ON warehouses.id = requests.warehouse_id
       WHERE requests.id = ?`
    )
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "request not found" });
  res.json(row);
});

// POST /api/requests - raise a new emergency request.
// Checks nearby warehouse stock first (Blinkit-style instant dispatch);
// falls back to live donor/pharmacy/ambulance network matching if no stock is found.
router.post("/", (req, res) => {
  const { type, blood_group, urgency, location_label, lat, lng } = req.body;

  if (!type || !urgency || !location_label || lat == null || lng == null) {
    return res
      .status(400)
      .json({ error: "type, urgency, location_label, lat and lng are required" });
  }
  if (!["Blood", "Medicine", "Ambulance"].includes(type)) {
    return res.status(400).json({ error: "type must be Blood, Medicine or Ambulance" });
  }

  const insert = db.prepare(`
    INSERT INTO requests (type, blood_group, urgency, location_label, lat, lng, status)
    VALUES (?, ?, ?, ?, ?, ?, 'Searching')
  `);
  const info = insert.run(type, blood_group || null, urgency, location_label, lat, lng);
  const requestId = Number(info.lastInsertRowid);

  // 1. Try warehouse stock first — this is the fast path.
  const warehouseMatches = findWarehouseMatch(db, { type, blood_group, lat, lng }, 3);

  if (warehouseMatches.length > 0) {
    const wh = warehouseMatches[0];
    const stock = JSON.parse(wh.blood_stock || "{}");

    // Deduct stock so subsequent requests see accurate availability.
    if (type === "Blood") {
      stock[blood_group] = Math.max(0, (stock[blood_group] || 0) - 1);
      db.prepare("UPDATE warehouses SET blood_stock = ? WHERE id = ?").run(
        JSON.stringify(stock),
        wh.id
      );
    } else if (type === "Medicine") {
      db.prepare("UPDATE warehouses SET medicine_stock = MAX(0, medicine_stock - 1) WHERE id = ?").run(
        wh.id
      );
    }

    db.prepare(
      `UPDATE requests SET status = 'Matched', fulfilled_by = 'warehouse', warehouse_id = ?, matched_at = datetime('now') WHERE id = ?`
    ).run(wh.id, requestId);

    const requestRow = db.prepare("SELECT * FROM requests WHERE id = ?").get(requestId);

    return res.status(201).json({
      request: requestRow,
      fulfilled_by: "warehouse",
      matches: warehouseMatches.map((w) => ({
        id: w.id,
        name: w.name,
        tag: "Warehouse · Instant stock",
        distance_km: Number(w.distance_km.toFixed(2)),
      })),
      selected_warehouse_id: wh.id,
    });
  }

  // 2. No warehouse stock nearby — fall back to the live responder network.
  const matches = findMatches(db, { type, blood_group, lat, lng }, 3);

  let selected = null;
  if (matches.length > 0) {
    selected = matches[0];
    db.prepare(
      `UPDATE requests SET status = 'Matched', fulfilled_by = 'network', responder_id = ?, matched_at = datetime('now') WHERE id = ?`
    ).run(selected.id, requestId);
  }

  const requestRow = db.prepare("SELECT * FROM requests WHERE id = ?").get(requestId);

  res.status(201).json({
    request: requestRow,
    fulfilled_by: "network",
    matches: matches.map((m) => ({
      id: m.id,
      name: m.name,
      tag: m.tag,
      blood_group: m.blood_group,
      distance_km: Number(m.distance_km.toFixed(2)),
    })),
    selected_responder_id: selected ? selected.id : null,
  });
});

// PATCH /api/requests/:id/status - move a request through its lifecycle
// body: { status: "On the way" | "Delivered" }
router.patch("/:id/status", (req, res) => {
  const { status } = req.body;
  const allowed = ["Searching", "Matched", "On the way", "Delivered"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${allowed.join(", ")}` });
  }

  const existing = db.prepare("SELECT * FROM requests WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "request not found" });

  if (status === "Delivered") {
    db.prepare(
      `UPDATE requests SET status = ?, delivered_at = datetime('now') WHERE id = ?`
    ).run(status, req.params.id);
  } else {
    db.prepare(`UPDATE requests SET status = ? WHERE id = ?`).run(status, req.params.id);
  }

  const updated = db.prepare("SELECT * FROM requests WHERE id = ?").get(req.params.id);

  let response_time_seconds = null;
  if (updated.status === "Delivered" && updated.created_at) {
    const created = new Date(updated.created_at + "Z").getTime();
    const delivered = new Date(updated.delivered_at + "Z").getTime();
    response_time_seconds = Math.max(0, Math.round((delivered - created) / 1000));
  }

  res.json({ ...updated, response_time_seconds });
});

module.exports = router;
