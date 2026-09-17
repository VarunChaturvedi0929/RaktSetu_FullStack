const express = require("express");
const db = require("../db");
const { requireAuth } = require("../auth");

const router = express.Router();
router.use(requireAuth);

// POST /api/orders  { delivery_location, verification_note? }
// Creates an order from the user's current cart.
router.post("/", (req, res) => {
  const { delivery_location, verification_note } = req.body;
  if (!delivery_location) {
    return res.status(400).json({ error: "delivery_location is required" });
  }

  const cartItems = db
    .prepare(
      `SELECT cart_items.quantity, products.*
       FROM cart_items JOIN products ON products.id = cart_items.product_id
       WHERE cart_items.user_id = ?`
    )
    .all(req.user.id);

  if (cartItems.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  // Stock check
  for (const item of cartItems) {
    if (item.stock_qty < item.quantity) {
      return res.status(400).json({ error: `${item.name} — only ${item.stock_qty} left in stock` });
    }
  }

  const needsVerification = cartItems.some((i) => i.verification_type);
  const verificationTypes = [...new Set(cartItems.filter((i) => i.verification_type).map((i) => i.verification_type))];

  if (needsVerification && !verification_note) {
    return res.status(400).json({
      error: "This order needs verification before it can be placed",
      required_verification: verificationTypes,
    });
  }

  const total = cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const status = needsVerification ? "Pending Verification" : "Verified";

  db.exec("BEGIN");
  try {
    const orderInfo = db
      .prepare(
        `INSERT INTO orders (user_id, status, total_amount, delivery_location, needs_verification, verification_note, verified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.user.id,
        status,
        Number(total.toFixed(2)),
        delivery_location,
        needsVerification ? 1 : 0,
        verification_note || null,
        needsVerification ? null : new Date().toISOString()
      );
    const orderId = Number(orderInfo.lastInsertRowid);

    const insertItem = db.prepare(
      `INSERT INTO order_items (order_id, product_id, name, price, quantity) VALUES (?, ?, ?, ?, ?)`
    );
    const updateStock = db.prepare("UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?");

    for (const item of cartItems) {
      insertItem.run(orderId, item.id, item.name, item.price, item.quantity);
      updateStock.run(item.quantity, item.id);
    }

    db.prepare("DELETE FROM cart_items WHERE user_id = ?").run(req.user.id);
    db.exec("COMMIT");

    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(orderId);
    res.status(201).json({ ...order, items });
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
});

// GET /api/orders — current user's order history
router.get("/", (req, res) => {
  const orders = db
    .prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC")
    .all(req.user.id);
  const withItems = orders.map((o) => ({
    ...o,
    items: db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(o.id),
  }));
  res.json(withItems);
});

// GET /api/orders/:id
router.get("/:id", (req, res) => {
  const order = db
    .prepare("SELECT * FROM orders WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: "order not found" });
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
  res.json({ ...order, items });
});

// PATCH /api/orders/:id/status  { status }
// In a real system this would be restricted to pharmacist/warehouse-staff
// accounts — exposed here so the demo can walk through the full lifecycle.
router.patch("/:id/status", (req, res) => {
  const { status } = req.body;
  const allowed = ["Pending Verification", "Verified", "Dispatched", "Delivered", "Rejected"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${allowed.join(", ")}` });
  }

  const order = db
    .prepare("SELECT * FROM orders WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: "order not found" });

  const fields = { status };
  if (status === "Verified" && !order.verified_at) fields.verified_at = new Date().toISOString();
  if (status === "Delivered") fields.delivered_at = new Date().toISOString();

  const setClauses = Object.keys(fields).map((k) => `${k} = ?`).join(", ");
  db.prepare(`UPDATE orders SET ${setClauses} WHERE id = ?`).run(...Object.values(fields), order.id);

  const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id);
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
  res.json({ ...updated, items });
});

module.exports = router;
