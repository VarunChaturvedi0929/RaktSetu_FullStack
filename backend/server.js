const express = require("express");
const cors = require("cors");

const { attachUser } = require("./auth");

const requestsRouter = require("./routes/requests");
const respondersRouter = require("./routes/responders");
const warehousesRouter = require("./routes/warehouses");
const authRouter = require("./routes/auth");
const productsRouter = require("./routes/products");
const cartRouter = require("./routes/cart");
const ordersRouter = require("./routes/orders");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(attachUser);

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "RaktSetu API", time: new Date().toISOString() });
});

app.get("/api/stats", (req, res) => {
  const db = require("./db");
  const totalRequests = db.prepare("SELECT COUNT(*) AS c FROM requests").get().c;
  const delivered = db.prepare("SELECT COUNT(*) AS c FROM requests WHERE status = 'Delivered'").get().c;
  const activeResponders = db.prepare("SELECT COUNT(*) AS c FROM responders WHERE available = 1").get().c;
  const activeWarehouses = db.prepare("SELECT COUNT(*) AS c FROM warehouses WHERE available = 1").get().c;
  const warehouseFulfilled = db
    .prepare("SELECT COUNT(*) AS c FROM requests WHERE fulfilled_by = 'warehouse'")
    .get().c;
  const avgResponse = db
    .prepare(
      `SELECT AVG((julianday(delivered_at) - julianday(created_at)) * 86400) AS avg_seconds
       FROM requests WHERE status = 'Delivered'`
    )
    .get().avg_seconds;

  res.json({
    total_requests: totalRequests,
    delivered,
    active_responders: activeResponders,
    active_warehouses: activeWarehouses,
    warehouse_fulfilled: warehouseFulfilled,
    avg_response_seconds: avgResponse ? Math.round(avgResponse) : null,
  });
});

app.use("/api/requests", requestsRouter);
app.use("/api/responders", respondersRouter);
app.use("/api/warehouses", warehousesRouter);
app.use("/api/auth", authRouter);
app.use("/api/products", productsRouter);
app.use("/api/cart", cartRouter);
app.use("/api/orders", ordersRouter);

app.use((req, res) => {
  res.status(404).json({ error: "not found" });
});

app.listen(PORT, () => {
  console.log(`RaktSetu API listening on port ${PORT}`);
});
