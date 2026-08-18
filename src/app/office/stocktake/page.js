"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import Icon from "@/components/Icons";
import ConfirmModal from "@/components/ConfirmModal";
import { fmtG, fmtSignedG } from "@/lib/math";

const STOCKTAKE_LOCATIONS = [
  { id: "WARP-01", label: "Warping — WARP-01" },
  { id: "REW-02", label: "Rewinding — REW-02" },
  { id: "PIRN-03", label: "Pirn winding — PIRN-03" },
  { id: "STORE-01", label: "Main store — STORE-01" }
];

export default function StocktakePage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stocktake, setStocktake] = useState({});
  const [lots, setLots] = useState([]);
  const [locations, setLocations] = useState([]);

  // Form States
  const [selectedLoc, setSelectedLoc] = useState("");
  const [counts, setCounts] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState(null);

  // Modals
  const [modal, setModal] = useState({ isOpen: false, kind: null });

  const loadData = async () => {
    try {
      const st = await db.get("stocktake");
      const lList = await db.get("lots");
      const locList = await db.get("locations");

      setStocktake(st || { status: "not_started", location: null, lines: [] });
      setLots(lList);
      setLocations(locList);

      // Pre-fill counts if in progress
      if (st && st.status === "in_progress") {
        const initialCounts = {};
        st.lines.forEach((l) => {
          initialCounts[l.lot] = String(l.counted_g !== undefined ? l.counted_g : l.system_g);
        });
        setCounts(initialCounts);
      }
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  useEffect(() => {
    const activeUser = getSessionUser();
    setUser(activeUser);
    loadData();
  }, []);

  useEffect(() => {
    if (locations && locations.length > 0 && !selectedLoc) {
      setSelectedLoc(locations[0].code);
    }
  }, [locations, selectedLoc]);

  useEffect(() => {
    if (notification) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [notification]);

  const handleStartCount = async () => {
    setSubmitting(true);
    try {
      // Find all lots currently in selected location
      const filteredLots = lots.filter(
        (l) => l.location === selectedLoc && l.status === "available"
      );

      const lines = filteredLots.map((l) => {
        const system_g = db.getLotBalance(l.id);
        return {
          lot: l.id,
          system_g,
          counted_g: system_g,
          variance_g: 0
        };
      });

      const newSt = {
        status: "in_progress",
        location: selectedLoc,
        lines,
        finalizedAt: null,
        approvedAt: null,
        approvedBy: null
      };

      await db.save("stocktake", newSt);
      setNotification({ tone: "success", text: `Stock count started for ${selectedLoc}.` });
      loadData();
    } catch (e) {
      console.error(e);
      setNotification({ tone: "danger", text: "Failed to start count." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCountChange = (lotId, val) => {
    setCounts({ ...counts, [lotId]: val });
  };

  const handleFinalizeCount = async () => {
    // Validate inputs
    let hasError = false;
    const finalLines = stocktake.lines.map((l) => {
      const raw = counts[l.lot];
      if (raw === undefined || raw.trim() === "" || Number(raw) < 0) {
        hasError = true;
      }
      const counted = Number(raw || 0);
      return {
        lot: l.lot,
        system_g: l.system_g,
        counted_g: counted,
        variance_g: counted - l.system_g
      };
    });

    if (hasError) {
      setAttempted(true);
      return;
    }

    setSubmitting(true);
    try {
      stocktake.status = "finalized";
      stocktake.lines = finalLines;
      stocktake.finalizedAt = new Date().toLocaleString();

      await db.save("stocktake", stocktake);
      setNotification({ tone: "success", text: "Count finalized. Awaiting supervisor approval." });
      loadData();
    } catch (e) {
      console.error(e);
      setNotification({ tone: "danger", text: "Failed to finalize count." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveClick = () => {
    setModal({ isOpen: true, kind: "approve" });
  };

  const handleConfirmAction = async () => {
    const actor = `${user.name} · ${user.roleLabel}`;
    setSubmitting(true);

    try {
      // Approve and update stock ledger with variances
      stocktake.status = "approved";
      stocktake.approvedAt = new Date().toLocaleString();
      stocktake.approvedBy = user.name;

      await db.save("stocktake", stocktake);

      // Post entries to ledger
      for (const line of stocktake.lines) {
        if (line.variance_g !== 0) {
          const sleId = `SLE-${String((await db.get("stockLedger")).length + 1).padStart(6, "0")}`;
          await db.save("stockLedger", {
            id: sleId,
            lot: line.lot,
            item: lots.find((x) => x.id === line.lot)?.item || "Zari thread",
            qty_g: line.variance_g,
            type: "stocktake_adjustment",
            ref: "STOCKTAKE",
            location: stocktake.location
          }, "id", sleId);
        }
      }

      await db.save("auditLog", {
        ts: new Date().toLocaleTimeString(),
        actor,
        action: "Approved stock take",
        ref: stocktake.location
      });

      setNotification({ tone: "success", text: "Stock take approved and posted to ledger." });
      setModal({ isOpen: false, kind: null });
      loadData();
    } catch (e) {
      console.error(e);
      setNotification({ tone: "danger", text: "Approval failed." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async () => {
    setSubmitting(true);
    try {
      const resetSt = { status: "not_started", location: null, lines: [], finalizedAt: null, approvedAt: null, approvedBy: null };
      await db.save("stocktake", resetSt);
      setCounts({});
      setAttempted(false);
      setNotification(null);
      loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="small muted">Loading Stock Take data...</div>;
  }

  const role = user?.role;
  const canCount = canEdit("stocktake_count", role);
  const canApprove = canEdit("stocktake_approve", role);

  const getStepClass = (stepStatus, current) => {
    const order = ["not_started", "in_progress", "finalized", "approved"];
    const curIdx = order.indexOf(current);
    const stepIdx = order.indexOf(stepStatus);

    if (stepIdx < curIdx) return "done";
    if (stepIdx === curIdx) return "active";
    return "";
  };

  const allUnchanged =
    stocktake.status === "in_progress" &&
    stocktake.lines.every((l) => {
      const raw = counts[l.lot];
      const counted = raw !== undefined && raw.trim() !== "" ? Number(raw) : l.system_g;
      return counted === l.system_g;
    });

  return (
    <>
      <div className="page-head">
        <h1>Stock take</h1>
      </div>

      {notification && (
        <div className={`banner banner-${notification.tone}`}>
          <Icon name={notification.tone === "danger" ? "alert" : "check"} size={18} />
          <div>{notification.text}</div>
        </div>
      )}

      {/* Steps Header */}
      <div className="step-row">
        <div className={`step ${getStepClass("not_started", stocktake.status)}`}>
          <span className="dot">{getStepClass("not_started", stocktake.status) === "done" ? "✓" : "1"}</span>
          Start
        </div>
        <div className={`step ${getStepClass("in_progress", stocktake.status)}`}>
          <span className="dot">{getStepClass("in_progress", stocktake.status) === "done" ? "✓" : "2"}</span>
          Count
        </div>
        <div className={`step ${getStepClass("finalized", stocktake.status)}`}>
          <span className="dot">{getStepClass("finalized", stocktake.status) === "done" ? "✓" : "3"}</span>
          Finalize
        </div>
        <div className={`step ${getStepClass("approved", stocktake.status)}`}>
          <span className="dot">{getStepClass("approved", stocktake.status) === "done" ? "✓" : "4"}</span>
          Approve
        </div>
      </div>

      {stocktake.status === "not_started" && (
        <div className="card">
          {!canCount && (
            <div className="lock-row" style={{ marginBottom: "10px" }}>
              <Icon name="gear" size={14} />
              View only for your role.
            </div>
          )}
          <div className="field">
            <label>Location</label>
            <select
              value={selectedLoc}
              disabled={!canCount}
              onChange={(e) => setSelectedLoc(e.target.value)}
            >
              {locations.map((loc) => (
                <option key={loc.code} value={loc.code}>
                  {loc.name} — {loc.code}
                </option>
              ))}
            </select>
          </div>
          {canCount && (
            <button className="btn btn-primary" onClick={handleStartCount} disabled={submitting}>
              Start count
            </button>
          )}
        </div>
      )}

      {stocktake.status === "in_progress" && (
        <div className="card">
          <div className="section-title">
            Location: <span className="chip">{stocktake.location}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Lot</th>
                  <th className="num">System</th>
                  <th className="num">Counted</th>
                  <th className="num">Variance</th>
                </tr>
              </thead>
              <tbody>
                {stocktake.lines.map((l) => {
                  const raw = counts[l.lot];
                  const hasRaw = raw !== undefined && raw.trim() !== "";
                  const counted = hasRaw ? Number(raw) : l.system_g;
                  const variance = counted - l.system_g;

                  const isError = attempted && (!hasRaw || Number(raw) < 0);
                  const tone = variance === 0 ? "success" : Math.abs(variance) <= 5 ? "warning" : "danger";

                  return (
                    <tr key={l.lot}>
                      <td>
                        <span className="chip">{l.lot}</span>
                      </td>
                      <td className="num">{fmtG(l.system_g)} g</td>
                      <td className="num">
                        <input
                          type="number"
                          className={`count-input ${isError ? "has-error" : ""}`}
                          disabled={!canCount}
                          value={raw !== undefined ? raw : fmtG(l.system_g)}
                          onChange={(e) => handleCountChange(l.lot, e.target.value)}
                        />
                      </td>
                      <td className="num" style={{ color: `var(--${tone}-800)` }}>
                        {fmtSignedG(variance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {allUnchanged && (
            <div className="banner banner-warning" style={{ marginTop: "14px" }}>
              <Icon name="alert" size={18} />
              <div>
                Every line still matches the system weight exactly — verify counts
                physically before finalizing.
              </div>
            </div>
          )}

          {canCount && (
            <button className="btn btn-primary" style={{ marginTop: "14px" }} onClick={handleFinalizeCount}>
              Finalize count
            </button>
          )}
        </div>
      )}

      {stocktake.status === "finalized" && (
        <div className="card">
          <div className="section-title">
            Location: <span className="chip">{stocktake.location}</span>
          </div>
          <div className="small muted" style={{ marginBottom: "10px" }}>
            Finalized {stocktake.finalizedAt} — counts are locked.
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Lot</th>
                  <th className="num">System</th>
                  <th className="num">Counted</th>
                  <th className="num">Variance</th>
                </tr>
              </thead>
              <tbody>
                {stocktake.lines.map((l) => {
                  const tone = l.variance_g === 0 ? "success" : Math.abs(l.variance_g) <= 5 ? "warning" : "danger";
                  return (
                    <tr key={l.lot}>
                      <td>
                        <span className="chip">{l.lot}</span>
                      </td>
                      <td className="num">{fmtG(l.system_g)} g</td>
                      <td className="num">{fmtG(l.counted_g)} g</td>
                      <td className="num" style={{ color: `var(--${tone}-800)` }}>
                        {fmtSignedG(l.variance_g)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: "14px" }}>
            {canApprove ? (
              <button className="btn btn-primary" onClick={handleApproveClick}>
                Approve stock take
              </button>
            ) : (
              <div className="lock-row">
                <Icon name="gear" size={14} />
                Awaiting administrative approval.
              </div>
            )}
          </div>
        </div>
      )}

      {stocktake.status === "approved" && (
        <div className="card">
          <div className="section-title">
            Location: <span className="chip">{stocktake.location}</span>
          </div>
          <div className="banner banner-success" style={{ marginTop: "10px" }}>
            <Icon name="check" size={18} />
            <div>
              <strong>Approved.</strong> {stocktake.approvedAt} by {stocktake.approvedBy}.
              Stock ledger values updated.
            </div>
          </div>
          <div className="table-wrap" style={{ marginTop: "14px" }}>
            <table>
              <thead>
                <tr>
                  <th>Lot</th>
                  <th className="num">System</th>
                  <th className="num">Counted</th>
                  <th className="num">Variance</th>
                </tr>
              </thead>
              <tbody>
                {stocktake.lines.map((l) => {
                  const tone = l.variance_g === 0 ? "success" : Math.abs(l.variance_g) <= 5 ? "warning" : "danger";
                  return (
                    <tr key={l.lot}>
                      <td>
                        <span className="chip">{l.lot}</span>
                      </td>
                      <td className="num">{fmtG(l.system_g)} g</td>
                      <td className="num">{fmtG(l.counted_g)} g</td>
                      <td className="num" style={{ color: `var(--${tone}-800)` }}>
                        {fmtSignedG(l.variance_g)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {canCount && (
            <button className="btn" style={{ marginTop: "14px", padding: "6px 12px", fontSize: "12px" }} onClick={handleReset}>
              Start a new count (demo reset)
            </button>
          )}
        </div>
      )}

      {/* --- CONFIRMATION MODAL --- */}
      <ConfirmModal
        isOpen={modal.isOpen}
        title="Approve stock take"
        sub="This will post calculated variances to the stock ledger. Counts cannot be revised once approved."
        confirmLabel="Approve"
        submitting={submitting}
        onCancel={() => setModal({ isOpen: false, kind: null })}
        onConfirm={handleConfirmAction}
      />
    </>
  );
}
