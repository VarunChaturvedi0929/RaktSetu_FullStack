import { useEffect, useState } from "react";
import api from "./api";
import "./Storefront.css";

const CATEGORIES = [
  { key: "Blood", label: "Blood", icon: "🩸" },
  { key: "Oxygen", label: "Oxygen", icon: "🫁" },
  { key: "Medicine", label: "Medicine", icon: "💊" },
];

const VERIFICATION_LABELS = {
  hospital_reference: "Hospital / patient reference required",
  id_proof: "ID proof required at delivery",
  prescription: "Valid prescription required",
};

function loadUser() {
  try {
    const raw = localStorage.getItem("medxpress_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function Storefront() {
  const [user, setUser] = useState(loadUser());
  const [showLogin, setShowLogin] = useState(false);

  const [category, setCategory] = useState("Blood");
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [cart, setCart] = useState({ items: [], total: 0 });
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderResult, setOrderResult] = useState(null);
  const [cartError, setCartError] = useState("");

  const [orders, setOrders] = useState([]);
  const [showOrders, setShowOrders] = useState(false);

  useEffect(() => {
    setLoadingProducts(true);
    api
      .listProducts(category)
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false));
  }, [category]);

  useEffect(() => {
    if (user) refreshCart();
  }, [user]);

  function refreshCart() {
    api.getCart().then(setCart).catch(() => {});
  }

  function refreshOrders() {
    api.listOrders().then(setOrders).catch(() => {});
  }

  function handleLoggedIn(u, token) {
    localStorage.setItem("medxpress_token", token);
    localStorage.setItem("medxpress_user", JSON.stringify(u));
    setUser(u);
    setShowLogin(false);
  }

  function logout() {
    localStorage.removeItem("medxpress_token");
    localStorage.removeItem("medxpress_user");
    setUser(null);
    setCart({ items: [], total: 0 });
  }

  async function handleAdd(product) {
    if (!user) {
      setShowLogin(true);
      return;
    }
    setCartError("");
    try {
      const existing = cart.items.find((i) => i.product_id === product.id || i.id === product.id);
      const nextQty = existing ? existing.quantity + 1 : 1;
      const updated = await api.addToCart(product.id, nextQty);
      setCart(updated);
    } catch (e) {
      setCartError(e.message);
    }
  }

  async function handleQtyChange(productId, quantity) {
    setCartError("");
    try {
      const updated = await api.updateCartItem(productId, quantity);
      setCart(updated);
    } catch (e) {
      setCartError(e.message);
    }
  }

  const cartCount = cart.items.reduce((n, i) => n + i.quantity, 0);
  const needsVerification = cart.items.some((i) => i.verification_type);
  const verificationTypesNeeded = [...new Set(cart.items.filter((i) => i.verification_type).map((i) => i.verification_type))];

  return (
    <div className="sf-page">
      <header className="sf-nav">
        <div className="sf-brand">
          <span className="sf-dot" /> MedXpress
        </div>
        <div className="sf-nav-right">
          {user ? (
            <>
              <button className="sf-link-btn" onClick={() => { setShowOrders(true); refreshOrders(); }}>
                My Orders
              </button>
              <span className="sf-user-chip">👤 {user.name || user.phone}</span>
              <button className="sf-link-btn" onClick={logout}>Logout</button>
            </>
          ) : (
            <button className="sf-btn sf-btn-ghost" onClick={() => setShowLogin(true)}>Login</button>
          )}
          <button className="sf-cart-btn" onClick={() => setShowCart(true)}>
            🛒 Cart{cartCount > 0 && <span className="sf-cart-count">{cartCount}</span>}
          </button>
        </div>
      </header>

      <section className="sf-hero">
        <div className="sf-hero-text">
          <div className="sf-eyebrow">Emergency essentials, delivered fast</div>
          <h1>Blood, oxygen &amp; medicine — <em>on demand.</em></h1>
          <p>Verified stock. Real delivery ETAs. Every regulated item checked before it ships.</p>
        </div>
      </section>

      <div className="sf-category-bar">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            className={`sf-cat-chip ${category === c.key ? "active" : ""}`}
            onClick={() => setCategory(c.key)}
          >
            <span className="sf-cat-icon">{c.icon}</span> {c.label}
          </button>
        ))}
      </div>

      <div className="sf-product-grid">
        {loadingProducts && <p className="sf-muted">Loading products…</p>}
        {!loadingProducts && products.length === 0 && <p className="sf-muted">No products in this category yet.</p>}
        {products.map((p) => {
          const inCart = cart.items.find((i) => i.product_id === p.id || i.id === p.id);
          return (
            <div className="sf-product-card" key={p.id}>
              <div className="sf-product-icon">{p.icon}</div>
              <div className="sf-product-eta">{p.eta_minutes} min</div>
              <h3>{p.name}</h3>
              <div className="sf-product-unit">{p.unit}</div>
              {p.verification_type && (
                <div className="sf-verify-badge">🛡 {VERIFICATION_LABELS[p.verification_type]}</div>
              )}
              <div className="sf-product-footer">
                <div className="sf-price">
                  ₹{p.price}
                  {p.category === "Blood" && <span className="sf-price-note">processing + delivery</span>}
                </div>
                {inCart ? (
                  <div className="sf-stepper">
                    <button onClick={() => handleQtyChange(p.id, inCart.quantity - 1)}>−</button>
                    <span>{inCart.quantity}</span>
                    <button onClick={() => handleQtyChange(p.id, inCart.quantity + 1)}>+</button>
                  </div>
                ) : (
                  <button className="sf-add-btn" onClick={() => handleAdd(p)} disabled={p.stock_qty === 0}>
                    {p.stock_qty === 0 ? "Out of stock" : "Add"}
                  </button>
                )}
              </div>
              <div className="sf-stock-line">{p.stock_qty} left in nearby warehouse</div>
            </div>
          );
        })}
      </div>

      {showLogin && (
        <LoginModal onClose={() => setShowLogin(false)} onLoggedIn={handleLoggedIn} />
      )}

      {showCart && (
        <CartDrawer
          cart={cart}
          error={cartError}
          onClose={() => setShowCart(false)}
          onQtyChange={handleQtyChange}
          onRemove={(id) => api.removeCartItem(id).then(setCart)}
          onCheckout={() => {
            setShowCart(false);
            setShowCheckout(true);
          }}
          needsVerification={needsVerification}
          verificationTypesNeeded={verificationTypesNeeded}
        />
      )}

      {showCheckout && (
        <CheckoutModal
          cart={cart}
          needsVerification={needsVerification}
          verificationTypesNeeded={verificationTypesNeeded}
          onClose={() => setShowCheckout(false)}
          onPlaced={(order) => {
            setShowCheckout(false);
            setOrderResult(order);
            setCart({ items: [], total: 0 });
          }}
        />
      )}

      {orderResult && (
        <OrderStatusModal
          order={orderResult}
          onClose={() => setOrderResult(null)}
          onUpdated={setOrderResult}
        />
      )}

      {showOrders && (
        <OrdersModal orders={orders} onClose={() => setShowOrders(false)} onOpenOrder={(o) => { setShowOrders(false); setOrderResult(o); }} />
      )}
    </div>
  );
}

