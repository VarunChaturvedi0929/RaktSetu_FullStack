import { useState } from "react";
import Storefront from "./Storefront";
import EmergencyDemo from "./EmergencyDemo";
import "./App.css";

export default function App() {
  const [tab, setTab] = useState("store"); // "store" | "emergency"

  return (
    <div>
      <div className="app-tab-bar">
        <button className={`app-tab ${tab === "store" ? "active" : ""}`} onClick={() => setTab("store")}>
          🛒 Shop (MedXpress)
        </button>
        <button className={`app-tab ${tab === "emergency" ? "active" : ""}`} onClick={() => setTab("emergency")}>
          🚨 Emergency Request Demo
        </button>
      </div>
      {tab === "store" ? <Storefront /> : <EmergencyDemo />}
    </div>
  );
}
