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
  const [issues, setIssues] = useState([]);
  const [warpingLogs, setWarpingLogs] = useState([]);

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
      const issuesList = await db.get("productionIssues");
      const wlList = await db.get("warpingLogs");

      setItems(itemsList);
      setCarriers(cList);
      setJobCards(jcList);
      setStageCompletions(scList);
      setLots(lList);
      setIssues(issuesList);
      setWarpingLogs(wlList);
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

  const getLinkedBobbins = (jc) => {
    if (!jc) return 0;
    const issue = issues.find((i) => i.id === jc.issue_id);
    if (!issue) return 0;
    const lot = lots.find((l) => l.id === issue.lot);
    return lot ? (lot.piece_uom === "Mark" ? lot.qty_pieces * 4 : lot.qty_pieces) : 0;
  };

  const handleWlJobCardChange = (jcId) => {
    const jc = jobCards.find((j) => j.id === jcId);
    if (!jc) return;
    const carrier = carriers.find((c) => c.code === jc.carrier);
    setFormState((prev) => ({
      ...prev,
      wl_jobcard: jcId,
      wl_operator: jc.operator || "",
      wl_ns_a: prev.wl_ns_a || "",
      wl_fp_a: prev.wl_fp_a || "",
      wl_eb_a: carrier ? String(carrier.empty_g) : "12400",
      wl_gross_a: prev.wl_gross_a || "",
      wl_ns_b: prev.wl_ns_b || "",
      wl_fp_b: prev.wl_fp_b || "",
      wl_eb_b: carrier ? String(carrier.empty_g) : "12400",
      wl_gross_b: prev.wl_gross_b || ""
    }));
  };

  const handleNav = (targetScreen) => {
    setScreen(targetScreen);
    if (targetScreen === "complete" && assignmentKey === "warping") {
      const inProgressCards = jobCards.filter((jc) => jc.status === "in_progress");
      const firstJc = inProgressCards[0];
      const carrier = firstJc ? carriers.find((c) => c.code === firstJc.carrier) : null;
      setFormState({
        wl_jobcard: firstJc?.id || "",
        wl_operator: firstJc?.operator || "",
        wl_ns_a: "",
        wl_fp_a: "",
        wl_eb_a: carrier ? String(carrier.empty_g) : "12400",
        wl_gross_a: "",
        wl_ns_b: "",
        wl_fp_b: "",
        wl_eb_b: carrier ? String(carrier.empty_g) : "12400",
        wl_gross_b: ""
      });
    } else {
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
    }
    setErrors({});
    setAttempted(false);
  };

  const handleAssignmentSwitch = (key) => {
    setAssignmentKey(key);
    handleNav("home");
  };

  // 1. Submit Warping Completion (adds warping log, completes JC, creates Side A & Side B beams)
  const handleWarpingSubmit = async (e) => {
    e.preventDefault();
    const jcId = formState.wl_jobcard;
    const jc = jobCards.find((j) => j.id === jcId);
    if (!jc) return;

    if (!formState.wl_operator?.trim()) {
      setErrors({ wl_operator: "Operator name is required." });
      setAttempted(true);
      return;
    }

    const grossA = Number(formState.wl_gross_a || 0);
    const grossB = Number(formState.wl_gross_b || 0);
    if (grossA <= 0 || grossB <= 0) {
      setErrors({ wl_gross_a: "Gross weights are required and must be > 0." });
      setAttempted(true);
      return;
    }

    setSubmitting(true);
    try {
      const issue = issues.find((i) => i.id === jc.issue_id);
      const lot = lots.find((l) => l.id === (issue?.lot));
      const bobbins = lot?.qty_pieces || 0;

      const nsA = Number(formState.wl_ns_a || 0);
      const fpA = Number(formState.wl_fp_a || 0);
      const ebA = Number(formState.wl_eb_a || 0);
      const nsB = Number(formState.wl_ns_b || 0);
      const fpB = Number(formState.wl_fp_b || 0);
      const ebB = Number(formState.wl_eb_b || 0);

      const netA = Math.round(Math.max(0, grossA - nsA - fpA - ebA));
      const netB = Math.round(Math.max(0, grossB - nsB - fpB - ebB));
      const totalNet = netA + netB;

      const wlId = `WL-${String(warpingLogs.length + 1).padStart(6, "0")}`;
      const newWl = {
        id: wlId,
        job_card: jc.id,
        operator: formState.wl_operator,
        bobbins,
        sideA: { net_g: netA },
        sideB: { net_g: netB },
        total_net_g: totalNet,
        waste_g: null
      };

      await db.save("warpingLogs", newWl, "id", wlId);

      // Update Job Card details
      jc.status = "complete";
      jc.output_g = totalNet;
      jc.consumed_g = totalNet;
      await db.save("jobCards", jc, "id");

      // Log Stock Ledger outputs
      const lotAId = `LOT-${String((await db.get("lots")).length + 1).padStart(8, "0")}`;
      const lotBId = `LOT-${String((await db.get("lots")).length + 2).padStart(8, "0")}`;

      await db.save("lots", {
        id: lotAId,
        item: "Warped beam — partial",
        item_id: "ZB-001",
        location: "STORE-01",
        parent: lot?.id || null,
        source: jc.id,
        batch: lot?.batch || "BATCH-26-00001",
        qty_pieces: 1,
        piece_uom: "Beam",
        is_mixed_batch: false,
        carrier_code: "BEAM-07",
        landed_cost_per_gram: lot?.landed_cost_per_gram || 10.0,
        status: "available"
      }, "id", lotAId);

      await db.save("lots", {
        id: lotBId,
        item: "Warped beam — partial",
        item_id: "ZB-001",
        location: "STORE-01",
        parent: lot?.id || null,
        source: jc.id,
        batch: lot?.batch || "BATCH-26-00001",
        qty_pieces: 1,
        piece_uom: "Beam",
        is_mixed_batch: false,
        carrier_code: "BEAM-11",
        landed_cost_per_gram: lot?.landed_cost_per_gram || 10.0,
        status: "available"
      }, "id", lotBId);

      const sleAId = `SLE-${String((await db.get("stockLedger")).length + 1).padStart(6, "0")}`;
      await db.save("stockLedger", {
        id: sleAId,
        lot: lotAId,
        item: "Warped beam — partial",
        qty_g: netA,
        type: "stage_output",
        ref: jc.id,
        location: "STORE-01"
      }, "id", sleAId);

      const sleBId = `SLE-${String((await db.get("stockLedger")).length + 2).padStart(6, "0")}`;
      await db.save("stockLedger", {
        id: sleBId,
        lot: lotBId,
        item: "Warped beam — partial",
        qty_g: netB,
        type: "stage_output",
        ref: jc.id,
        location: "STORE-01"
      }, "id", sleBId);

      // Audit log
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

  const warpingJc = jobCards.find((j) => j.id === formState.wl_jobcard);
  const bobbinsCount = getLinkedBobbins(warpingJc);
  const emptyBobbinsG = bobbinsCount * 16.0;

  const nsA = Number(formState.wl_ns_a || 0);
  const fpA = Number(formState.wl_fp_a || 0);
  const ebA = Number(formState.wl_eb_a || 0);
  const grossA = Number(formState.wl_gross_a || 0);
  const netA = Math.round(Math.max(0, grossA - nsA - fpA - ebA));

  const nsB = Number(formState.wl_ns_b || 0);
  const fpB = Number(formState.wl_fp_b || 0);
  const ebB = Number(formState.wl_eb_b || 0);
  const grossB = Number(formState.wl_gross_b || 0);
  const netB = Math.round(Math.max(0, grossB - nsB - fpB - ebB));

  const totalConsumed = netA + netB;

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
                New warping log
              </h2>
              <div style={{ display: "flex", justifyContent: "flex-end", width: "100%", marginTop: "-28px", marginBottom: "16px" }}>
                <input
                  type="date"
                  value={todayISO()}
                  disabled
                  style={{ width: "120px", fontSize: "12px", padding: "4px", border: "1px solid var(--neutral-300)", borderRadius: "4px" }}
                />
              </div>

              <div className="sf-field">
                <label>Job card</label>
                {jobCards.filter((jc) => jc.status === "in_progress").length === 0 ? (
                  <div style={{ color: "var(--danger-600)", fontSize: "13px", fontWeight: 600 }}>
                    No active in-progress job cards! Create a job card first.
                  </div>
                ) : (
                  <select
                    value={formState.wl_jobcard}
                    onChange={(e) => handleWlJobCardChange(e.target.value)}
                  >
                    {jobCards
                      .filter((jc) => jc.status === "in_progress")
                      .map((jc) => (
                        <option key={jc.id} value={jc.id}>
                          {jc.id} — {jc.saree_design} ({jc.operator})
                        </option>
                      ))}
                  </select>
                )}
              </div>

              <div className={`sf-field ${attempted && errors.wl_operator ? "has-error" : ""}`}>
                <label>Operator name <span className="req">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. Operator name"
                  value={formState.wl_operator}
                  onChange={(e) => setFormState({ ...formState, wl_operator: e.target.value })}
                />
                {attempted && errors.wl_operator && (
                  <div className="sf-field-error-text">{errors.wl_operator}</div>
                )}
              </div>

              <div style={{ fontWeight: 600, fontSize: "12px", color: "var(--neutral-500)", marginTop: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Before Winding
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "8px" }}>
                <div className="sf-field">
                  <label>No. of bobbins</label>
                  <input
                    type="number"
                    value={bobbinsCount}
                    disabled
                    style={{ background: "var(--neutral-100)", cursor: "not-allowed" }}
                  />
                  <div className="hint" style={{ fontSize: "10px", marginTop: "2px", color: "var(--neutral-500)" }}>From linked issue</div>
                </div>
                <div className="sf-field">
                  <label>Empty bobbins total (g)</label>
                  <input
                    type="number"
                    value={emptyBobbinsG}
                    disabled
                    style={{ background: "var(--neutral-100)", cursor: "not-allowed" }}
                  />
                  <div className="hint" style={{ fontSize: "10px", marginTop: "2px", color: "var(--neutral-500)" }}>Count × 16.0 g</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
                {/* Side A */}
                <div style={{ background: "var(--neutral-50)", border: "1px solid var(--neutral-200)", borderRadius: "8px", padding: "12px" }}>
                  <div style={{ fontWeight: 700, fontSize: "12px", color: "var(--primary-700)", marginBottom: "8px", textTransform: "uppercase" }}>
                    BEAM / SIDE A
                  </div>
                  <div className="sf-field">
                    <label style={{ fontSize: "11px" }}>Newspaper A (g)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={formState.wl_ns_a}
                      onChange={(e) => setFormState({ ...formState, wl_ns_a: e.target.value })}
                    />
                  </div>
                  <div className="sf-field">
                    <label style={{ fontSize: "11px" }}>Fruity paper A (g)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={formState.wl_fp_a}
                      onChange={(e) => setFormState({ ...formState, wl_fp_a: e.target.value })}
                    />
                  </div>
                  <div className="sf-field">
                    <label style={{ fontSize: "11px" }}>Empty beam weight A (g)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={formState.wl_eb_a}
                      onChange={(e) => setFormState({ ...formState, wl_eb_a: e.target.value })}
                    />
                  </div>
                </div>

                {/* Side B */}
                <div style={{ background: "var(--neutral-50)", border: "1px solid var(--neutral-200)", borderRadius: "8px", padding: "12px" }}>
                  <div style={{ fontWeight: 700, fontSize: "12px", color: "var(--primary-700)", marginBottom: "8px", textTransform: "uppercase" }}>
                    BEAM / SIDE B
                  </div>
                  <div className="sf-field">
                    <label style={{ fontSize: "11px" }}>Newspaper B (g)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={formState.wl_ns_b}
                      onChange={(e) => setFormState({ ...formState, wl_ns_b: e.target.value })}
                    />
                  </div>
                  <div className="sf-field">
                    <label style={{ fontSize: "11px" }}>Fruity paper B (g)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={formState.wl_fp_b}
                      onChange={(e) => setFormState({ ...formState, wl_fp_b: e.target.value })}
                    />
                  </div>
                  <div className="sf-field">
                    <label style={{ fontSize: "11px" }}>Empty beam weight B (g)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={formState.wl_eb_b}
                      onChange={(e) => setFormState({ ...formState, wl_eb_b: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div style={{ fontWeight: 600, fontSize: "12px", color: "var(--neutral-500)", marginTop: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                After Winding
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "8px" }}>
                <div className={`sf-field ${attempted && errors.wl_gross_a ? "has-error" : ""}`}>
                  <label>Gross weight A (g) <span className="req">*</span></label>
                  <input
                    type="number"
                    placeholder="0"
                    value={formState.wl_gross_a}
                    onChange={(e) => setFormState({ ...formState, wl_gross_a: e.target.value })}
                  />
                  {attempted && errors.wl_gross_a && (
                    <div className="sf-field-error-text">{errors.wl_gross_a}</div>
                  )}
                </div>
                <div className={`sf-field ${attempted && errors.wl_gross_b ? "has-error" : ""}`}>
                  <label>Gross weight B (g) <span className="req">*</span></label>
                  <input
                    type="number"
                    placeholder="0"
                    value={formState.wl_gross_b}
                    onChange={(e) => setFormState({ ...formState, wl_gross_b: e.target.value })}
                  />
                  {attempted && errors.wl_gross_b && (
                    <div className="sf-field-error-text">{errors.wl_gross_b}</div>
                  )}
                </div>
              </div>

              <div style={{ fontWeight: 600, fontSize: "12px", color: "var(--neutral-500)", marginTop: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Result
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "8px" }}>
                <div style={{ background: "var(--warning-50)", border: "1px solid var(--warning-200)", borderRadius: "8px", padding: "12px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--warning-700)", textTransform: "uppercase" }}>
                    Net Zari Consumed A
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: 700, marginTop: "4px" }}>
                    {netA} g
                  </div>
                </div>
                <div style={{ background: "var(--warning-50)", border: "1px solid var(--warning-200)", borderRadius: "8px", padding: "12px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--warning-700)", textTransform: "uppercase" }}>
                    Net Zari Consumed B
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: 700, marginTop: "4px" }}>
                    {netB} g
                  </div>
                </div>
              </div>

              <div style={{ background: "var(--primary-50)", border: "1px solid var(--primary-200)", borderRadius: "8px", padding: "12px", marginTop: "12px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--primary-700)", textTransform: "uppercase" }}>
                  Total Net Zari Consumed (A + B)
                </div>
                <div style={{ fontSize: "22px", fontWeight: 700, marginTop: "4px", color: "var(--primary-800)" }}>
                  {totalConsumed} g
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg btn-block"
                style={{ marginTop: "16px" }}
                disabled={submitting || jobCards.filter((jc) => jc.status === "in_progress").length === 0}
              >
                {submitting ? "Submitting..." : "Submit log"}
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
