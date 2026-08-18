"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import Icon from "@/components/Icons";
import ConfirmModal from "@/components/ConfirmModal";
import ReconciliationPanel from "@/components/ReconciliationPanel";
import { fmtG, todayISO, issueLineComputedNet } from "@/lib/math";

const MARK_TO_BOBBIN = 4;
const BOBBIN_TARE_REF_G = 19.0;

export default function RewindPirnPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stageCompletions, setStageCompletions] = useState([]);
  const [lots, setLots] = useState([]);
  const [productionIssues, setProductionIssues] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [items, setItems] = useState([]);
  const [stockLedger, setStockLedger] = useState([]);
  const [stageOutputMaps, setStageOutputMaps] = useState([]);

  // Active Tab
  const [activeTab, setActiveTab] = useState("reconcile");
  const [completeStageName, setCompleteStageName] = useState("Rewinding");

  // Form State
  const [formState, setFormState] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [reasons, setReasons] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState(null);

  // Modals
  const [modal, setModal] = useState({ isOpen: false, kind: null, comp: null, reason: "" });

  const loadData = async () => {
    try {
      const list = await db.get("stageCompletions");
      const lList = await db.get("lots");
      const iList = await db.get("productionIssues");
      const cList = await db.get("carriers");
      const itemsList = await db.get("items");
      const ledgerList = await db.get("stockLedger");
      const mapsList = await db.get("stageOutputMaps");

      setStageCompletions(list);
      setLots(lList);
      setProductionIssues(iList);
      setCarriers(cList);
      setItems(itemsList);
      setStockLedger(ledgerList);
      setStageOutputMaps(mapsList);

      // Pre-populate reasons
      const initialReasons = {};
      list.forEach((sc) => {
        initialReasons[sc.id] = sc.reason || "";
      });
      setReasons(initialReasons);
      setLoading(false);
    } catch (e) {
      console.error("Failed to load winding data", e);
      setLoading(false);
    }
  };

  useEffect(() => {
    const activeUser = getSessionUser();
    setUser(activeUser);
    loadData();
  }, []);

  useEffect(() => {
    if (notification) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [notification]);

  const handleReasonChange = (compId, val) => {
    setReasons({ ...reasons, [compId]: val });
  };

  const handleCloseClick = (comp, isOverride) => {
    const reasonText = reasons[comp.id] || "";
    setModal({
      isOpen: true,
      kind: isOverride ? "close-override" : "close-normal",
      comp,
      reason: isOverride ? reasonText : ""
    });
  };

  const handleReverseClick = (comp) => {
    setModal({ isOpen: true, kind: "reverse", comp, reason: "" });
  };

  const handleConfirmAction = async () => {
    if (modal.kind === "confirm-issue") {
      await handleConfirmIssue();
      return;
    }

    const actor = `${user.name} · ${user.roleLabel}`;
    setSubmitting(true);

    try {
      const comp = stageCompletions.find((sc) => sc.id === modal.comp.id);
      if (modal.kind === "close-normal" || modal.kind === "close-override") {
        const isOverride = modal.kind === "close-override";
        comp.status = isOverride ? "flagged" : "closed";
        comp.reason = isOverride ? modal.reason : null;

        await db.save("stageCompletions", comp, "id");

        // Write off ledger variance
        if (comp.variance_g > 0) {
          const sleId = `SLE-${String((await db.get("stockLedger")).length + 1).padStart(6, "0")}`;
          await db.save("stockLedger", {
            id: sleId,
            lot: comp.from_lot,
            item: lots.find((l) => l.id === comp.from_lot)?.item || "Zari thread",
            qty_g: -comp.variance_g,
            type: "variance_writeoff",
            ref: comp.issue_id,
            location: comp.machine === "REW-02" ? "REW-02" : "PIRN-03"
          }, "id", sleId);
        }

        await db.save("auditLog", {
          ts: new Date().toLocaleTimeString(),
          actor,
          action: isOverride ? "Closed stage with override" : "Closed stage",
          ref: `${comp.issue_id} · variance ${fmtG(comp.variance_g)} g`
        });

        setNotification({
          tone: isOverride ? "warning" : "success",
          text: `${comp.stage} closed successfully.`
        });
      } else if (modal.kind === "reverse") {
        comp.status = "needs_approval";
        await db.save("stageCompletions", comp, "id");

        // Restore ledger variance
        if (comp.variance_g > 0) {
          const sleId = `SLE-${String((await db.get("stockLedger")).length + 1).padStart(6, "0")}`;
          await db.save("stockLedger", {
            id: sleId,
            lot: comp.from_lot,
            item: lots.find((l) => l.id === comp.from_lot)?.item || "Zari thread",
            qty_g: comp.variance_g,
            type: "reversal",
            ref: comp.issue_id,
            location: comp.machine === "REW-02" ? "REW-02" : "PIRN-03"
          }, "id", sleId);
        }

        await db.save("auditLog", {
          ts: new Date().toLocaleTimeString(),
          actor,
          action: "Reversed stage close",
          ref: comp.issue_id
        });

        setNotification({ tone: "warning", text: `Reopened ${comp.stage} closure.` });
      }
      setModal({ isOpen: false, kind: null, comp: null, reason: "" });
      loadData();
    } catch (e) {
      console.error(e);
      setNotification({ tone: "danger", text: "Operation failed." });
    } finally {
      setSubmitting(false);
    }
  };

  // Helper Functions for Winding
  const stageInputItem = (stageName) => {
    const rule = stageOutputMaps.find((m) => m.stage === stageName);
    return rule ? rule.input_item : null;
  };

  const stageIssuableLots = (stageName) => {
    const inputItem = stageInputItem(stageName);
    return lots.filter((l) => l.item === inputItem);
  };

  const rewindSourceLots = (sourceType) => {
    const rLots = stageIssuableLots("Rewinding");
    return rLots.filter((l) => (sourceType === "direct" ? !l.is_partial : !!l.is_partial));
  };

  const getLotAvailableG = (lotId) => {
    return Math.max(0, db.getLotBalance(lotId, stockLedger));
  };

  const defaultRewindLotId = (sourceType) => {
    const rLots = rewindSourceLots(sourceType);
    const availableAny = rLots.find((l) => getLotAvailableG(l.id) > 0);
    return (availableAny || rLots[0] || {}).id;
  };

  const openRewindingCompletions = () => {
    return stageCompletions.filter((s) => {
      if (s.stage !== "Rewinding") return false;
      const lot = lots.find((l) => l.id === s.to_lot);
      return lot && getLotAvailableG(lot.id) > 0;
    });
  };

  const postLedger = async (lotId, item, qtyG, type, ref, location) => {
    const sleId = `SLE-${String((await db.get("stockLedger")).length + 1).padStart(6, "0")}`;
    await db.save("stockLedger", {
      id: sleId,
      lot: lotId,
      item: item,
      qty_g: qtyG,
      type: type,
      ref: ref,
      location: location
    }, "id", sleId);
  };

  const postWaste = async (stage, item, qtyG, ref, location) => {
    const wstId = `WST-${String((await db.get("wasteEntries")).length + 1).padStart(6, "0")}`;
    await db.save("wasteEntries", {
      id: wstId,
      stage: stage,
      item: item,
      qty_g: qtyG,
      ref: ref,
      location: location
    }, "id", wstId);
  };

  // Issue Action Handlers
  const handleIssueLineAdd = () => {
    const f = formState;
    const sourceType = f.rw_source_type || "warping";
    const lotsList = rewindSourceLots(sourceType);
    const lotId = f.rw_issue_lot || defaultRewindLotId(sourceType);
    const lot = lotsList.find((l) => l.id === lotId);
    const pendingLines = f.rw_issue_lines || [];
    const available = lot ? getLotAvailableG(lot.id) : 0;
    const reserved = pendingLines.filter((l) => l.lot === lotId).reduce((s, l) => s + l.net_g, 0);
    const remaining = Math.max(0, available - reserved);
    const calc = issueLineComputedNet(lot, f, "rw_il_");

    setAttempted(true);
    if (!lot || calc.net_g <= 0 || calc.net_g > remaining) {
      return;
    }

    const newLine = {
      lot: lotId,
      uom: calc.uom,
      net_g: calc.net_g,
      marks: calc.marks || 0,
      bobbins: calc.bobbins || 0
    };

    setFormState({
      ...f,
      rw_issue_lines: [...pendingLines, newLine],
      rw_il_marks: "",
      rw_il_bobbins: "",
      rw_il_gross: "",
      rw_il_crate: "",
      rw_il_bw: "",
      rw_il_qty_g: ""
    });
    setAttempted(false);
  };

  const handleIssueLineRemove = (idx) => {
    const f = formState;
    const pendingLines = f.rw_issue_lines || [];
    pendingLines.splice(idx, 1);
    setFormState({ ...f, rw_issue_lines: [...pendingLines] });
  };

  const handleConfirmIssueClick = () => {
    if (!formState.rw_issue_to_name?.trim()) {
      setFormErrors({ rw_issue_to_name: "Name is required." });
      setAttempted(true);
      return;
    }
    setModal({ isOpen: true, kind: "confirm-issue", reason: "" });
  };

  const handleConfirmIssue = async () => {
    setSubmitting(true);
    try {
      const lines = formState.rw_issue_lines || [];
      const issuedTo = formState.rw_issue_to_name || "Unnamed";
      const remarks = formState.rw_issue_remarks || "";
      const totalNet = lines.reduce((s, l) => s + l.net_g, 0);

      const newIssueId = `ISS-${String((await db.get("productionIssues")).length + 45).padStart(6, "0")}`;

      const newIssue = {
        id: newIssueId,
        machine: "REW-02",
        operator: issuedTo,
        remarks: remarks,
        status: "issued",
        date: todayISO(),
        lines: lines.map((l) => ({ lot: l.lot, qty_g: l.net_g })),
        qty_g: totalNet,
        lot: lines.map((l) => l.lot).join(", ")
      };

      await db.save("productionIssues", newIssue, "id", newIssueId);

      // Post Ledger entries and update lot status
      for (const l of lines) {
        const lot = lots.find((x) => x.id === l.lot);
        if (!lot) continue;

        await postLedger(lot.id, lot.item, -l.net_g, "issue", newIssueId, "REW-02");

        // Wait! Recalculate balance locally to check if fully issued
        const currentBal = getLotAvailableG(lot.id) - l.net_g;
        if (currentBal <= 0) {
          lot.status = "issued";
          lot.location = "REW-02";
          await db.save("lots", lot, "id");
        }
      }

      // Audit log
      const actor = `${user.name} · ${user.roleLabel}`;
      await db.save("auditLog", {
        ts: new Date().toLocaleTimeString(),
        actor,
        action: "Issued material (Rewinding)",
        ref: `${newIssueId} · ${lines.length} lines`
      });

      setNotification({ tone: "success", text: `${fmtG(totalNet)} g issued as ${newIssueId}.` });
      setFormState({});
      setAttempted(false);
      setModal({ isOpen: false, kind: null, comp: null, reason: "" });
      loadData();
    } catch (e) {
      console.error(e);
      setNotification({ tone: "danger", text: "Failed to confirm issue." });
    } finally {
      setSubmitting(false);
    }
  };

  // Completion Submit Handler
  const handleCompleteSubmit = async (stageName, prefix, pieceUom) => {
    const f = formState;
    const isPirn = stageName === "Pirn winding";

    const openIssues = isPirn ? [] : productionIssues.filter((i) => {
      if (i.machine !== "REW-02") return false;
      const claimed = stageCompletions.filter((s) => s.issue_id === i.id).reduce((s, c) => s + c.issued_g, 0);
      return (i.qty_g - claimed) > 0;
    });

    const openSources = isPirn ? openRewindingCompletions() : openIssues;
    const sourceId = f[prefix + "_issue"] || (openSources[0] && openSources[0].id);
    const source = openSources.find((s) => s.id === sourceId);
    const sourceOutputLot = isPirn && source ? lots.find((l) => l.id === source.to_lot) : null;

    const issuedAvailable = !source ? 0
      : isPirn ? getLotAvailableG(sourceOutputLot?.id)
      : source.qty_g - stageCompletions.filter((s) => s.issue_id === source.id).reduce((s, c) => s + c.issued_g, 0);

    const pieces = Number(f[prefix + "_pieces"] || 0);
    const gross = Number(f[prefix + "_gross"] || 0);
    const crate = Number(f[prefix + "_crate"] || 0);
    const bw = Number(f[prefix + "_bw"] || 0);
    const net = isPirn ? Math.max(0, gross - crate) : Math.max(0, gross - crate - (pieces * bw));
    const waste = Number(f[prefix + "_waste"] || 0);

    const invalid = !source || !String(f[prefix + "_pieces"] || "").trim() || pieces <= 0 || !Number.isInteger(pieces) ||
      !String(f[prefix + "_gross"] || "").trim() || gross <= 0 || net <= 0 || !String(f[prefix + "_waste"] || "").trim() || waste < 0;

    setAttempted(true);
    if (invalid) return;

    setSubmitting(true);
    try {
      const outputItem = isPirn ? "Pirn — finished" : "Rewound bobbin";
      const wasteItem = "Zari waste";
      const outputItemRec = items.find((i) => i.name === outputItem);

      const sourceLot = isPirn ? sourceOutputLot : lots.find((l) => l.id === (source.lines && source.lines[0]?.lot)) || {};
      const targetLocation = isPirn ? "PIRN-03" : "REW-02";

      const newLotId = `LOT-${String((await db.get("lots")).length + 1).padStart(8, "0")}`;
      await db.save("lots", {
        id: newLotId,
        item: outputItem,
        item_id: outputItemRec ? outputItemRec.code : null,
        location: "STORE-01",
        parent: sourceLot?.id || null,
        source: source.id,
        batch: sourceLot?.batch || null,
        qty_pieces: pieces,
        piece_uom: pieceUom,
        is_mixed_batch: false,
        carrier_code: null,
        landed_cost_per_gram: sourceLot?.landed_cost_per_gram || null,
        status: "available"
      }, "id", newLotId);

      const newScId = `SC-${String((await db.get("stageCompletions")).length + 1).padStart(6, "0")}`;
      const variance = issuedAvailable - net - waste;
      const varPct = issuedAvailable > 0 ? (Math.abs(variance) / issuedAvailable) * 100 : 0;

      await db.save("stageCompletions", {
        id: newScId,
        stage: stageName,
        issue_id: source.id,
        from_lot: sourceLot?.id || null,
        to_lot: newLotId,
        machine: targetLocation,
        issued_g: issuedAvailable,
        output_g: net,
        waste_g: waste,
        returned_g: 0,
        variance_g: variance,
        variance_pct: varPct,
        tolerance_pct: 0.50,
        status: "needs_approval",
        pieces_note: `${pieces} ${pieceUom.toLowerCase()}${pieces === 1 ? "" : "s"} produced`
      }, "id", newScId);

      // If Pirn winding, deduct source lot (rewound bobbins)
      if (isPirn && sourceLot) {
        await postLedger(sourceLot.id, sourceLot.item, -issuedAvailable, "issue", newScId, "PIRN-03");
        const currentBal = getLotAvailableG(sourceLot.id) - issuedAvailable;
        if (currentBal <= 0) {
          sourceLot.status = "issued";
          sourceLot.location = "PIRN-03";
          await db.save("lots", sourceLot, "id");
        }
      }

      await postLedger(newLotId, outputItem, net, "stage_output", newScId, "STORE-01");

      if (waste > 0) {
        await postWaste(stageName, wasteItem, waste, newScId, "WASTE-01");
      }

      // Audit log
      const actor = `${user.name} · ${user.roleLabel}`;
      await db.save("auditLog", {
        ts: new Date().toLocaleTimeString(),
        actor,
        action: `Completed ${stageName.toLowerCase()}`,
        ref: `${newScId} · ${source.id}`
      });

      setNotification({ tone: "success", text: `${newScId} recorded — ${pieces} ${pieceUom.toLowerCase()}${pieces === 1 ? "" : "s"}, ${fmtG(net)} g, ${fmtG(waste)} g waste.` });
      setFormState({});
      setAttempted(false);
      loadData();
    } catch (e) {
      console.error(e);
      setNotification({ tone: "danger", text: "Failed to record completion." });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="small muted">Loading Winding records...</div>;
  }

  const role = user?.role;
  const isSupervisor = role === "inv_sup" || role === "admin";
  const canAdminApprove = role === "admin";

  const getStatusBadge = (status) => {
    switch (status) {
      case "closed":
        return "success";
      case "needs_approval":
        return "warning";
      case "flagged":
        return "flagged";
      default:
        return "neutral";
    }
  };

  // Compute values for Tab 1 (Issue Material)
  const sourceType = formState.rw_source_type || "warping";
  const activeLots = rewindSourceLots(sourceType);
  const selectedLotId = formState.rw_issue_lot || defaultRewindLotId(sourceType);
  const selectedLot = activeLots.find((l) => l.id === selectedLotId) || activeLots[0];
  const available = selectedLot ? getLotAvailableG(selectedLot.id) : 0;
  const reservedOnThisLot = (formState.rw_issue_lines || []).filter((l) => l.lot === selectedLotId).reduce((s, l) => s + l.net_g, 0);
  const remainingOnThisLot = Math.max(0, available - reservedOnThisLot);
  const calc = issueLineComputedNet(selectedLot, formState, "rw_il_");
  const pendingLines = formState.rw_issue_lines || [];
  const totalNet = pendingLines.reduce((s, l) => s + l.net_g, 0);

  // Compute values for Tab 2 (Complete Stage)
  const isPirn = completeStageName === "Pirn winding";
  const openIssues = isPirn ? [] : productionIssues.filter((i) => {
    if (i.machine !== "REW-02") return false;
    const claimed = stageCompletions.filter((s) => s.issue_id === i.id).reduce((s, c) => s + c.issued_g, 0);
    return (i.qty_g - claimed) > 0;
  });
  const openSources = isPirn ? openRewindingCompletions() : openIssues;
  const prefix = isPirn ? "pirn" : "rewind";
  const compSourceId = formState[prefix + "_issue"] || (openSources[0] && openSources[0].id);
  const compSource = openSources.find((s) => s.id === compSourceId);
  const compSourceOutputLot = isPirn && compSource ? lots.find((l) => l.id === compSource.to_lot) : null;
  const compIssuedAvailable = !compSource ? 0
    : isPirn ? getLotAvailableG(compSourceOutputLot?.id)
    : compSource.qty_g - stageCompletions.filter((s) => s.issue_id === compSource.id).reduce((s, c) => s + c.issued_g, 0);

  const compPieces = Number(formState[prefix + "_pieces"] || 0);
  const compGross = Number(formState[prefix + "_gross"] || 0);
  const compCrate = Number(formState[prefix + "_crate"] || 0);
  const compBw = Number(formState[prefix + "_bw"] || 0);
  const compNet = isPirn ? Math.max(0, compGross - compCrate) : Math.max(0, compGross - compCrate - (compPieces * compBw));
  const compWaste = Number(formState[prefix + "_waste"] || 0);
  const compVariance = compSource ? compIssuedAvailable - compNet - compWaste : 0;

  return (
    <>
      <div className="page-head">
        <h1>Rewinding & Pirn winding</h1>
      </div>

      {notification && (
        <div className={`banner banner-${notification.tone}`}>
          <Icon name={notification.tone === "danger" ? "alert" : "check"} size={18} />
          <div>{notification.text}</div>
        </div>
      )}

      {/* Tabs Switcher */}
      <div className="tabs" style={{ display: "flex", gap: "10px", borderBottom: "1px solid var(--neutral-200)", paddingBottom: "10px", marginBottom: "20px" }}>
        <button
          className={`btn ${activeTab === "reconcile" ? "btn-primary" : ""}`}
          onClick={() => { setActiveTab("reconcile"); setNotification(null); }}
        >
          Reconciliation
        </button>
        <button
          className={`btn ${activeTab === "issue" ? "btn-primary" : ""}`}
          onClick={() => { setActiveTab("issue"); setNotification(null); }}
        >
          Issue Material
        </button>
        <button
          className={`btn ${activeTab === "complete" ? "btn-primary" : ""}`}
          onClick={() => { setActiveTab("complete"); setNotification(null); }}
        >
          Complete Stage
        </button>
      </div>

      {/* --- TAB 1: RECONCILIATION --- */}
      {activeTab === "reconcile" && (
        <>
          <div className="banner banner-neutral" style={{ marginBottom: "16px" }}>
            <Icon name="alert" size={18} />
            <div>
              Completions are reported directly from the mobile shop-floor app.
              Supervisors run reconciliations and sign off closures here.
            </div>
          </div>

          {stageCompletions.length === 0 ? (
            <div className="small muted">No stage completions pending reconciliation.</div>
          ) : (
            stageCompletions.map((comp) => {
              const over = comp.variance_pct > comp.tolerance_pct;
              const isClosed = comp.status === "closed" || comp.status === "flagged";
              const reasonText = reasons[comp.id] || "";

              return (
                <div key={comp.id} className="card" style={{ marginBottom: "18px" }}>
                  <div className="page-head" style={{ marginBottom: "12px" }}>
                    <h2 style={{ fontSize: "15px" }}>
                      {comp.stage} — {comp.machine}
                    </h2>
                    <span className={`badge badge-${getStatusBadge(comp.status)}`}>
                      {comp.status === "closed"
                        ? "Closed"
                        : comp.status === "needs_approval"
                        ? "Needs approval"
                        : "Approved with override"}
                    </span>
                  </div>

                  <div className="tag-row" style={{ marginBottom: "14px" }}>
                    <span className="chip">{comp.issue_id}</span>
                    <span className="chip">
                      {comp.from_lot} → {comp.to_lot}
                    </span>
                  </div>

                  {comp.sources && (
                    <div className="small muted" style={{ marginBottom: "10px" }}>
                      Sources: {comp.sources.join(", ")}
                      {comp.is_mixed_batch && (
                        <span>
                          {" "}
                          — <strong>mixed batch</strong>, merged from more than one source lot.
                        </span>
                      )}
                    </div>
                  )}

                  {comp.pieces_note && (
                    <div className="small muted" style={{ marginBottom: "10px" }}>
                      {comp.pieces_note}
                    </div>
                  )}

                  <ReconciliationPanel
                    issued={comp.issued_g}
                    output={comp.output_g}
                    waste={comp.waste_g}
                    returned={comp.returned_g}
                    variance_g={comp.variance_g}
                    variance_pct={comp.variance_pct}
                    tolerance_pct={comp.tolerance_pct}
                    reason={reasonText}
                    onChangeReason={(val) => handleReasonChange(comp.id, val)}
                  />

                  <div style={{ marginTop: "16px" }}>
                    {!isClosed ? (
                      over ? (
                        canAdminApprove ? (
                          <button
                            className="btn btn-primary"
                            disabled={!reasonText.trim()}
                            onClick={() => handleCloseClick(comp, true)}
                          >
                            Approve & close (over tolerance)
                          </button>
                        ) : (
                          <div className="lock-row">
                            <Icon name="gear" size={14} />
                            Over tolerance — only Admin can approve this close.
                          </div>
                        )
                      ) : isSupervisor ? (
                        <button className="btn btn-primary" onClick={() => handleCloseClick(comp, false)}>
                          Close Stage
                        </button>
                      ) : (
                        <div className="lock-row">
                          <Icon name="gear" size={14} />
                          Ready — awaiting supervisor sign-off.
                        </div>
                      )
                    ) : user && canEdit("reverse", role) ? (
                      <button className="btn btn-danger" onClick={() => handleReverseClick(comp)}>
                        Reverse this close
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}

      {/* --- TAB 2: ISSUE MATERIAL --- */}
      {activeTab === "issue" && (
        <div className="card" style={{ maxWidth: "640px" }}>
          {!isSupervisor && (
            <div className="banner banner-neutral" style={{ marginBottom: "16px" }}>
              <Icon name="alert" size={18} />
              <div>Issuing material is done by the Inventory Supervisor.</div>
            </div>
          )}
          <div className="banner banner-neutral" style={{ marginBottom: "16px" }}>
            <Icon name="alert" size={18} />
            <div>Issue material into Rewinding only — pirn winding is a linked hand-off from a completed rewinding run, not a separate issue (see the Complete stage tab).</div>
          </div>

          <div className="field">
            <label>Source</label>
            <select
              value={sourceType}
              disabled={!isSupervisor}
              onChange={(e) => setFormState({ ...formState, rw_source_type: e.target.value, rw_issue_lot: "" })}
            >
              <option value="warping">From Warping (leftover bobbins)</option>
              <option value="direct">Direct issue (fresh batch)</option>
            </select>
            <div className="hint">Most rewinding starts from the leftover bobbins weighed back in after Warping. Direct issue — a fresh batch straight from stores — is the less common case, but fully supported.</div>
          </div>

          {selectedLot ? (
            <div className="field">
              <label>Approved batch</label>
              <select
                value={selectedLotId}
                disabled={!isSupervisor}
                onChange={(e) => setFormState({ ...formState, rw_issue_lot: e.target.value })}
              >
                {activeLots.map((l) => {
                  const av = getLotAvailableG(l.id);
                  return (
                    <option key={l.id} value={l.id} disabled={av <= 0}>
                      {l.id} · {l.batch || "—"} · {fmtG(av)} g available {av <= 0 ? "(fully issued)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          ) : null}

          {selectedLot && (
            <>
              {selectedLot.piece_uom === "Mark" ? (
                <>
                  <div className="small muted" style={{ margin: "10px 0 8px", textTransform: "uppercase", letterSpacing: ".02em", fontWeight: 600 }}>Quantity</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                    <div className="field">
                      <label>Number of marks</label>
                      <input
                        type="number"
                        disabled={!isSupervisor}
                        value={formState.rw_il_marks || ""}
                        onChange={(e) => setFormState({ ...formState, rw_il_marks: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Bobbins (auto)</label>
                      <input value={calc.bobbins || 0} disabled />
                      <div className="hint">1 mark = {MARK_TO_BOBBIN} bobbins</div>
                    </div>
                  </div>
                  <div className="small muted" style={{ margin: "10px 0 8px", textTransform: "uppercase", letterSpacing: ".02em", fontWeight: 600 }}>Weights</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
                    <div className="field">
                      <label>Gross weight (g)</label>
                      <input
                        type="number"
                        disabled={!isSupervisor}
                        value={formState.rw_il_gross || ""}
                        onChange={(e) => setFormState({ ...formState, rw_il_gross: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Crate weight (g)</label>
                      <input
                        type="number"
                        disabled={!isSupervisor}
                        value={formState.rw_il_crate || ""}
                        onChange={(e) => setFormState({ ...formState, rw_il_crate: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Bobbin weight (g)</label>
                      <input
                        type="number"
                        disabled={!isSupervisor}
                        value={formState.rw_il_bw || ""}
                        onChange={(e) => setFormState({ ...formState, rw_il_bw: e.target.value })}
                      />
                      <div className="hint">Ref: ~{BOBBIN_TARE_REF_G} g each</div>
                    </div>
                  </div>
                </>
              ) : selectedLot.piece_uom === "Bobbin" ? (
                <>
                  <div className="small muted" style={{ margin: "10px 0 8px", textTransform: "uppercase", letterSpacing: ".02em", fontWeight: 600 }}>Quantity</div>
                  <div className="field">
                    <label>Number of bobbins</label>
                    <input
                      type="number"
                      disabled={!isSupervisor}
                      value={formState.rw_il_bobbins || ""}
                      onChange={(e) => setFormState({ ...formState, rw_il_bobbins: e.target.value })}
                    />
                  </div>
                  <div className="small muted" style={{ margin: "10px 0 8px", textTransform: "uppercase", letterSpacing: ".02em", fontWeight: 600 }}>Weights</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
                    <div className="field">
                      <label>Gross weight (g)</label>
                      <input
                        type="number"
                        disabled={!isSupervisor}
                        value={formState.rw_il_gross || ""}
                        onChange={(e) => setFormState({ ...formState, rw_il_gross: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Crate weight (g)</label>
                      <input
                        type="number"
                        disabled={!isSupervisor}
                        value={formState.rw_il_crate || ""}
                        onChange={(e) => setFormState({ ...formState, rw_il_crate: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Bobbin weight (g)</label>
                      <input
                        type="number"
                        disabled={!isSupervisor}
                        value={formState.rw_il_bw || ""}
                        onChange={(e) => setFormState({ ...formState, rw_il_bw: e.target.value })}
                      />
                      <div className="hint">Ref: ~{BOBBIN_TARE_REF_G} g each</div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="field">
                  <label>Quantity (g)</label>
                  <input
                    type="number"
                    disabled={!isSupervisor}
                    value={formState.rw_il_qty_g || ""}
                    onChange={(e) => setFormState({ ...formState, rw_il_qty_g: e.target.value })}
                  />
                  <div className="hint">{selectedLotId} is denominated in {selectedLot.piece_uom || "grams"} — no marks/crate conversion applies here.</div>
                </div>
              )}
            </>
          )}

          {!selectedLot ? (
            <div className="banner banner-warning" style={{ marginTop: "16px" }}>
              <Icon name="alert" size={18} />
              <div>No available {sourceType === "direct" ? "fresh" : "leftover-from-Warping"} lots of {stageInputItem("Rewinding") || "the expected item"} to issue.</div>
            </div>
          ) : (
            <div className="banner banner-neutral" style={{ marginTop: "10px" }}>
              <div style={{ width: "100%" }}>
                <div className="small" style={{ fontWeight: 600, color: "var(--accent-700)" }}>NET ZARI (this line)</div>
                <div style={{ fontSize: "22px", fontWeight: 700, margin: "2px 0" }}>{fmtG(Math.max(0, calc.net_g))} g</div>
                {attempted && calc.net_g <= 0 ? (
                  <div className="field-error-text">Net must be greater than 0 — check weights.</div>
                ) : attempted && calc.net_g > remainingOnThisLot ? (
                  <div className="field-error-text">Exceeds what's left in {selectedLotId} ({fmtG(remainingOnThisLot)} g remaining).</div>
                ) : (
                  <div className="small muted">{fmtG(remainingOnThisLot)} g remaining in {selectedLotId} {reservedOnThisLot > 0 ? `after ${fmtG(reservedOnThisLot)} g already staged` : ""}.</div>
                )}
              </div>
            </div>
          )}

          {isSupervisor && selectedLot && (
            <button className="btn" style={{ marginTop: "10px" }} onClick={handleIssueLineAdd}>
              <Icon name="plus" size={16} /> Add to issue
            </button>
          )}

          {pendingLines.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: "16px" }}>Lines added to this issue</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Lot</th>
                      <th>UOM</th>
                      <th>Qty</th>
                      <th className="num">Net</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingLines.map((l, idx) => {
                      const qtyLabel = l.uom === "Mark" ? `${l.marks} marks (${l.bobbins} bobbins)` : l.uom === "Bobbin" ? `${l.bobbins} bobbins` : "—";
                      return (
                        <tr key={idx}>
                          <td>{l.lot}</td>
                          <td>{l.uom}</td>
                          <td>{qtyLabel}</td>
                          <td className="num">{fmtG(l.net_g)} g</td>
                          <td>
                            {isSupervisor && (
                              <button className="btn" style={{ padding: "2px 8px", fontSize: "12px" }} onClick={() => handleIssueLineRemove(idx)}>Remove</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="recon-line" style={{ fontWeight: 600, marginTop: "8px" }}>
                <span className="l">Total net across all lines</span>
                <span className="num">{fmtG(totalNet)} g</span>
              </div>
            </>
          )}

          <hr className="divider" style={{ margin: "20px 0" }} />

          <div className="field">
            <label>Issued to (name)</label>
            <input
              disabled={!isSupervisor}
              value={formState.rw_issue_to_name || ""}
              onChange={(e) => setFormState({ ...formState, rw_issue_to_name: e.target.value })}
              placeholder="e.g. Ashok"
            />
            {attempted && formErrors.rw_issue_to_name && (
              <div className="field-error-text">{formErrors.rw_issue_to_name}</div>
            )}
          </div>
          <div className="field">
            <label>Remarks <span className="small muted">(optional)</span></label>
            <textarea
              disabled={!isSupervisor}
              value={formState.rw_issue_remarks || ""}
              onChange={(e) => setFormState({ ...formState, rw_issue_remarks: e.target.value })}
              placeholder="Optional notes"
            />
          </div>

          {isSupervisor && (
            <button className="btn btn-primary" disabled={!pendingLines.length} onClick={handleConfirmIssueClick}>
              Confirm issue
            </button>
          )}
        </div>
      )}

      {/* --- TAB 3: COMPLETE STAGE --- */}
      {activeTab === "complete" && (
        <div className="card" style={{ maxWidth: "560px" }}>
          {!isSupervisor && (
            <div className="banner banner-neutral" style={{ marginBottom: "16px" }}>
              <Icon name="alert" size={18} />
              <div>Stage completions are recorded by the Inventory Supervisor.</div>
            </div>
          )}

          {/* Sub-selector for Stage */}
          <div className="field">
            <label>Select Stage to Complete</label>
            <select
              value={completeStageName}
              disabled={!isSupervisor}
              onChange={(e) => {
                setCompleteStageName(e.target.value);
                setFormState({});
                setFormErrors({});
                setAttempted(false);
              }}
            >
              <option value="Rewinding">Rewinding</option>
              <option value="Pirn winding">Pirn winding</option>
            </select>
          </div>

          {isPirn && (
            <div className="banner banner-neutral" style={{ marginBottom: "16px" }}>
              <Icon name="alert" size={18} />
              <div>Linked directly to a completed rewinding run — no separate issue step.</div>
            </div>
          )}

          {!openSources.length ? (
            <div className="banner banner-warning" style={{ marginTop: "16px" }}>
              <Icon name="alert" size={18} />
              <div>
                {isPirn
                  ? "No completed rewinding runs with bobbins on hand yet. Complete a rewinding run first — pirn winding always follows straight on from it."
                  : "No open Rewinding issues to complete. Issue material into Rewinding first."}
              </div>
            </div>
          ) : (
            <>
              <div className="field">
                <label>{isPirn ? "Rewinding run" : "Issue"}</label>
                <select
                  value={compSourceId}
                  disabled={!isSupervisor}
                  onChange={(e) => setFormState({ ...formState, [prefix + "_issue"]: e.target.value })}
                >
                  {openSources.map((s) => {
                    const lotLabel = isPirn
                      ? ` · ${s.to_lot} · ${fmtG(getLotAvailableG(s.to_lot))} g on hand`
                      : "";
                    return (
                      <option key={s.id} value={s.id}>
                        {s.id} {lotLabel}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="recon-line">
                <span className="l">Issued (given to this run)</span>
                <span className="num">{fmtG(compIssuedAvailable)} g</span>
              </div>

              <hr className="divider" style={{ margin: "20px 0" }} />

              <div className="field">
                <label>{isPirn ? "Number of pirns produced" : "Number of bobbins produced"}</label>
                <input
                  type="number"
                  disabled={!isSupervisor}
                  value={formState[prefix + "_pieces"] || ""}
                  onChange={(e) => setFormState({ ...formState, [prefix + "_pieces"]: e.target.value })}
                />
                {attempted && !String(formState[prefix + "_pieces"] || "").trim() && (
                  <div className="field-error-text">Enter a positive whole number.</div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isPirn ? "1fr 1fr" : "1fr 1fr 1fr", gap: "14px" }}>
                <div className="field">
                  <label>Gross weight (g)</label>
                  <input
                    type="number"
                    disabled={!isSupervisor}
                    value={formState[prefix + "_gross"] || ""}
                    onChange={(e) => setFormState({ ...formState, [prefix + "_gross"]: e.target.value })}
                  />
                  {attempted && !String(formState[prefix + "_gross"] || "").trim() && (
                    <div className="field-error-text">Required.</div>
                  )}
                </div>
                <div className="field">
                  <label>Crate weight (g)</label>
                  <input
                    type="number"
                    disabled={!isSupervisor}
                    value={formState[prefix + "_crate"] || ""}
                    onChange={(e) => setFormState({ ...formState, [prefix + "_crate"]: e.target.value })}
                  />
                </div>
                {!isPirn && (
                  <div className="field">
                    <label>Bobbin weight (g)</label>
                    <input
                      type="number"
                      disabled={!isSupervisor}
                      value={formState[prefix + "_bw"] || ""}
                      onChange={(e) => setFormState({ ...formState, [prefix + "_bw"]: e.target.value })}
                    />
                    <div className="hint">Ref: ~{BOBBIN_TARE_REF_G} g each</div>
                  </div>
                )}
              </div>

              <div className="field">
                <label>Waste (g)</label>
                <input
                  type="number"
                  disabled={!isSupervisor}
                  value={formState[prefix + "_waste"] || ""}
                  onChange={(e) => setFormState({ ...formState, [prefix + "_waste"]: e.target.value })}
                />
                {attempted && !String(formState[prefix + "_waste"] || "").trim() && (
                  <div className="field-error-text">Required.</div>
                )}
              </div>

              <div className="banner banner-neutral" style={{ marginTop: "16px" }}>
                <div style={{ width: "100%" }}>
                  <div className="small" style={{ fontWeight: 600, color: "var(--accent-700)" }}>RESULT</div>
                  <div className="recon-line">
                    <span className="l">Net output</span>
                    <span className="num">{fmtG(compNet)} g</span>
                  </div>
                  <div className="recon-line">
                    <span className="l">Waste</span>
                    <span className="num">{fmtG(compWaste)} g</span>
                  </div>
                  <div className="recon-line" style={{ fontWeight: 600 }}>
                    <span className="l">Variance (issued − output − waste)</span>
                    <span className="num">{fmtG(compVariance)} g</span>
                  </div>
                  {attempted && compNet <= 0 && (
                    <div className="field-error-text">Net output must be greater than 0 — check weights.</div>
                  )}
                </div>
              </div>

              {isSupervisor && (
                <button
                  className="btn btn-primary"
                  style={{ marginTop: "10px" }}
                  onClick={() => handleCompleteSubmit(completeStageName, prefix, isPirn ? "Pirn" : "Bobbin")}
                >
                  Record completion
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* --- CONFIRM MODAL --- */}
      <ConfirmModal
        isOpen={modal.isOpen}
        title={
          modal.kind === "confirm-issue"
            ? "Confirm issue"
            : modal.kind === "reverse"
            ? `Reverse close — ${modal.comp?.issue_id}`
            : `Close stage — ${modal.comp?.issue_id}`
        }
        sub={
          modal.kind === "confirm-issue"
            ? `Confirms the lines leave stores and are issued to Rewinding.`
            : modal.kind === "reverse"
            ? "Reopens this stage and logs reversing entries in the ledger. Admin only."
            : modal.kind === "close-override"
            ? "You are approving an out-of-tolerance close. This writes off the variance."
            : "This posts stage closure and writes off variance shrinkage."
        }
        confirmLabel={
          modal.kind === "confirm-issue"
            ? "Confirm issue"
            : modal.kind === "reverse"
            ? "Reverse close"
            : "Confirm close"
        }
        isDanger={modal.kind === "reverse"}
        submitting={submitting}
        requiresReason={modal.kind === "reverse"}
        reason={modal.reason}
        onChangeReason={(val) => setModal({ ...modal, reason: val })}
        attempted={submitting}
        onCancel={() => setModal({ isOpen: false, kind: null, comp: null, reason: "" })}
        onConfirm={handleConfirmAction}
      />
    </>
  );
}
