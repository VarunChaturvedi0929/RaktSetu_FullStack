// Base URL for the RaktSetu backend API.
// Locally this falls back to http://localhost:5000.
// In production, set VITE_API_URL in your hosting provider's env vars
// (see README.md) to point at your deployed backend, e.g.
// https://raktsetu-backend.onrender.com
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

async function request(path, options = {}) {
  const token = localStorage.getItem("medxpress_token");
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed with status ${res.status}`);
    err.data = body;
    throw err;
  }
  return res.json();
}

export const api = {
  getStats: () => request("/api/stats"),
  listRequests: (limit = 10) => request(`/api/requests?limit=${limit}`),
  createRequest: (payload) =>
    request("/api/requests", { method: "POST", body: JSON.stringify(payload) }),
  updateRequestStatus: (id, status) =>
    request(`/api/requests/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  listResponders: (type) => request(`/api/responders${type ? `?type=${type}` : ""}`),

  // ---- Storefront: auth ----
  requestOtp: (phone) => request("/api/auth/request-otp", { method: "POST", body: JSON.stringify({ phone }) }),
  verifyOtp: (phone, otp, name) =>
    request("/api/auth/verify-otp", { method: "POST", body: JSON.stringify({ phone, otp, name }) }),
  me: () => request("/api/auth/me"),

  // ---- Storefront: products ----
  listProducts: (category) => request(`/api/products${category ? `?category=${category}` : ""}`),

  // ---- Storefront: cart ----
  getCart: () => request("/api/cart"),
  addToCart: (product_id, quantity) =>
    request("/api/cart", { method: "POST", body: JSON.stringify({ product_id, quantity }) }),
  updateCartItem: (productId, quantity) =>
    request(`/api/cart/${productId}`, { method: "PATCH", body: JSON.stringify({ quantity }) }),
  removeCartItem: (productId) => request(`/api/cart/${productId}`, { method: "DELETE" }),

  // ---- Storefront: orders ----
  checkout: (delivery_location, verification_note) =>
    request("/api/orders", { method: "POST", body: JSON.stringify({ delivery_location, verification_note }) }),
  listOrders: () => request("/api/orders"),
  getOrder: (id) => request(`/api/orders/${id}`),
  updateOrderStatus: (id, status) =>
    request(`/api/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
};

export default api;
