const db = require("./db");

// Approximate real coordinates for Ranchi localities.
const responders = [
  { name: "Rohit Sharma", type: "Blood", tag: "Verified Donor", blood_group: "O+", lat: 23.3745, lng: 85.3346 }, // Kanke
  { name: "Priya Mahato", type: "Blood", tag: "Verified Donor", blood_group: "O+", lat: 23.3629, lng: 85.3378 }, // Bariatu
  { name: "Ankit Kumar", type: "Blood", tag: "Verified Donor", blood_group: "A+", lat: 23.3441, lng: 85.3096 }, // Doranda
  { name: "Sneha Roy", type: "Blood", tag: "Verified Donor", blood_group: "B+", lat: 23.3569, lng: 85.3346 }, // Lalpur
  { name: "City Blood Bank", type: "Blood", tag: "Blood Bank", blood_group: "AB+", lat: 23.3729, lng: 85.3252 }, // Near Kanke Rd
  { name: "Apollo Pharmacy", type: "Medicine", tag: "24x7 Pharmacy", blood_group: null, lat: 23.3557, lng: 85.3247 }, // Hinoo
  { name: "MedPlus Argora", type: "Medicine", tag: "Pharmacy", blood_group: null, lat: 23.3812, lng: 85.3450 }, // Argora
  { name: "Wellness Forever", type: "Medicine", tag: "Pharmacy", blood_group: null, lat: 23.3448, lng: 85.3103 }, // Doranda
  { name: "Rapid Care Unit 4", type: "Ambulance", tag: "ALS Ambulance", blood_group: null, lat: 23.3812, lng: 85.3450 }, // Argora
  { name: "City Hospital EMS", type: "Ambulance", tag: "BLS Ambulance", blood_group: null, lat: 23.3441, lng: 85.3096 }, // Doranda
  { name: "Sanjeevani Unit 2", type: "Ambulance", tag: "ALS Ambulance", blood_group: null, lat: 23.3629, lng: 85.3378 }, // Bariatu
];

const warehouses = [
  {
    name: "RaktSetu Warehouse — Kanke",
    lat: 23.3729,
    lng: 85.3252,
    blood_stock: JSON.stringify({ "O+": 8, "O-": 2, "A+": 5, "A-": 1, "B+": 4, "B-": 0, "AB+": 2, "AB-": 0 }),
    medicine_stock: 40,
  },
  {
    name: "RaktSetu Warehouse — Doranda",
    lat: 23.3441,
    lng: 85.3096,
    blood_stock: JSON.stringify({ "O+": 3, "O-": 0, "A+": 0, "A-": 0, "B+": 6, "B-": 1, "AB+": 0, "AB-": 0 }),
    medicine_stock: 15,
  },
  {
    name: "RaktSetu Warehouse — Argora",
    lat: 23.3812,
    lng: 85.345,
    blood_stock: JSON.stringify({ "O+": 0, "O-": 0, "A+": 2, "A-": 0, "B+": 0, "B-": 0, "AB+": 1, "AB-": 0 }),
    medicine_stock: 0,
  },
];

