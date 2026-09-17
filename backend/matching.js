// Haversine distance in kilometers between two lat/lng points.
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Rank available responders of the right type by distance to the request.
 * For Blood requests, an exact blood-group match is boosted to the top;
 * otherwise responders are ranked purely by distance.
 */
function findMatches(db, { type, blood_group, lat, lng }, limit = 3) {
  const responders = db
    .prepare("SELECT * FROM responders WHERE type = ? AND available = 1")
    .all(type);

  const ranked = responders
    .map((r) => ({
      ...r,
      distance_km: distanceKm(lat, lng, r.lat, r.lng),
      group_match: type === "Blood" && blood_group ? r.blood_group === blood_group : true,
    }))
    .sort((a, b) => {
      if (a.group_match !== b.group_match) return a.group_match ? -1 : 1;
      return a.distance_km - b.distance_km;
    });

  return ranked.slice(0, limit);
}

/**
 * Check nearby warehouses (Blinkit-style dark stores) for immediate stock
 * before falling back to live donor/pharmacy/ambulance matching.
 * Only applies to Blood and Medicine requests — ambulances have no "stock".
 */
function findWarehouseMatch(db, { type, blood_group, lat, lng }, limit = 3) {
  if (type === "Ambulance") return [];

  const warehouses = db.prepare("SELECT * FROM warehouses WHERE available = 1").all();

  const inStock = warehouses.filter((w) => {
    const stock = JSON.parse(w.blood_stock || "{}");
    if (type === "Blood") return blood_group ? (stock[blood_group] || 0) > 0 : false;
    if (type === "Medicine") return (w.medicine_stock || 0) > 0;
    return false;
  });

  return inStock
    .map((w) => ({ ...w, distance_km: distanceKm(lat, lng, w.lat, w.lng) }))
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, limit);
}

module.exports = { distanceKm, findMatches, findWarehouseMatch };
