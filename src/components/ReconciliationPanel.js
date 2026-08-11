import React from "react";
import Icon from "./Icons";
import { fmtG, fmtPct } from "@/lib/math";

export default function ReconciliationPanel({
  issued,
  output,
  waste,
  returned,
  variance_g,
  variance_pct,
  tolerance_pct,
  reason = "",
  onChangeReason
}) {
  const over = variance_pct > tolerance_pct;
  const varTone = over ? "warning" : "success";

  return (
    <div className="recon">
      <div className="recon-line">
        <span className="l">Issued</span>
        <span className="num">{fmtG(issued)} g</span>
      </div>
      <div className="recon-line">
        <span className="l">Output</span>
        <span className="num">{fmtG(output)} g</span>
      </div>
      <div className="recon-line">
        <span className="l">Waste</span>
        <span className="num">{fmtG(waste)} g</span>
      </div>
      <div className="recon-line">
        <span className="l">Returned</span>
        <span className="num">{fmtG(returned)} g</span>
      </div>
      <hr className="divider" />
      <div className="recon-variance">
        <span className="l" style={{ color: `var(--${varTone}-800)` }}>
          Variance
        </span>
        <span className="v num" style={{ color: `var(--${varTone}-800)` }}>
          {fmtG(variance_g)} g · {fmtPct(variance_pct)}
        </span>
      </div>
      <div className="small muted" style={{ marginTop: "2px" }}>
        Tolerance: ≤ {fmtPct(tolerance_pct)}
      </div>
      {over && (
        <div style={{ marginTop: "16px" }}>
          <div className="banner banner-warning">
            <Icon name="alert" size={18} />
            <div>
              <strong>Over tolerance.</strong> This close needs a reason and
              admin approval before it posts to the ledger.
            </div>
          </div>
          <div className="field">
            <label>
              Reason for variance <span style={{ color: "var(--danger-600)" }}>*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => onChangeReason && onChangeReason(e.target.value)}
              placeholder="Provide a detailed explanation..."
              required
            />
            <div className="hint">
              Required — describe what caused the variance, not just that one
              exists.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