// node:sqlite has no .transaction() helper (unlike better-sqlite3),
// so we wrap manually with BEGIN/COMMIT/ROLLBACK.
function runInTransaction(fn) {
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

runInTransaction(() => {
  db.prepare("DELETE FROM requests").run();
  db.prepare("DELETE FROM responders").run();
  const insertResponder = db.prepare(`
    INSERT INTO responders (name, type, tag, blood_group, lat, lng, available)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  for (const r of responders) {
    insertResponder.run(r.name, r.type, r.tag, r.blood_group || null, r.lat, r.lng);
  }
});
console.log(`Seeded ${responders.length} responders into raktsetu.db`);

runInTransaction(() => {
  db.prepare("DELETE FROM warehouses").run();
  const insertWarehouse = db.prepare(`
    INSERT INTO warehouses (name, lat, lng, blood_stock, medicine_stock, available)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  for (const w of warehouses) {
    insertWarehouse.run(w.name, w.lat, w.lng, w.blood_stock, w.medicine_stock);
  }
});
console.log(`Seeded ${warehouses.length} warehouses into raktsetu.db`);

const products = [
  // Blood — price is a processing + delivery fee (blood sale is illegal in India; blood banks
  // legally charge only a capped processing fee, never a price for the blood itself).
  { name: "O+ Blood Unit", category: "Blood", subtype: "O+", unit: "unit (450ml)", price: 250, stock_qty: 12, icon: "🩸", verification_type: "hospital_reference", eta_minutes: 25 },
  { name: "A+ Blood Unit", category: "Blood", subtype: "A+", unit: "unit (450ml)", price: 250, stock_qty: 6, icon: "🩸", verification_type: "hospital_reference", eta_minutes: 25 },
  { name: "B+ Blood Unit", category: "Blood", subtype: "B+", unit: "unit (450ml)", price: 250, stock_qty: 5, icon: "🩸", verification_type: "hospital_reference", eta_minutes: 30 },
  { name: "AB+ Blood Unit", category: "Blood", subtype: "AB+", unit: "unit (450ml)", price: 250, stock_qty: 2, icon: "🩸", verification_type: "hospital_reference", eta_minutes: 35 },
  { name: "O- Blood Unit", category: "Blood", subtype: "O-", unit: "unit (450ml)", price: 280, stock_qty: 2, icon: "🩸", verification_type: "hospital_reference", eta_minutes: 40 },

  // Oxygen — ID proof required (prevents hoarding/black-market resale, a real issue during shortages).
  { name: "Oxygen Cylinder — 10L (Home use)", category: "Oxygen", subtype: "10L", unit: "cylinder", price: 899, stock_qty: 18, icon: "🫁", verification_type: "id_proof", eta_minutes: 20 },
  { name: "Oxygen Cylinder — 40L (Clinical)", category: "Oxygen", subtype: "40L", unit: "cylinder", price: 2199, stock_qty: 7, icon: "🫁", verification_type: "id_proof", eta_minutes: 25 },
  { name: "Oxygen Concentrator (5L/min)", category: "Oxygen", subtype: "Concentrator", unit: "device", price: 3499, stock_qty: 4, icon: "🫁", verification_type: "id_proof", eta_minutes: 30 },

  // Medicines — Schedule H drugs require a prescription; OTC items don't.
  { name: "Paracetamol 650mg (Strip of 10)", category: "Medicine", subtype: "OTC", unit: "strip of 10", price: 30, stock_qty: 120, icon: "💊", verification_type: null, eta_minutes: 15 },
  { name: "ORS Sachets (Pack of 5)", category: "Medicine", subtype: "OTC", unit: "pack of 5", price: 45, stock_qty: 80, icon: "💊", verification_type: null, eta_minutes: 15 },
  { name: "Azithromycin 500mg (Strip of 3)", category: "Medicine", subtype: "Rx", unit: "strip of 3", price: 95, stock_qty: 40, icon: "💊", verification_type: "prescription", eta_minutes: 20 },
  { name: "Insulin Injection (Vial)", category: "Medicine", subtype: "Rx", unit: "vial", price: 320, stock_qty: 15, icon: "💊", verification_type: "prescription", eta_minutes: 20 },
  { name: "Emergency IV Fluid (Normal Saline)", category: "Medicine", subtype: "Rx", unit: "500ml bottle", price: 60, stock_qty: 50, icon: "💊", verification_type: "prescription", eta_minutes: 20 },
];

runInTransaction(() => {
  db.prepare("DELETE FROM order_items").run();
  db.prepare("DELETE FROM orders").run();
  db.prepare("DELETE FROM cart_items").run();
  db.prepare("DELETE FROM products").run();
  const insertProduct = db.prepare(`
    INSERT INTO products (name, category, subtype, unit, price, stock_qty, icon, verification_type, eta_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const p of products) {
    insertProduct.run(p.name, p.category, p.subtype, p.unit, p.price, p.stock_qty, p.icon, p.verification_type, p.eta_minutes);
  }
});
console.log(`Seeded ${products.length} products into raktsetu.db`);