function LoginModal({ onClose, onLoggedIn }) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [stage, setStage] = useState("phone"); // phone | otp
  const [demoOtp, setDemoOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendOtp() {
    setError("");
    if (!/^\d{10}$/.test(phone)) return setError("Enter a valid 10-digit phone number");
    setBusy(true);
    try {
      const res = await api.requestOtp(phone);
      setDemoOtp(res.demo_otp);
      setStage("otp");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError("");
    setBusy(true);
    try {
      const res = await api.verifyOtp(phone, otp, name);
      onLoggedIn(res.user, res.token);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sf-overlay" onClick={onClose}>
      <div className="sf-modal" onClick={(e) => e.stopPropagation()}>
        <button className="sf-modal-close" onClick={onClose}>✕</button>
        <h2>Login to MedXpress</h2>

        {stage === "phone" && (
          <>
            <label className="sf-field-label">Phone number</label>
            <input
              className="sf-input"
              type="tel"
              placeholder="10-digit mobile number"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
            {error && <p className="sf-error">{error}</p>}
            <button className="sf-btn sf-btn-primary" onClick={sendOtp} disabled={busy}>
              {busy ? "Sending…" : "Send OTP"}
            </button>
          </>
        )}

        {stage === "otp" && (
          <>
            <p className="sf-demo-note">
              Demo mode — no real SMS is sent. Your OTP: <strong>{demoOtp}</strong>
            </p>
            <label className="sf-field-label">Your name (first time only)</label>
            <input className="sf-input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="sf-field-label">Enter OTP</label>
            <input
              className="sf-input"
              placeholder="4-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
            {error && <p className="sf-error">{error}</p>}
            <button className="sf-btn sf-btn-primary" onClick={verify} disabled={busy}>
              {busy ? "Verifying…" : "Verify & Continue"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CartDrawer({ cart, error, onClose, onQtyChange, onRemove, onCheckout, needsVerification, verificationTypesNeeded }) {
  return (
    <div className="sf-overlay" onClick={onClose}>
      <div className="sf-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="sf-drawer-header">
          <h2>Your Cart</h2>
          <button className="sf-modal-close" onClick={onClose}>✕</button>
        </div>

        {cart.items.length === 0 && <p className="sf-muted">Your cart is empty.</p>}

        <div className="sf-drawer-items">
          {cart.items.map((i) => (
            <div className="sf-cart-row" key={i.product_id || i.id}>
              <span className="sf-cart-icon">{i.icon}</span>
              <div className="sf-cart-info">
                <strong>{i.name}</strong>
                <span>₹{i.price} × {i.quantity}</span>
              </div>
              <div className="sf-stepper small">
                <button onClick={() => onQtyChange(i.product_id || i.id, i.quantity - 1)}>−</button>
                <span>{i.quantity}</span>
                <button onClick={() => onQtyChange(i.product_id || i.id, i.quantity + 1)}>+</button>
              </div>
              <button className="sf-remove-btn" onClick={() => onRemove(i.product_id || i.id)}>🗑</button>
            </div>
          ))}
        </div>

        {error && <p className="sf-error">{error}</p>}

        {needsVerification && cart.items.length > 0 && (
          <div className="sf-verify-notice">
            🛡 This order needs verification at checkout: {verificationTypesNeeded.map((v) => VERIFICATION_LABELS[v]).join(", ")}
          </div>
        )}

        {cart.items.length > 0 && (
          <div className="sf-drawer-footer">
            <div className="sf-total-row">
              <span>Total</span>
              <strong>₹{cart.total}</strong>
            </div>
            <button className="sf-btn sf-btn-primary sf-full" onClick={onCheckout}>
              Proceed to Checkout →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CheckoutModal({ cart, needsVerification, verificationTypesNeeded, onClose, onPlaced }) {
  const [location, setLocation] = useState("");
  const [verificationNote, setVerificationNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function placeOrder() {
    setError("");
    if (!location.trim()) return setError("Delivery location is required");
    if (needsVerification && !verificationNote.trim()) {
      return setError("Please provide the verification details below before placing this order");
    }
    setBusy(true);
    try {
      const order = await api.checkout(location, verificationNote || undefined);
      onPlaced(order);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sf-overlay" onClick={onClose}>
      <div className="sf-modal" onClick={(e) => e.stopPropagation()}>
        <button className="sf-modal-close" onClick={onClose}>✕</button>
        <h2>Checkout</h2>

        <label className="sf-field-label">Delivery location</label>
        <input
          className="sf-input"
          placeholder="e.g. Kanke Road, Ranchi"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />

        {needsVerification && (
          <>
            <div className="sf-verify-notice">
              🛡 This order contains regulated items: {verificationTypesNeeded.map((v) => VERIFICATION_LABELS[v]).join(", ")}.
              In production this step would collect an uploaded prescription / hospital reference / ID scan for pharmacist
              or warehouse-staff review. For this demo, enter a reference note instead.
            </div>
            <label className="sf-field-label">Verification reference</label>
            <textarea
              className="sf-input sf-textarea"
              placeholder="e.g. Ranchi Sadar Hospital ref #RH-4521, patient name, doctor's name…"
              value={verificationNote}
              onChange={(e) => setVerificationNote(e.target.value)}
            />
          </>
        )}

        <div className="sf-total-row">
          <span>Total</span>
          <strong>₹{cart.total}</strong>
        </div>

        {error && <p className="sf-error">{error}</p>}
        <button className="sf-btn sf-btn-primary sf-full" onClick={placeOrder} disabled={busy}>
          {busy ? "Placing order…" : "Place Order"}
        </button>
      </div>
    </div>
  );
}

const ORDER_STAGES = ["Pending Verification", "Verified", "Dispatched", "Delivered"];

function OrderStatusModal({ order, onClose, onUpdated }) {
  const [busy, setBusy] = useState(false);
  const currentIndex = ORDER_STAGES.indexOf(order.status);

  async function advance() {
    const next = ORDER_STAGES[currentIndex + 1];
    if (!next) return;
    setBusy(true);
    try {
      const updated = await api.updateOrderStatus(order.id, next);
      onUpdated(updated);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sf-overlay" onClick={onClose}>
      <div className="sf-modal" onClick={(e) => e.stopPropagation()}>
        <button className="sf-modal-close" onClick={onClose}>✕</button>
        <h2>Order #{order.id}</h2>
        <p className="sf-muted">Delivering to {order.delivery_location}</p>

        <div className="sf-order-timeline">
          {ORDER_STAGES.map((stage, i) => (
            <div className={`sf-order-step ${i <= currentIndex ? "done" : ""}`} key={stage}>
              <div className="sf-order-dot">{i <= currentIndex ? "✓" : i + 1}</div>
              <span>{stage}</span>
            </div>
          ))}
        </div>

        {order.needs_verification === 1 && order.status === "Pending Verification" && (
          <p className="sf-verify-notice">🛡 Waiting on pharmacist/warehouse-staff to confirm: {order.verification_note}</p>
        )}

        <div className="sf-order-items">
          {order.items.map((i) => (
            <div className="sf-order-item-row" key={i.id}>
              <span>{i.name} × {i.quantity}</span>
              <span>₹{(i.price * i.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="sf-total-row">
          <span>Total</span>
          <strong>₹{order.total_amount}</strong>
        </div>

        {currentIndex < ORDER_STAGES.length - 1 && (
          <button className="sf-btn sf-btn-primary sf-full" onClick={advance} disabled={busy}>
            {busy ? "Updating…" : `Simulate: mark "${ORDER_STAGES[currentIndex + 1]}"`}
          </button>
        )}
        <p className="sf-demo-note">
          In production this step is triggered by pharmacist/warehouse staff, not the customer — exposed here so the demo can walk through the full lifecycle.
        </p>
      </div>
    </div>
  );
}

function OrdersModal({ orders, onClose, onOpenOrder }) {
  return (
    <div className="sf-overlay" onClick={onClose}>
      <div className="sf-modal" onClick={(e) => e.stopPropagation()}>
        <button className="sf-modal-close" onClick={onClose}>✕</button>
        <h2>My Orders</h2>
        {orders.length === 0 && <p className="sf-muted">No orders yet.</p>}
        <div className="sf-orders-list">
          {orders.map((o) => (
            <div className="sf-order-summary-row" key={o.id} onClick={() => onOpenOrder(o)}>
              <div>
                <strong>Order #{o.id}</strong>
                <span className="sf-muted"> · {o.items.length} item(s) · ₹{o.total_amount}</span>
              </div>
              <span className={`sf-status-pill status-${o.status.replace(/\s/g, "-").toLowerCase()}`}>{o.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
