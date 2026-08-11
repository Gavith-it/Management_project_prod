import React from "react";

export default function MetricCard({ label, value, onClick }) {
  const isClickable = !!onClick;
  return (
    <div
      className={`metric-card ${isClickable ? "metric-card-click row-click" : ""}`}
      onClick={onClick}
      style={isClickable ? { cursor: "pointer" } : undefined}
    >
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
