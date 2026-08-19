"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import Icon from "@/components/Icons";
import { fmtG, todayISO } from "@/lib/math";

const SF_ASSIGNMENTS = [
  { key: "warping", label: "Warping — Frame 3", type: "jobcard" },
  { key: "rewinding", label: "Rewinding — REW-02", type: "stage", stageKey: "rewinding" },
  { key: "pirn", label: "Pirn winding — PIRN-03", type: "stage", stageKey: "pirn" }
];

export default function ShopfloorPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Shell State
  const [screen, setScreen] = useState("home"); // 'home', 'complete', 'return', 'complete-done', 'return-done'
  const [assignmentKey, setAssignmentKey] = useState("warping");

  // DB States
  const [carriers, setCarriers] = useState([]);
  const [jobCards, setJobCards] = useState([]);
  const [stageCompletions, setStageCompletions] = useState([]);
  const [lots, setLots] = useState([]);
  const [items, setItems] = useState([]);

  // Form States
  const [formState, setFormState] = useState({});
  const [errors, setErrors] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const itemsList = await db.get("items");
      const cList = await db.get("carriers");
      const jcList = await db.get("jobCards");
      const scList = await db.get("stageCompletions");
      const lList = await db.get("lots");

      setItems(itemsList);
      setCarriers(cList);
      setJobCards(jcList);
      setStageCompletions(scList);
      setLots(lList);
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

  const activeAssignment = SF_ASSIGNMENTS.find((a) => a.key === assignmentKey);

  // --- ACTIONS ---

  const handleNav = (targetScreen) => {
    setScreen(targetScreen);
    setFormState({
      sf_carrier: carriers[0]?.code || "",
      sf_filled: "",
      sf_paper: "",
      sf_waste: "",
      sf_output: "",
      sf_waste2: "",
      sf_bobbins: "",
      sf_gross: "",
      sf_tare: ""
    });
    setErrors({});
    setAttempted(false);
  };

  const handleAssignmentSwitch = (key) => {
    setAssignmentKey(key);
    handleNav("home");
  };

  // 1. Submit Single Beam Warping Completion (e.g. completes JC-000004)
  const handleWarpingSubmit = async (e) => {
    e.preventDefault();
    const filled = Number(formState.sf_filled || 0);
    const paper = Number(formState.sf_paper || 0);
    const waste = Number(formState.sf_waste || 0);

    const formErrors = {};
    if (!formState.sf_filled?.trim() || filled <= 0) {
      formErrors.sf_filled = "Filled weight must be greater than 0.";
    }
    if (!formState.sf_paper?.trim() || paper < 0) {
      formErrors.sf_paper = "Paper weight cannot be negative.";
    }
    if (!formErrors.sf_filled && !formErrors.sf_paper && paper >= filled) {
      formErrors.sf_paper = "Paper weight cannot exceed filled weight.";
    }
    if (!formState.sf_waste?.trim() || waste < 0) {
      formErrors.sf_waste = "Waste weight is required.";
    }

    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      setAttempted(true);
      return;
    }

    setSubmitting(true);
    try {
      const jc = jobCards.find((j) => j.id === "JC-000004") || jobCards[3];
      const carrier = carriers.find((c) => c.code === formState.sf_carrier) || carriers[0];

      const netOutput = Math.max(0, filled - carrier.empty_g - paper);
      const consumed = netOutput + waste;

      // Update JC record in DB
      jc.status = "complete";
      jc.carrier = carrier.code;
      jc.empty_g = carrier.empty_g;
      jc.filled_g = filled;
      jc.paper_g = paper;
      jc.output_g = netOutput;
      jc.waste_g = waste;
      jc.consumed_g = consumed;

      await db.save("jobCards", jc, "id");

      // Seed Warped Beam Lot
      const beamItem = items.find(i => i.type === "Beam") || { name: "Warped beam — partial", code: "ZB-001" };
      const wasteItem = items.find(i => i.type === "Waste") || { name: "Zari waste", code: "ZW-001" };

      const newLotId = `LOT-${String((await db.get("lots")).length + 1).padStart(8, "0")}`;
      await db.save("lots", {
        id: newLotId,
        item: beamItem.name,
        item_id: beamItem.code,
        location: "STORE-01",
        parent: "LOT-00000001",
        source: jc.id,
        batch: "BATCH-00001",
        qty_pieces: 1,
        piece_uom: "Beam",
        is_mixed_batch: false,
        carrier_code: carrier.code,
        landed_cost_per_gram: 10.0,
        status: "available"
      }, "id", newLotId);

      // Ledger output
      const sleId = `SLE-${String((await db.get("stockLedger")).length + 1).padStart(6, "0")}`;
      await db.save("stockLedger", {
        id: sleId,
        lot: newLotId,
        item: beamItem.name,
        qty_g: netOutput,
        type: "stage_output",
        ref: jc.id,
        location: "STORE-01"
      }, "id", sleId);

      // Seed Waste
      const wstId = `WST-${String((await db.get("wasteEntries")).length + 1).padStart(6, "0")}`;
      await db.save("wasteEntries", {
        id: wstId,
        stage: "Warping",
        item: wasteItem.name,
        qty_g: waste,
        ref: jc.id,
        location: "WASTE-01"
      }, "id", wstId);

      // Audit Log
      const actor = `${user.name} · ${user.roleLabel}`;
      await db.save("auditLog", {
        ts: new Date().toLocaleTimeString(),
        actor,
        action: "Operator completed job card (shopfloor)",
        ref: jc.id
      });

      setSubmitting(false);
      setScreen("complete-done");
      loadData();
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  };

  // 2. Submit Winding (Rewinding / Pirn) Completions
  const handleStageSubmit = async (e) => {
    e.preventDefault();
    const output = Number(formState.sf_output || 0);
    const waste = Number(formState.sf_waste2 || 0);

    const formErrors = {};
    if (!formState.sf_output?.trim() || output <= 0) {
      formErrors.sf_output = "Output weight must be greater than 0.";
    }
    if (!formState.sf_waste2?.trim() || waste < 0) {
      formErrors.sf_waste2 = "Waste weight is required.";
    }

    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      setAttempted(true);
      return;
    }

    setSubmitting(true);
    try {
      const isRewind = activeAssignment.stageKey === "rewinding";
      const comp = stageCompletions.find((sc) => sc.stage === (isRewind ? "Rewinding" : "Pirn winding"));
      if (!comp) return;

      const consumed = output + waste;
      const variance = Math.abs(comp.issued_g - consumed);
      const varPct = (variance / comp.issued_g) * 100;

      // Update Stage Completion Record
      comp.status = varPct > comp.tolerance_pct ? "needs_approval" : "closed";
      comp.output_g = output;
      comp.waste_g = waste;
      comp.variance_g = variance;
      comp.variance_pct = varPct;

      await db.save("stageCompletions", comp, "id");

      // Seed Winding Outputs
      const targetLotId = comp.to_lot;
      const targetLot = lots.find((l) => l.id === targetLotId);

      if (targetLot) {
        targetLot.status = "available";
        await db.save("lots", targetLot, "id");
      }

      // Ledger output
      const wasteItem = items.find(i => i.type === "Waste") || { name: "Zari waste", code: "ZW-001" };
      const sleId = `SLE-${String((await db.get("stockLedger")).length + 1).padStart(6, "0")}`;
      await db.save("stockLedger", {
        id: sleId,
        lot: targetLotId,
        item: targetLot.item,
        qty_g: output,
        type: "stage_output",
        ref: comp.issue_id,
        location: "STORE-01"
      }, "id", sleId);

      // Seed Waste
      const wstId = `WST-${String((await db.get("wasteEntries")).length + 1).padStart(6, "0")}`;
      await db.save("wasteEntries", {
        id: wstId,
        stage: comp.stage,
        item: wasteItem.name,
        qty_g: waste,
        ref: comp.issue_id,
        location: "WASTE-01"
      }, "id", wstId);

      // Audit Log
      const actor = `${user.name} · ${user.roleLabel}`;
      await db.save("auditLog", {
        ts: new Date().toLocaleTimeString(),
        actor,
        action: `Operator completed ${comp.stage} (shopfloor)`,
        ref: comp.issue_id
      });

      setSubmitting(false);
      setScreen("complete-done");
      loadData();
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  };

  // 3. Raise material return
  const handleReturnSubmit = async (e) => {
    e.preventDefault();
    const bobbins = Number(formState.sf_bobbins || 0);
    const gross = Number(formState.sf_gross || 0);
    const tare = Number(formState.sf_tare || 0);

    const formErrors = {};
    if (!formState.sf_bobbins?.trim() || bobbins <= 0 || !Number.isInteger(bobbins)) {
      formErrors.sf_bobbins = "Bobbins count must be a positive integer.";
    }
    if (!formState.sf_gross?.trim() || gross <= 0) {
      formErrors.sf_gross = "Gross weight must be greater than 0.";
    }
    if (!formState.sf_tare?.trim() || tare < 0) {
      formErrors.sf_tare = "Tare weight is required.";
    }
    if (!formErrors.sf_gross && !formErrors.sf_tare && gross <= tare) {
      formErrors.sf_gross = "Gross weight must exceed tare weight.";
    }

    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      setAttempted(true);
      return;
    }

    setSubmitting(true);
    try {
      const retId = `RET-${String(lots.length + 21).padStart(6, "0")}`;
      const net = gross - tare;

      const newRet = {
        id: retId,
        status: "pending",
        is_partial: true,
        lot: null,
        bobbins,
        gross_g: gross,
        tare_g: tare,
        net_g: net,
        lines: [
          {
            lot: null,
            item: "Zari thread — partial bobbins",
            bobbins,
            gross_g: gross,
            tare_g: tare,
            net_g: net
          }
        ]
      };

      await db.save("returns", newRet, "id", retId);

      // Audit Log
      const actor = `${user.name} · ${user.roleLabel}`;
      await db.save("auditLog", {
        ts: new Date().toLocaleTimeString(),
        actor,
        action: "Operator raised return (shopfloor)",
        ref: retId
      });

      setSubmitting(false);
      setScreen("return-done");
      loadData();
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="small muted">Loading terminal details...</div>;
  }

  return (
    <>
      {screen === "home" && (
        <>
          <div className="sf-hero">
            <div className="eyebrow">Your machine</div>
            <div className="machine">{activeAssignment.label}</div>
            <div className="tag-row">
              <span className="chip">
                {activeAssignment.type === "jobcard" ? "Job cards in progress" : "Winding stage"}
              </span>
            </div>
            <div className="assign-switch">
              {SF_ASSIGNMENTS.map((x) => (
                <button
                  key={x.key}
                  className={x.key === assignmentKey ? "active" : ""}
                  onClick={() => handleAssignmentSwitch(x.key)}
                >
                  {x.label}
                </button>
              ))}
            </div>
          </div>

          <div className="sf-actions">
            <button className="sf-action-btn" onClick={() => handleNav("complete")}>
              <span className="icon-wrap">
                <Icon name="check" size={22} />
              </span>
              <span>
                <span className="t">Complete production</span>
                <span className="s">
                  {activeAssignment.type === "jobcard"
                    ? "Before/after weights, two beams"
                    : "Output and waste only"}
                </span>
              </span>
            </button>
            <button className="sf-action-btn" onClick={() => handleNav("return")}>
              <span className="icon-wrap">
                <Icon name="undo" size={22} />
              </span>
              <span>
                <span className="t">Raise a return</span>
                <span className="s">Bobbins, gross, tare</span>
              </span>
            </button>
          </div>
        </>
      )}

      {screen === "complete" && (
        <>
          <button className="sf-back" onClick={() => handleNav("home")}>
            <Icon name="undo" size={18} />
            <span>Back</span>
          </button>

          {activeAssignment.type === "jobcard" ? (
            <form onSubmit={handleWarpingSubmit}>
              <h2 style={{ fontSize: "17px", marginBottom: "4px" }}>
                Complete production — JC-000004
              </h2>
              <div className="small muted" style={{ marginBottom: "16px" }}>
                Border warp · 150 ends · 200 m · 44 in
              </div>

              <div className="sf-field">
                <label>Beam</label>
                <select
                  value={formState.sf_carrier}
                  onChange={(e) => setFormState({ ...formState, sf_carrier: e.target.value })}
                >
                  {carriers.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sf-field">
                <label>Empty weight (g)</label>
                <input
                  value={fmtG(carriers.find((c) => c.code === formState.sf_carrier)?.empty_g || 12400)}
                  disabled
                />
                <div className="hint">Certified weight from master files.</div>
              </div>

              <div className={`sf-field ${attempted && errors.sf_filled ? "has-error" : ""}`}>
                <label>Filled weight (g)</label>
                <input
                  type="number"
                  placeholder="0.000"
                  value={formState.sf_filled}
                  onChange={(e) => setFormState({ ...formState, sf_filled: e.target.value })}
                />
                {attempted && errors.sf_filled && (
                  <div className="sf-field-error-text">{errors.sf_filled}</div>
                )}
              </div>

              <div className={`sf-field ${attempted && errors.sf_paper ? "has-error" : ""}`}>
                <label>Paper weight (g)</label>
                <input
                  type="number"
                  placeholder="0.000"
                  value={formState.sf_paper}
                  onChange={(e) => setFormState({ ...formState, sf_paper: e.target.value })}
                />
                {attempted && errors.sf_paper && (
                  <div className="sf-field-error-text">{errors.sf_paper}</div>
                )}
              </div>

              <div className={`sf-field ${attempted && errors.sf_waste ? "has-error" : ""}`}>
                <label>Waste (g)</label>
                <input
                  type="number"
                  placeholder="0.000"
                  value={formState.sf_waste}
                  onChange={(e) => setFormState({ ...formState, sf_waste: e.target.value })}
                />
                {attempted && errors.sf_waste && (
                  <div className="sf-field-error-text">{errors.sf_waste}</div>
                )}
              </div>

              <div className="sf-calc-note">
                Output and consumed quantities are computed on save.
              </div>

              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleStageSubmit}>
              <h2 style={{ fontSize: "17px", marginBottom: "6px" }}>
                Complete production — {activeAssignment.key === "rewinding" ? "ISS-000045" : "ISS-000046"}
              </h2>
              <div className="small muted" style={{ marginBottom: "16px" }}>
                Simpler winding close — output and waste only.
              </div>

              <div className={`sf-field ${attempted && errors.sf_output ? "has-error" : ""}`}>
                <label>Output weight (g)</label>
                <input
                  type="number"
                  placeholder="0.000"
                  value={formState.sf_output}
                  onChange={(e) => setFormState({ ...formState, sf_output: e.target.value })}
                />
                {attempted && errors.sf_output && (
                  <div className="sf-field-error-text">{errors.sf_output}</div>
                )}
              </div>

              <div className={`sf-field ${attempted && errors.sf_waste2 ? "has-error" : ""}`}>
                <label>Waste (g)</label>
                <input
                  type="number"
                  placeholder="0.000"
                  value={formState.sf_waste2}
                  onChange={(e) => setFormState({ ...formState, sf_waste2: e.target.value })}
                />
                {attempted && errors.sf_waste2 && (
                  <div className="sf-field-error-text">{errors.sf_waste2}</div>
                )}
              </div>

              <div className="sf-calc-note">
                Variance checks run automatically when recorded.
              </div>

              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </form>
          )}
        </>
      )}

      {screen === "return" && (
        <>
          <button className="sf-back" onClick={() => handleNav("home")}>
            <Icon name="undo" size={18} />
            <span>Back</span>
          </button>
          <form onSubmit={handleReturnSubmit}>
            <h2 style={{ fontSize: "17px", marginBottom: "16px" }}>Raise a return</h2>

            <div className={`sf-field ${attempted && errors.sf_bobbins ? "has-error" : ""}`}>
              <label>Bobbins</label>
              <input
                type="number"
                placeholder="0"
                value={formState.sf_bobbins}
                onChange={(e) => setFormState({ ...formState, sf_bobbins: e.target.value })}
              />
              {attempted && errors.sf_bobbins && (
                <div className="sf-field-error-text">{errors.sf_bobbins}</div>
              )}
            </div>

            <div className={`sf-field ${attempted && errors.sf_gross ? "has-error" : ""}`}>
              <label>Gross weight (g)</label>
              <input
                type="number"
                placeholder="0.000"
                value={formState.sf_gross}
                onChange={(e) => setFormState({ ...formState, sf_gross: e.target.value })}
              />
              {attempted && errors.sf_gross && (
                <div className="sf-field-error-text">{errors.sf_gross}</div>
              )}
            </div>

            <div className={`sf-field ${attempted && errors.sf_tare ? "has-error" : ""}`}>
              <label>Tare weight (g)</label>
              <input
                type="number"
                placeholder="0.000"
                value={formState.sf_tare}
                onChange={(e) => setFormState({ ...formState, sf_tare: e.target.value })}
              />
              {attempted && errors.sf_tare && (
                <div className="sf-field-error-text">{errors.sf_tare}</div>
              )}
            </div>

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </form>
        </>
      )}

      {(screen === "complete-done" || screen === "return-done") && (
        <div className="empty-state" style={{ paddingTop: "60px" }}>
          <div style={{ color: "var(--success-600)" }}>
            <Icon name="check" size={40} />
          </div>
          <div className="title" style={{ marginTop: "12px", fontSize: "16px" }}>
            {screen === "complete-done" ? "Production" : "Return"} submitted
          </div>
          <div className="small">
            The server has confirmed it — inventory quantities updated.
          </div>
          <button className="btn btn-primary" style={{ marginTop: "18px" }} onClick={() => handleNav("home")}>
            Back to home
          </button>
        </div>
      )}
    </>
  );
}
