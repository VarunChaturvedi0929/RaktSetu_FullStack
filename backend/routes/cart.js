const express = require("express");
const db = require("../db");
const { requireAuth } = require("../auth");

const router = express.Router();
router.use(requireAuth);

function getCart(userId) {
  return db
    .prepare(
      `SELECT cart_items.id, cart_items.quantity, products.*
       FROM cart_items
       JOIN products ON products.id = cart_items.product_id
       WHERE cart_items.user_id = ?
       ORDER BY cart_items.id ASC`
    )
    .all(userId);
}

// GET /api/cart
router.get("/", (req, res) => {
  const items = getCart(req.user.id);
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  res.json({ items, total: Number(total.toFixed(2)) });
});

// POST /api/cart  { product_id, quantity }
router.post("/", (req, res) => {
  const { product_id, quantity } = req.body;
  const qty = Math.max(1, Number(quantity) || 1);

  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(product_id);
  if (!product) return res.status(404).json({ error: "product not found" });
  if (product.stock_qty < qty) {
    return res.status(400).json({ error: `Only ${product.stock_qty} left in stock` });
  }

  const existing = db
    .prepare("SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?")
    .get(req.user.id, product_id);

  if (existing) {
    db.prepare("UPDATE cart_items SET quantity = ? WHERE id = ?").run(qty, existing.id);
  } else {
    db.prepare("INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)").run(
      req.user.id,
      product_id,
      qty
    );
  }

  const items = getCart(req.user.id);
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  res.status(201).json({ items, total: Number(total.toFixed(2)) });
});

// PATCH /api/cart/:productId  { quantity }
router.patch("/:productId", (req, res) => {
  const { quantity } = req.body;
  const qty = Number(quantity);

  if (qty <= 0) {
    db.prepare("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?").run(
      req.user.id,
      req.params.productId
    );
  } else {
    const result = db
      .prepare("UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?")
      .run(qty, req.user.id, req.params.productId);
    if (result.changes === 0) return res.status(404).json({ error: "item not in cart" });
  }

  const items = getCart(req.user.id);
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  res.json({ items, total: Number(total.toFixed(2)) });
});

// DELETE /api/cart/:productId
router.delete("/:productId", (req, res) => {
  db.prepare("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?").run(
    req.user.id,
    req.params.productId
  );
  const items = getCart(req.user.id);
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  res.json({ items, total: Number(total.toFixed(2)) });
});

module.exports = router;
