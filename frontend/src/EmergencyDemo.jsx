import { useEffect, useRef, useState } from "react";
import api from "./api";
import "./App.css";

// Ranchi localities with real approximate coordinates — used since free-text
// geocoding needs a paid API key. Swap this for a geocoding service later.
const LOCATIONS = [
  { label: "Kanke Road, Ranchi", lat: 23.3745, lng: 85.3346 },
  { label: "Argora, Ranchi", lat: 23.3812, lng: 85.345 },
  { label: "Doranda, Ranchi", lat: 23.3441, lng: 85.3096 },
  { label: "Lalpur, Ranchi", lat: 23.3569, lng: 85.3346 },
  { label: "Hinoo, Ranchi", lat: 23.3557, lng: 85.3247 },
  { label: "Bariatu, Ranchi", lat: 23.3629, lng: 85.3378 },
];

const BLOOD_GROUPS = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

function timeAgo(iso) {
  const then = new Date(iso + "Z").getTime();
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return `${Math.floor(diffSec / 3600)}h ago`;
}

const STATUS_COLOR = {
  Searching: "#C81E3A",
  Matched: "#E8A63C",
  "On the way": "#E8A63C",
  Delivered: "#2E9E5B",
};

export default function EmergencyDemo() {
  const [reqType, setReqType] = useState("Blood");
  const [bloodGroup, setBloodGroup] = useState("O+");
  const [urgency, setUrgency] = useState("Critical");
  const [location, setLocation] = useState(LOCATIONS[0].label);

  const [stage, setStage] = useState("idle"); // idle | matching | onway | delivered | error
  const [activeRequest, setActiveRequest] = useState(null);
  const [matches, setMatches] = useState([]);
  const [fulfilledBy, setFulfilledBy] = useState(null); // "warehouse" | "network"
  const [responseTime, setResponseTime] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [liveFeed, setLiveFeed] = useState([]);
  const [stats, setStats] = useState({
    total_requests: 0,
    delivered: 0,
    active_responders: 0,
    active_warehouses: 0,
    warehouse_fulfilled: 0,
    avg_response_seconds: null,
  });
  const [apiOffline, setApiOffline] = useState(false);

  const pollRef = useRef(null);

  async function refreshFeedAndStats() {
    try {
      const [feed, s] = await Promise.all([api.listRequests(6), api.getStats()]);
      setLiveFeed(feed);
      setStats(s);
      setApiOffline(false);
    } catch (e) {
      setApiOffline(true);
    }
  }

  useEffect(() => {
    refreshFeedAndStats();
    pollRef.current = setInterval(refreshFeedAndStats, 6000);
    return () => clearInterval(pollRef.current);
  }, []);

  async function runDemo() {
    setErrorMsg("");
    setStage("matching");
    setMatches([]);
    setFulfilledBy(null);
    setActiveRequest(null);
    setResponseTime(null);

    const loc = LOCATIONS.find((l) => l.label === location) || LOCATIONS[0];

    try {
      const {
        request,
        matches: found,
        fulfilled_by,
        selected_responder_id,
        selected_warehouse_id,
      } = await api.createRequest({
        type: reqType,
        blood_group: reqType === "Blood" ? bloodGroup : null,
        urgency,
        location_label: loc.label,
        lat: loc.lat,
        lng: loc.lng,
      });

      setActiveRequest(request);
      setMatches(found);
      setFulfilledBy(fulfilled_by);

      const wasMatched = fulfilled_by === "warehouse" ? selected_warehouse_id : selected_responder_id;

      if (!wasMatched) {
        setStage("error");
        setErrorMsg(
          "No warehouse stock or available responders of this type yet — try registering one via the API, or pick a different request type."
        );
        return;
      }

      // Give the UI a moment to show the matches before moving on.
      await new Promise((r) => setTimeout(r, 1400));
      await api.updateRequestStatus(request.id, "On the way");
      setStage("onway");

      // Simulate transit time, then mark delivered (real elapsed time is logged server-side).
      await new Promise((r) => setTimeout(r, 3500));
      const delivered = await api.updateRequestStatus(request.id, "Delivered");
      setResponseTime(delivered.response_time_seconds);
      setStage("delivered");
      refreshFeedAndStats();
    } catch (e) {
      setStage("error");
      setErrorMsg(e.message || "Something went wrong talking to the RaktSetu API.");
    }
  }

  function resetDemo() {
    setStage("idle");
    setActiveRequest(null);
    setMatches([]);
    setFulfilledBy(null);
    setResponseTime(null);
    setErrorMsg("");
  }

  return (
    <div className="page">
      <header className="nav">
        <div className="brand">
          <span className="dot" /> RaktSetu
        </div>
        <div className={`live-pill ${apiOffline ? "offline" : ""}`}>
          <span className="blip" />
          {apiOffline ? "API offline — start the backend" : `${stats.active_responders} responders live`}
        </div>
      </header>

      <section className="hero wrap">
        <div>
          <div className="eyebrow">Emergency medical response network</div>
          <h1>
            Every minute matters.
            <br />
            <em>RaktSetu</em> closes the gap.
          </h1>
          <p className="lede">
            A live, working platform that checks pre-stocked local warehouses first for instant
            dispatch — Blinkit-style — and falls back to matching nearby donors, pharmacies and
            ambulances when stock isn't available.
          </p>
        </div>

        <div className="feed-card">
          <h3>Live requests</h3>
          {liveFeed.length === 0 && <p className="empty">No requests yet — raise one below.</p>}
          {liveFeed.map((f) => (
            <div className="feed-item" key={f.id}>
              <span className="feed-dot" style={{ background: STATUS_COLOR[f.status] }} />
              <div className="feed-txt">
                <strong>
                  {f.type === "Blood" && f.blood_group ? `${f.blood_group} blood` : f.type} needed
                </strong>
                <span>
                  {f.location_label} · {timeAgo(f.created_at)}
                </span>
              </div>
              <span
                className="status-tag"
                style={{
                  background: `${STATUS_COLOR[f.status]}22`,
                  color: STATUS_COLOR[f.status],
                }}
              >
                {f.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="stats">
        <div className="wrap stats-grid">
          <div>
            <div className="stat-num">{stats.total_requests}</div>
            <div className="stat-label">Requests raised</div>
          </div>
          <div>
            <div className="stat-num">{stats.delivered}</div>
            <div className="stat-label">Fulfilled</div>
          </div>
          <div>
            <div className="stat-num">{stats.warehouse_fulfilled}</div>
            <div className="stat-label">Instant warehouse dispatch</div>
          </div>
          <div>
            <div className="stat-num">
              {stats.avg_response_seconds != null ? `${stats.avg_response_seconds}s` : "—"}
            </div>
            <div className="stat-label">Avg. response</div>
          </div>
          <div>
            <div className="stat-num">{stats.active_warehouses}</div>
            <div className="stat-label">Warehouses live</div>
          </div>
        </div>
      </section>

      <section className="wrap section" id="demo">
        <div className="section-head">
          <div className="eyebrow">Live, not simulated</div>
          <h2>Raise a real request against the RaktSetu API</h2>
          <p>
            This form talks to the actual backend — it checks real warehouse stock first for
            instant dispatch, and only if that's unavailable does it run the distance-based
            matching algorithm across the live donor/pharmacy/ambulance network.
          </p>
        </div>

        <div className="demo-panel">
          <div className="demo-form">
            <h3>New emergency request</h3>

            <span className="field-label">Request type</span>
            <div className="chip-row">
              {["Blood", "Medicine", "Ambulance"].map((t) => (
                <div
                  key={t}
                  className={`chip ${reqType === t ? "active" : ""}`}
                  onClick={() => setReqType(t)}
                >
                  {t === "Blood" ? "🩸" : t === "Medicine" ? "💊" : "🚑"} {t}
                </div>
              ))}
            </div>

            {reqType === "Blood" && (
              <>
                <span className="field-label">Blood group</span>
                <select value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)}>
                  {BLOOD_GROUPS.map((bg) => (
                    <option key={bg}>{bg}</option>
                  ))}
                </select>
              </>
            )}

            <span className="field-label">Urgency</span>
            <div className="chip-row">
              {["Critical", "Urgent", "Standard"].map((u) => (
                <div
                  key={u}
                  className={`chip gold ${urgency === u ? "active" : ""}`}
                  onClick={() => setUrgency(u)}
                >
                  {u}
                </div>
              ))}
            </div>

            <span className="field-label">Location</span>
            <select value={location} onChange={(e) => setLocation(e.target.value)}>
              {LOCATIONS.map((l) => (
                <option key={l.label}>{l.label}</option>
              ))}
            </select>

            <button
              className="btn primary req-btn"
              onClick={runDemo}
              disabled={stage === "matching" || stage === "onway"}
            >
              {stage === "matching" || stage === "onway" ? "Request in progress…" : "Raise request →"}
            </button>
          </div>

          <div className="demo-stage">
            {stage === "idle" && (
              <div className="stage-idle">
                <div className="pulse-icon">📍</div>
                <p>Your request timeline will appear here, backed by the live API.</p>
              </div>
            )}

            {stage === "error" && (
              <div className="stage-idle">
                <div className="pulse-icon">⚠️</div>
                <p>{errorMsg}</p>
                <button className="btn ghost" onClick={resetDemo}>
                  Try again
                </button>
              </div>
            )}

            {(stage === "matching" || stage === "onway" || stage === "delivered") && activeRequest && (
              <div className="timeline">
                <TimelineStep
                  n={1}
                  title="Request received"
                  desc={`${
                    activeRequest.type === "Blood"
                      ? activeRequest.blood_group + " blood"
                      : activeRequest.type
                  } · ${activeRequest.urgency} · ${activeRequest.location_label}`}
                  state="done"
                />
                <TimelineStep
                  n={2}
                  title={
                    fulfilledBy === "warehouse"
                      ? "Warehouse stock found — instant dispatch"
                      : fulfilledBy === "network"
                      ? "No warehouse stock nearby — matched live network"
                      : "Checking warehouse stock…"
                  }
                  state={matches.length ? "done" : "active"}
                  custom={
                    matches.length > 0 && (
                      <div className="match-list">
                        {matches.map((m, i) => (
                          <div className={`match-card ${i === 0 ? "selected" : ""}`} key={m.id}>
                            <div className="m-avatar">{fulfilledBy === "warehouse" ? "🏬" : m.name[0]}</div>
                            <div className="m-info">
                              <strong>{m.name}</strong>
                              <span>{m.tag}</span>
                            </div>
                            <div className="m-dist">{m.distance_km} km</div>
                          </div>
                        ))}
                      </div>
                    )
                  }
                />
                <TimelineStep
                  n={3}
                  title={fulfilledBy === "warehouse" ? "Dispatch rider en route" : "Responder en route"}
                  state={stage === "onway" ? "active" : stage === "delivered" ? "done" : "pending"}
                  desc={
                    stage === "onway" || stage === "delivered"
                      ? `${matches[0]?.name} confirmed and on the way.`
                      : undefined
                  }
                />
                <TimelineStep
                  n={4}
                  title="Delivered"
                  state={stage === "delivered" ? "done" : "pending"}
                  desc={stage === "delivered" ? "Marked complete via the live API." : undefined}
                />

                {stage === "delivered" && (
                  <div className="success-stat-row">
                    <div className="success-stat">
                      <strong>{responseTime != null ? `${responseTime}s` : "—"}</strong>
                      <span>Logged response time</span>
                    </div>
                    <div className="success-stat">
                      <strong>{matches.length}</strong>
                      <span>Responders notified</span>
                    </div>
                    <button className="btn ghost" onClick={resetDemo}>
                      Run another request
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <footer>
        <strong>RaktSetu</strong> — Ideathon 2026 · Varun Kumar Chaturvedi (Solo Innovator) · Sarala
        Birla University, Ranchi
      </footer>
    </div>
  );
}

function TimelineStep({ n, title, desc, state, custom }) {
  return (
    <div className={`t-step ${state}`}>
      <div className="t-line" />
      <div className="t-dot">{state === "done" ? "✓" : n}</div>
      <div className="t-body">
        <h4>{title}</h4>
        {desc && <p>{desc}</p>}
        {custom}
      </div>
    </div>
  );
}
