"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import Icon from "@/components/Icons";
import ConfirmModal from "@/components/ConfirmModal";
import ReconciliationPanel from "@/components/ReconciliationPanel";
import {
  estimatedConsumptionG,
  issueLineComputedNet,
  fmtG,
  fmtPct,
  todayISO,
  BOBBIN_TARE_REF_G,
  MARK_TO_BOBBIN
} from "@/lib/math";

export default function WarpingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "jobcards";

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab);

  // DB States
  const [lots, setLots] = useState([]);
  const [issues, setIssues] = useState([]);
  const [jobCards, setJobCards] = useState([]);
  const [warpingLogs, setWarpingLogs] = useState([]);
  const [returns, setReturns] = useState([]);
  const [warpingClose, setWarpingClose] = useState({});
  const [carriers, setCarriers] = useState([]);
  const [productionSpaces, setProductionSpaces] = useState([]);
  const [items, setItems] = useState([]);
  const [purchases, setPurchases] = useState([]);

  // Form States
  const [formState, setFormState] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState(null);

  // Modals
  const [modal, setModal] = useState({ isOpen: false, kind: null, id: null, reason: "" });

  const loadData = async () => {
    try {
      const itemsList = await db.get("items");
      const pList = await db.get("purchases");
      const lList = await db.get("lots");
      const iList = await db.get("productionIssues");
      const jcList = await db.get("jobCards");
      const logs = await db.get("warpingLogs");
      const rList = await db.get("returns");
      const close = await db.get("warpingClose");
      const cList = await db.get("carriers");
      const pSpaces = await db.get("productionSpaces");

      setItems(itemsList);
      setPurchases(pList);
      setLots(lList);
      setIssues(iList);
      setJobCards(jcList);
      setWarpingLogs(logs);
      setReturns(rList);
      setWarpingClose(close || {});
      setCarriers(cList);
      setProductionSpaces(pSpaces);
      setLoading(false);
    } catch (e) {
      console.error("Failed to load warping data", e);
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

  // Update URL query parameter when tab changes
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setFormState({});
    setFormErrors({});
    setAttempted(false);
    setNotification(null);
    router.push(`/office/warping?tab=${tabId}`);
  };

  // --- TAB 1: ISSUE MATERIAL LOGIC ---
  const getIssuableLots = () => {
    const rawZariItems = items.filter(i => i.type === "Raw zari").map(i => i.name);
    return lots.filter((l) => rawZariItems.includes(l.item) || /thread/i.test(l.item) || /jari/i.test(l.item));
  };

  const getRawZariItem = () => {
    return items.find(i => i.type === "Raw zari") || { name: "Zari thread — 90 count", code: "ZR-001" };
  };

  const [prevSelectedLotId, setPrevSelectedLotId] = useState("");

  const handleLotChange = (lotId) => {
    const lot = lots.find((l) => l.id === lotId);
    if (lot) {
      const p = purchases.find((x) => x.id === lot.source);
      if (p) {
        const isMark = p.uom === "Mark";
        const emptyPerBobbin = Number(p.empty_per_unit_g || 0) / (isMark ? MARK_TO_BOBBIN : 1);
        const grossPerUnit = Number(p.gross_per_unit_g || 0) || (Number(p.net_g || 0) / Number(p.qty || 1) + Number(p.empty_per_unit_g || 0));
        const totalGross = grossPerUnit * Number(p.qty || 0);

        setFormState((prev) => ({
          ...prev,
          issue_lot: lotId,
          il_marks: isMark ? p.qty : "",
          il_bobbins: isMark ? "" : p.qty,
          il_gross: totalGross,
          il_crate: 0,
          il_bw: emptyPerBobbin
        }));
      } else {
        setFormState((prev) => ({
          ...prev,
          issue_lot: lotId,
          il_marks: lot.piece_uom === "Mark" ? lot.qty_pieces : "",
          il_bobbins: lot.piece_uom === "Bobbin" ? lot.qty_pieces : "",
          il_gross: "",
          il_crate: 0,
          il_bw: BOBBIN_TARE_REF_G
        }));
      }
    } else {
      setFormState((prev) => ({ ...prev, issue_lot: lotId }));
    }
  };

  useEffect(() => {
    if (selectedLot && prevSelectedLotId !== selectedLot.id) {
      setPrevSelectedLotId(selectedLot.id);
      handleLotChange(selectedLot.id);
    }
  }, [selectedLot, purchases, prevSelectedLotId]);

  const getLotAvailableG = (lotId) => {
    return Math.max(0, db.getLotBalance(lotId));
  };

  const handleIssueLineAdd = () => {
    const activeLotId = formState.issue_lot || getIssuableLots()[0]?.id;
    const selectedLot = lots.find((l) => l.id === activeLotId);
    if (!selectedLot) return;

    const calc = issueLineComputedNet(selectedLot, formState);
    const available = getLotAvailableG(activeLotId);
    const alreadyStaged = (formState.issue_lines || []).filter((l) => l.lot === activeLotId).reduce((s, l) => s + l.net_g, 0);
    const remaining = available - alreadyStaged;

    if (calc.net_g <= 0 || calc.net_g > remaining) {
      setFormErrors({ ...formErrors, il_qty: "Net weight must be > 0 and cannot exceed lot balance." });
      setAttempted(true);
      return;
    }

    const currentLines = formState.issue_lines || [];
    const newLine = {
      lot: activeLotId,
      uom: selectedLot.piece_uom || "Grams",
      net_g: calc.net_g,
      marks: calc.marks || 0,
      bobbins: calc.bobbins || 0
    };

    setFormState({
      ...formState,
      issue_lines: [...currentLines, newLine],
      il_marks: "",
      il_bobbins: "",
      il_gross: "",
      il_crate: "",
      il_bw: "",
      il_qty_g: ""
    });
    setFormErrors({});
    setAttempted(false);
  };

  const handleIssueLineRemove = (idx) => {
    const currentLines = formState.issue_lines || [];
    currentLines.splice(idx, 1);
    setFormState({ ...formState, issue_lines: [...currentLines] });
  };

  const handleConfirmIssueClick = () => {
    if (!formState.issue_to_name?.trim()) {
      setFormErrors({ ...formErrors, issue_to_name: "Name is required." });
      setAttempted(true);
      return;
    }
    setModal({ isOpen: true, kind: "confirm-issue", reason: "" });
  };

  // --- TAB 2: JOB CARDS LOGIC ---
  const getWarpingIssues = () => {
    return issues.filter((i) => i.machine === "WARP-01" || i.machine === "WARP-02");
  };

  const handleOpenJcCreate = () => {
    setFormState({
      _jcCreate: true,
      jc_issue: getWarpingIssues()[0]?.id || "",
      jc_date: todayISO(),
      jc_design: "",
      jc_type: "BORDER",
      jc_loom: productionSpaces[0]?.code || "",
      jc_operator: "",
      jc_ends: "",
      jc_length: "",
      jc_width: ""
    });
    setFormErrors({});
  };

  const handleJcSubmit = async (status) => {
    if (!formState.jc_design?.trim()) {
      setFormErrors({ jobcard: "Saree design description is required." });
      return;
    }
    if (!formState.jc_operator?.trim()) {
      setFormErrors({ jobcard: "Operator name is required." });
      return;
    }
    const ends = Number(formState.jc_ends || 0);
    const len = Number(formState.jc_length || 0);
    const wid = Number(formState.jc_width || 0);
    if (ends <= 0 || len <= 0 || wid <= 0) {
      setFormErrors({ jobcard: "Ends, length, and width must be positive values." });
      return;
    }

    setSubmitting(true);
    try {
      const issue = issues.find((i) => i.id === formState.jc_issue) || issues[0];
      const jcId = `JC-${String(jobCards.length + 1).padStart(6, "0")}`;

      const newJc = {
        id: jcId,
        issue_id: issue.id,
        carrier: null,
        type: formState.jc_type,
        ends,
        length_m: len,
        width_in: wid,
        saree_design: formState.jc_design,
        loom_no: formState.jc_loom,
        operator: formState.jc_operator,
        empty_g: null,
        filled_g: null,
        paper_g: null,
        output_g: null,
        waste_g: null,
        consumed_g: 0,
        status: status // 'pending' or 'in_progress'
      };

      await db.save("jobCards", newJc, "id", jcId);

      const actor = `${user.name} · ${user.roleLabel}`;
      await db.save("auditLog", {
        ts: new Date().toLocaleTimeString(),
        actor,
        action: `Created job card (${status})`,
        ref: jcId
      });

      setNotification({ tone: "success", text: `Job card ${jcId} created successfully.` });
      setFormState({});
      loadData();
    } catch (e) {
      console.error(e);
      setNotification({ tone: "danger", text: "Failed to create job card." });
    } finally {
      setSubmitting(false);
    }
  };

  // --- TAB 3: WARPING LOGS & WEIGHINGS ---
  const handleOpenWlCreate = () => {
    const inProgressCards = jobCards.filter((jc) => jc.status === "in_progress");
    setFormState({
      _wlCreate: true,
      wl_jobcard: inProgressCards[0]?.id || "",
      wl_operator: "",
      wl_ns_a: "",
      wl_fp_a: "",
      wl_eb_a: "",
      wl_gross_a: "",
      wl_ns_b: "",
      wl_fp_b: "",
      wl_eb_b: "",
      wl_gross_b: ""
    });
    setFormErrors({});
  };

  const handleWlSubmit = async () => {
    const jcId = formState.wl_jobcard;
    const jc = jobCards.find((j) => j.id === jcId);
    if (!jc) return;

    if (!formState.wl_operator?.trim()) {
      setFormErrors({ wl_operator: "Operator name is required." });
      setAttempted(true);
      return;
    }

    const grossA = Number(formState.wl_gross_a || 0);
    const grossB = Number(formState.wl_gross_b || 0);
    if (grossA <= 0 || grossB <= 0) {
      setFormErrors({ wl_gross_a: "Gross weights are required and must be > 0." });
      setAttempted(true);
      return;
    }

    setSubmitting(true);
    try {
      const issue = issues.find((i) => i.id === jc.issue_id);
      const lot = lots.find((l) => l.id === (issue.lines[0]?.lot));
      const bobbins = lot?.qty_pieces || 0;

      const nsA = Number(formState.wl_ns_a || 0);
      const fpA = Number(formState.wl_fp_a || 0);
      const ebA = Number(formState.wl_eb_a || 0);
      const nsB = Number(formState.wl_ns_b || 0);
      const fpB = Number(formState.wl_fp_b || 0);
      const ebB = Number(formState.wl_eb_b || 0);

      const netA = Math.max(0, grossA - nsA - fpA - ebA);
      const netB = Math.max(0, grossB - nsB - fpB - ebB);
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
      const lotAId = `LOT-${String(lots.length + 1).padStart(8, "0")}`;
      const lotBId = `LOT-${String(lots.length + 2).padStart(8, "0")}`;

      await db.save("lots", {
        id: lotAId,
        item: "Warped beam — partial",
        item_id: "ZB-001",
        location: "STORE-01",
        parent: lot?.id || null,
        source: jc.id,
        batch: lot?.batch || "BATCH-2627-00001",
        qty_pieces: 1,
        piece_uom: "Beam",
        is_mixed_batch: false,
        carrier_code: "BEAM-07",
        landed_cost_per_gram: lot?.landed_cost_per_gram || 10,
        status: "available"
      }, "id", lotAId);

      await db.save("lots", {
        id: lotBId,
        item: "Warped beam — partial",
        item_id: "ZB-001",
        location: "STORE-01",
        parent: lot?.id || null,
        source: jc.id,
        batch: lot?.batch || "BATCH-2627-00001",
        qty_pieces: 1,
        piece_uom: "Beam",
        is_mixed_batch: false,
        carrier_code: "BEAM-11",
        landed_cost_per_gram: lot?.landed_cost_per_gram || 10,
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
        action: "Completed job card weighing",
        ref: `${jc.id} · ${fmtG(totalNet)} g`
      });

      setNotification({ tone: "success", text: `Weighing log ${wlId} posted. Beams created.` });
      setFormState({});
      loadData();
    } catch (e) {
      console.error(e);
      setNotification({ tone: "danger", text: "Failed to record log." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordWasteClick = (wl) => {
    setModal({ isOpen: true, kind: "waste", id: wl.id, reason: "" });
  };

  // --- TAB 4: RETURNS LOGIC ---
  const handleAcceptReturnClick = (retId) => {
    setModal({ isOpen: true, kind: "accept-return", id: retId, reason: "" });
  };

  // --- TAB 5: RECONCILIATION & CLOSE LOGIC ---
  const handleWarpingCloseClick = (isOverride) => {
    setModal({
      isOpen: true,
      kind: isOverride ? "close-override" : "close-normal",
      id: "ISS-000044",
      reason: isOverride ? formState.warping_close_reason || "" : ""
    });
  };

  const handleReverseCloseClick = () => {
    setModal({ isOpen: true, kind: "reverse-close", id: "ISS-000044", reason: "" });
  };

  // --- MAIN CONFIRMATION DISPATCHER ---
  const handleConfirmAction = async () => {
    const actor = `${user.name} · ${user.roleLabel}`;
    setSubmitting(true);

    try {
      if (modal.kind === "confirm-issue") {
        const lines = formState.issue_lines || [];
        const totalNet = lines.reduce((s, l) => s + l.net_g, 0);

        const newIssueId = `ISS-${String(issues.length + 45).padStart(6, "0")}`;
        const newIssue = {
          id: newIssueId,
          machine: "WARP-02",
          operator: formState.issue_to_name,
          remarks: formState.issue_remarks || "",
          status: "issued",
          date: todayISO(),
          lines: lines.map((l) => ({ lot: l.lot, qty_g: l.net_g })),
          qty_g: totalNet,
          lot: lines.map((l) => l.lot).join(", ")
        };

        await db.save("productionIssues", newIssue, "id", newIssueId);

        for (const l of lines) {
          const lot = lots.find((x) => x.id === l.lot);
          const sleId = `SLE-${String((await db.get("stockLedger")).length + 1).padStart(6, "0")}`;
          await db.save("stockLedger", {
            id: sleId,
            lot: lot.id,
            item: lot.item,
            qty_g: -l.net_g,
            type: "issue",
            ref: newIssueId,
            location: "WARP-01"
          }, "id", sleId);

          if (getLotAvailableG(lot.id) - l.net_g <= 0) {
            lot.status = "issued";
            lot.location = "WARP-01";
            await db.save("lots", lot, "id");
          }
        }

        await db.save("auditLog", {
          ts: new Date().toLocaleTimeString(),
          actor,
          action: "Issued material",
          ref: `${newIssueId} · ${fmtG(totalNet)} g`
        });

        setNotification({ tone: "success", text: `${newIssueId} issued successfully.` });
        setFormState({});
      } else if (modal.kind === "waste") {
        const wasteG = Number(modal.reason || 0);
        const log = warpingLogs.find((wl) => wl.id === modal.id);
        const jc = jobCards.find((j) => j.id === log.job_card);

        log.waste_g = wasteG;
        jc.waste_g = wasteG;
        jc.consumed_g = Number(jc.output_g || 0) + wasteG;

        await db.save("warpingLogs", log, "id");
        await db.save("jobCards", jc, "id");

        const wstId = `WST-${String((await db.get("wasteEntries")).length + 1).padStart(6, "0")}`;
        await db.save("wasteEntries", {
          id: wstId,
          stage: "Warping",
          item: "Zari waste",
          qty_g: wasteG,
          ref: log.id,
          location: "WASTE-01"
        }, "id", wstId);

        await db.save("auditLog", {
          ts: new Date().toLocaleTimeString(),
          actor,
          action: "Recorded waste",
          ref: `${log.id} · ${fmtG(wasteG)} g`
        });

        setNotification({ tone: "success", text: `Recorded ${fmtG(wasteG)} g waste for ${log.id}.` });
      } else if (modal.kind === "accept-return") {
        const ret = returns.find((r) => r.id === modal.id);
        ret.status = "accepted";

        const originLot = lots.find((l) => l.id === "LOT-00000001") || {};
        const newLotId = `LOT-${String(lots.length + 1).padStart(8, "0")}`;

        await db.save("lots", {
          id: newLotId,
          item: getRawZariItem().name,
          item_id: getRawZariItem().code,
          location: "STORE-01",
          parent: null,
          source: ret.id,
          batch: originLot.batch || "BATCH-2627-00001",
          qty_pieces: ret.bobbins,
          piece_uom: "Bobbin",
          is_mixed_batch: false,
          carrier_code: null,
          landed_cost_per_gram: originLot.landed_cost_per_gram || 10,
          status: "available",
          is_partial: true
        }, "id", newLotId);

        ret.lot = newLotId;
        await db.save("returns", ret, "id");

        const sleId = `SLE-${String((await db.get("stockLedger")).length + 1).padStart(6, "0")}`;
        await db.save("stockLedger", {
          id: sleId,
          lot: newLotId,
          item: getRawZariItem().name,
          qty_g: ret.net_g,
          type: "return_receipt",
          ref: ret.id,
          location: "STORE-01"
        }, "id", sleId);

        await db.save("auditLog", {
          ts: new Date().toLocaleTimeString(),
          actor,
          action: "Accepted return",
          ref: `${ret.id} · ${fmtG(ret.net_g)} g`
        });

        setNotification({ tone: "success", text: `${ret.id} accepted. Lot ${newLotId} created.` });
      } else if (modal.kind === "close-normal" || modal.kind === "close-override") {
        const isOverride = modal.kind === "close-override";
        warpingClose.status = isOverride ? "flagged" : "closed";
        warpingClose.reason = isOverride ? modal.reason : null;

        await db.save("warpingClose", warpingClose);

        if (warpingClose.variance_g > 0) {
          const sleId = `SLE-${String((await db.get("stockLedger")).length + 1).padStart(6, "0")}`;
          await db.save("stockLedger", {
            id: sleId,
            lot: "LOT-00000001",
            item: getRawZariItem().name,
            qty_g: -warpingClose.variance_g,
            type: "variance_writeoff",
            ref: "ISS-000044",
            location: "WARP-01"
          }, "id", sleId);
        }

        await db.save("auditLog", {
          ts: new Date().toLocaleTimeString(),
          actor,
          action: isOverride ? "Closed warping with override" : "Closed warping",
          ref: `ISS-000044 · variance ${fmtG(warpingClose.variance_g)} g`
        });

        setNotification({
          tone: isOverride ? "warning" : "success",
          text: `Warping closed ${isOverride ? "with approved override" : "successfully"}.`
        });
      } else if (modal.kind === "reverse-close") {
        warpingClose.status = warpingClose.variance_pct > warpingClose.tolerance_pct ? "needs_approval" : "within_tolerance";
        await db.save("warpingClose", warpingClose);

        if (warpingClose.variance_g > 0) {
          const sleId = `SLE-${String((await db.get("stockLedger")).length + 1).padStart(6, "0")}`;
          await db.save("stockLedger", {
            id: sleId,
            lot: "LOT-00000001",
            item: getRawZariItem().name,
            qty_g: warpingClose.variance_g,
            type: "reversal",
            ref: "ISS-000044",
            location: "WARP-01"
          }, "id", sleId);
        }

        await db.save("auditLog", {
          ts: new Date().toLocaleTimeString(),
          actor,
          action: "Reversed warping close",
          ref: "ISS-000044"
        });

        setNotification({ tone: "warning", text: "Warping close reversed. Stage reopened." });
      }
      setModal({ isOpen: false, kind: null, id: null, reason: "" });
      loadData();
    } catch (e) {
      console.error(e);
      setNotification({ tone: "danger", text: "Operation failed." });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="small muted">Loading Warping workflows...</div>;
  }

  const role = user?.role;
  const isSupervisor = role === "inv_sup" || role === "admin";
  const canAdminApprove = role === "admin";

  const selectedLotId = formState.issue_lot || getIssuableLots()[0]?.id;
  const selectedLot = lots.find((l) => l.id === selectedLotId) || getIssuableLots()[0];
  const lotAvailable = selectedLot ? getLotAvailableG(selectedLot.id) : 0;
  const alreadyStaged = (formState.issue_lines || []).filter((l) => l.lot === selectedLotId).reduce((s, l) => s + l.net_g, 0);
  const remainingInSelectedLot = lotAvailable - alreadyStaged;
  const lineCalc = selectedLot ? issueLineComputedNet(selectedLot, formState) : { net_g: 0 };

  return (
    <>
      <div className="page-head">
        <h1>Warping</h1>
      </div>

      {notification && (
        <div className={`banner banner-${notification.tone}`}>
          <Icon name={notification.tone === "danger" ? "alert" : "check"} size={18} />
          <div>{notification.text}</div>
        </div>
      )}

      <div className="subnav">
        <button className={activeTab === "issue" ? "active" : ""} onClick={() => handleTabChange("issue")}>
          Issue material
        </button>
        <button className={activeTab === "jobcards" ? "active" : ""} onClick={() => handleTabChange("jobcards")}>
          Job cards
        </button>
        <button className={activeTab === "warpinglogs" ? "active" : ""} onClick={() => handleTabChange("warpinglogs")}>
          Warping log
        </button>
        <button className={activeTab === "returns" ? "active" : ""} onClick={() => handleTabChange("returns")}>
          Returns
        </button>
        <button className={activeTab === "close" ? "active" : ""} onClick={() => handleTabChange("close")}>
          Reconciliation & close
        </button>
      </div>

      {/* --- ISSUE MATERIAL TAB --- */}
      {activeTab === "issue" && (
        <div className="card">
          {!isSupervisor && (
            <div className="banner banner-neutral">
              <Icon name="alert" size={18} />
              <div>Issuing material is done by the Inventory Supervisor. Viewing current issue below.</div>
            </div>
          )}

          <div className={`field ${lineCalc.net_g > remainingInSelectedLot ? "has-error" : ""}`}>
            <label>Approved batch</label>
            <select
              value={selectedLotId}
              disabled={!isSupervisor}
              onChange={(e) => setFormState({ ...formState, issue_lot: e.target.value })}
            >
              {getIssuableLots().map((l) => (
                <option key={l.id} value={l.id}>
                  {l.id} · {l.batch} · {fmtG(getLotAvailableG(l.id))} g available
                </option>
              ))}
            </select>
            {lineCalc.net_g > remainingInSelectedLot && (
              <div className="field-error-text" style={{ marginTop: "4px", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}>
                <span>⚠️ Calculated net weight ({fmtG(lineCalc.net_g)} g) exceeds the remaining lot balance of {fmtG(remainingInSelectedLot)} g!</span>
              </div>
            )}
          </div>

          {selectedLot?.piece_uom === "Mark" ? (
            <>
              <div className="small muted" style={{ margin: "10px 0 8px", fontWeight: 600 }}>
                Quantity
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div className="field">
                  <label>Number of marks</label>
                  <input
                    type="number"
                    disabled={!isSupervisor}
                    value={formState.il_marks || ""}
                    onChange={(e) => setFormState({ ...formState, il_marks: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Bobbins (auto)</label>
                  <input value={Number(formState.il_marks || 0) * MARK_TO_BOBBIN} disabled />
                </div>
              </div>
              <div className="small muted" style={{ margin: "10px 0 8px", fontWeight: 600 }}>
                Weights
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
                <div className="field">
                  <label>Gross weight (g)</label>
                  <input
                    type="number"
                    disabled={!isSupervisor}
                    value={formState.il_gross || ""}
                    onChange={(e) => setFormState({ ...formState, il_gross: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Crate weight (g)</label>
                  <input
                    type="number"
                    disabled={!isSupervisor}
                    value={formState.il_crate || ""}
                    onChange={(e) => setFormState({ ...formState, il_crate: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Bobbin weight (g)</label>
                  <input
                    type="number"
                    disabled={!isSupervisor}
                    value={formState.il_bw || ""}
                    onChange={(e) => setFormState({ ...formState, il_bw: e.target.value })}
                    placeholder={`~${BOBBIN_TARE_REF_G}g`}
                  />
                </div>
              </div>
            </>
          ) : selectedLot?.piece_uom === "Bobbin" ? (
            <>
              <div className="small muted" style={{ margin: "10px 0 8px", fontWeight: 600 }}>
                Quantity
              </div>
              <div className="field">
                <label>Number of bobbins</label>
                <input
                  type="number"
                  disabled={!isSupervisor}
                  value={formState.il_bobbins || ""}
                  onChange={(e) => setFormState({ ...formState, il_bobbins: e.target.value })}
                />
              </div>
              <div className="small muted" style={{ margin: "10px 0 8px", fontWeight: 600 }}>
                Weights
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
                <div className="field">
                  <label>Gross weight (g)</label>
                  <input
                    type="number"
                    disabled={!isSupervisor}
                    value={formState.il_gross || ""}
                    onChange={(e) => setFormState({ ...formState, il_gross: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Crate weight (g)</label>
                  <input
                    type="number"
                    disabled={!isSupervisor}
                    value={formState.il_crate || ""}
                    onChange={(e) => setFormState({ ...formState, il_crate: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Bobbin weight (g)</label>
                  <input
                    type="number"
                    disabled={!isSupervisor}
                    value={formState.il_bw || ""}
                    onChange={(e) => setFormState({ ...formState, il_bw: e.target.value })}
                    placeholder={`~${BOBBIN_TARE_REF_G}g`}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="field">
              <label>Quantity (g)</label>
              <input
                type="number"
                disabled={!isSupervisor}
                value={formState.il_qty_g || ""}
                onChange={(e) => setFormState({ ...formState, il_qty_g: e.target.value })}
              />
            </div>
          )}

          <div className="banner banner-neutral" style={{ marginTop: "10px" }}>
            <div style={{ width: "100%" }}>
              <div className="small" style={{ fontWeight: 600, color: "var(--accent-700)" }}>
                NET ZARI (this line)
              </div>
              <div style={{ fontSize: "22px", fontWeight: 700, margin: "2px 0" }}>
                {fmtG(Math.max(0, lineCalc.net_g))} g
              </div>
              {attempted && lineCalc.net_g > remainingInSelectedLot && (
                <div className="field-error-text">Exceeds remaining lot balance of {fmtG(remainingInSelectedLot)} g.</div>
              )}
              <div className="small muted">
                {fmtG(remainingInSelectedLot)} g remaining in {selectedLotId}.
              </div>
            </div>
          </div>

          {isSupervisor && (
            <button className="btn" style={{ marginTop: "10px" }} onClick={handleIssueLineAdd}>
              <Icon name="plus" size={16} />
              Add to issue
            </button>
          )}

          {formState.issue_lines?.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: "16px" }}>
                Lines added to this issue
              </div>
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
                    {formState.issue_lines.map((l, idx) => (
                      <tr key={idx}>
                        <td>{l.lot}</td>
                        <td>{l.uom}</td>
                        <td>
                          {l.uom === "Mark"
                            ? `${l.marks} marks (${l.bobbins} bobbins)`
                            : l.uom === "Bobbin"
                            ? `${l.bobbins} bobbins`
                            : "—"}
                        </td>
                        <td className="num">{fmtG(l.net_g)} g</td>
                        <td>
                          {isSupervisor && (
                            <button
                              className="btn"
                              style={{ padding: "2px 8px", fontSize: "12px" }}
                              onClick={() => handleIssueLineRemove(idx)}
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <hr className="divider" />
          <div className={`field ${attempted && formErrors.issue_to_name ? "has-error" : ""}`}>
            <label>Issued to (name) <span className="req">*</span></label>
            <input
              type="text"
              disabled={!isSupervisor}
              value={formState.issue_to_name || ""}
              placeholder="e.g. Ramesh"
              onChange={(e) => setFormState({ ...formState, issue_to_name: e.target.value })}
            />
            {attempted && formErrors.issue_to_name && (
              <div className="field-error-text">{formErrors.issue_to_name}</div>
            )}
          </div>
          <div className="field">
            <label>Remarks</label>
            <textarea
              disabled={!isSupervisor}
              value={formState.issue_remarks || ""}
              onChange={(e) => setFormState({ ...formState, issue_remarks: e.target.value })}
            />
          </div>

          {isSupervisor && (
            <button
              className="btn btn-primary"
              disabled={!formState.issue_lines?.length}
              onClick={handleConfirmIssueClick}
            >
              Confirm issue
            </button>
          )}

          <hr className="divider" />
          <div className="section-title">Original issue (worked example)</div>
          <div className="recon-line">
            <span className="l">Reference</span>
            <span>ISS-000044</span>
          </div>
          <div className="recon-line">
            <span className="l">Lot</span>
            <span>LOT-00000001</span>
          </div>
          <div className="recon-line">
            <span className="l">Weighing</span>
            <span className="num">5,000.000 g</span>
          </div>
        </div>
      )}

      {/* --- JOB CARDS TAB --- */}
      {activeTab === "jobcards" && (
        <>
          <div className="page-head" style={{ marginBottom: "12px" }}>
            <h2>Job cards</h2>
            {user && canEdit("jobcard_create", role) && (
              <button className="btn btn-primary" onClick={handleOpenJcCreate}>
                <Icon name="plus" size={16} />
                Create job card
              </button>
            )}
          </div>

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Job card</th>
                    <th>Design</th>
                    <th>Type</th>
                    <th className="num">Ends</th>
                    <th className="num">Length (m)</th>
                    <th>Loom</th>
                    <th>Operator</th>
                    <th className="num">Output</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jobCards.map((jc) => (
                    <tr key={jc.id}>
                      <td>
                        <span className="chip">{jc.id}</span>
                      </td>
                      <td>{jc.saree_design}</td>
                      <td>{jc.type}</td>
                      <td className="num">{jc.ends}</td>
                      <td className="num">{Number(jc.length_m).toFixed(1)}</td>
                      <td>{jc.loom_no}</td>
                      <td>{jc.operator}</td>
                      <td className="num">{jc.output_g ? `${fmtG(jc.output_g)} g` : "—"}</td>
                      <td>
                        <span
                          className={`badge badge-${
                            jc.status === "complete"
                              ? "success"
                              : jc.status === "in_progress"
                              ? "neutral"
                              : "warning"
                          }`}
                        >
                          {jc.status === "complete"
                            ? "Complete"
                            : jc.status === "in_progress"
                            ? "In progress"
                            : "Draft"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Render Job Card Form in a Modal overlay */}
          {formState._jcCreate && (
            <div className="modal-overlay" onClick={() => setFormState({})}>
              <div className="modal" style={{ maxWidth: "560px" }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                  <h3 style={{ margin: 0 }}>Create job card</h3>
                  <input
                    type="date"
                    value={formState.jc_date}
                    onChange={(e) => setFormState({ ...formState, jc_date: e.target.value })}
                    style={{ width: "160px", padding: "6px 10px", fontSize: "13px" }}
                  />
                </div>
                {formErrors.jobcard && (
                  <div className="banner banner-danger" style={{ marginBottom: "12px" }}>
                    <Icon name="alert" size={18} />
                    <div>{formErrors.jobcard}</div>
                  </div>
                )}
                <form onSubmit={(e) => { e.preventDefault(); handleJcSubmit("in_progress"); }}>
                  <div className="modal-body">
                    {/* Job card no. */}
                    <div className="field">
                      <label>Job card no.</label>
                      <input value={`JC-${String(jobCards.length + 1).padStart(6, "0")}`} disabled />
                      <div className="hint">Auto-assigned, sequential — not editable.</div>
                    </div>

                    {/* Issued batch */}
                    <div className="field">
                      <label>Issued batch</label>
                      <select
                        value={formState.jc_issue}
                        onChange={(e) => setFormState({ ...formState, jc_issue: e.target.value })}
                      >
                        {getWarpingIssues().map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.id} ({fmtG(i.qty_g)} g)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Batch metrics banner */}
                    {(() => {
                      const activeIssue = issues.find((i) => i.id === formState.jc_issue) || getWarpingIssues()[0];
                      if (!activeIssue) return null;
                      const activeIssueJobCards = jobCards.filter((jc) => jc.issue_id === activeIssue.id);
                      const issuedWeight = Number(activeIssue.qty_g || 0);
                      const consumedWeight = activeIssueJobCards.reduce((sum, jc) => sum + Number(jc.consumed_g || 0), 0);
                      const remainingWeight = Math.max(0, issuedWeight - consumedWeight);
                      const jcCount = activeIssueJobCards.length;

                      return (
                        <div className="banner banner-neutral" style={{ padding: "10px 14px", marginBottom: "16px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", fontSize: "12.5px" }}>
                          <span>Issued <strong>{fmtG(issuedWeight)} g</strong></span>
                          <span>Consumed <strong>{fmtG(consumedWeight)} g</strong></span>
                          <span>Remaining <strong>{fmtG(remainingWeight)} g</strong></span>
                          <span>Job cards <strong>{jcCount}</strong></span>
                        </div>
                      );
                    })()}

                    <div style={{ fontWeight: 600, fontSize: "14px", marginTop: "16px", marginBottom: "8px", borderBottom: "1px solid var(--neutral-200)", paddingBottom: "4px" }}>SETUP</div>

                    {/* Saree design & Preparation type */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                      <div className="field">
                        <label>Saree design</label>
                        <input
                          type="text"
                          value={formState.jc_design}
                          placeholder="e.g. Kanjivaram Peacock"
                          onChange={(e) => setFormState({ ...formState, jc_design: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>Preparation type</label>
                        <select
                          value={formState.jc_type}
                          onChange={(e) => setFormState({ ...formState, jc_type: e.target.value })}
                        >
                          <option value="BORDER">Border warp</option>
                          <option value="BODY">Body warp</option>
                        </select>
                      </div>
                    </div>

                    {/* Loom no. & Operator */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                      <div className="field">
                        <label>Loom no.</label>
                        <select
                          value={formState.jc_loom}
                          onChange={(e) => setFormState({ ...formState, jc_loom: e.target.value })}
                        >
                          {productionSpaces.map((space) => (
                            <option key={space.id} value={space.code}>
                              {space.name}
                            </option>
                          ))}
                        </select>
                        <div className="hint">From Masters — Production spaces.</div>
                      </div>
                      <div className="field">
                        <label>Operator</label>
                        <input
                          type="text"
                          value={formState.jc_operator}
                          placeholder="Operator name"
                          onChange={(e) => setFormState({ ...formState, jc_operator: e.target.value })}
                        />
                      </div>
                    </div>

                    <div style={{ fontWeight: 600, fontSize: "14px", marginTop: "16px", marginBottom: "8px", borderBottom: "1px solid var(--neutral-200)", paddingBottom: "4px" }}>WARP PARAMETERS</div>

                    {/* Warp Parameters: Ends, Length, Width */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
                      <div className="field">
                        <label>Number of ends</label>
                        <input
                          type="number"
                          value={formState.jc_ends}
                          onChange={(e) => setFormState({ ...formState, jc_ends: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>Length (meters)</label>
                        <input
                          type="number"
                          value={formState.jc_length}
                          onChange={(e) => setFormState({ ...formState, jc_length: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>Warp width (inches)</label>
                        <input
                          type="number"
                          value={formState.jc_width}
                          onChange={(e) => setFormState({ ...formState, jc_width: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Estimated Consumption card */}
                    <div style={{ background: "var(--neutral-100)", borderRadius: "8px", padding: "16px", marginTop: "16px" }}>
                      <div className="small" style={{ fontWeight: 600, color: "var(--neutral-700)" }}>ESTIMATED CONSUMPTION ((ends × 2) × length ÷ 68)</div>
                      <div style={{ fontSize: "20px", fontWeight: 700, margin: "6px 0" }}>
                        {fmtG(estimatedConsumptionG(Number(formState.jc_ends), Number(formState.jc_length)))} g
                      </div>
                      <div className="small" style={{ color: "var(--neutral-50)" }}>This is a guide only. Actual figure comes from the warping log.</div>
                    </div>
                  </div>

                  <div className="modal-actions">
                    <button type="button" className="btn" onClick={() => setFormState({})}>
                      Cancel
                    </button>
                    <button type="button" className="btn" onClick={() => handleJcSubmit("pending")} disabled={submitting}>
                      Save as draft
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                      {submitting ? "Submitting..." : "Submit job card"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {/* --- WARPING LOG TAB --- */}
      {activeTab === "warpinglogs" && (
        <>
          <div className="page-head" style={{ marginBottom: "12px" }}>
            <h2>Warping logs</h2>
            {user && canEdit("complete_production", role) && (
              <button
                className="btn btn-primary"
                disabled={!jobCards.some((jc) => jc.status === "in_progress")}
                onClick={handleOpenWlCreate}
              >
                <Icon name="plus" size={16} />
                New warping log
              </button>
            )}
          </div>

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Log</th>
                    <th>Job card</th>
                    <th>Weaver</th>
                    <th className="num">Bobbins</th>
                    <th className="num">Net A</th>
                    <th className="num">Net B</th>
                    <th className="num">Total net</th>
                    <th>Waste</th>
                  </tr>
                </thead>
                <tbody>
                  {warpingLogs.map((wl) => (
                    <tr key={wl.id}>
                      <td>
                        <span className="chip">{wl.id}</span>
                      </td>
                      <td>{wl.job_card}</td>
                      <td>{wl.operator}</td>
                      <td className="num">{wl.bobbins}</td>
                      <td className="num">{fmtG(wl.sideA?.net_g)} g</td>
                      <td className="num">{fmtG(wl.sideB?.net_g)} g</td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {fmtG(wl.total_net_g)} g
                      </td>
                      <td>
                        {wl.waste_g != null ? (
                          `${fmtG(wl.waste_g)} g`
                        ) : user && canEdit("record_waste", role) ? (
                          <button
                            className="btn"
                            style={{ padding: "2px 10px", fontSize: "12px" }}
                            onClick={() => handleRecordWasteClick(wl)}
                          >
                            Record waste
                          </button>
                        ) : (
                          <span className="badge badge-warning">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Render Warping Log Form in a Modal overlay */}
          {formState._wlCreate && (
            <div className="modal-overlay" onClick={() => setFormState({})}>
              <div className="modal" style={{ maxWidth: "680px" }} onClick={(e) => e.stopPropagation()}>
                <h3>New warping log</h3>
                <form onSubmit={(e) => { e.preventDefault(); handleWlSubmit(); }}>
                  <div className="modal-body">
                    <div className="field">
                      <label>Job card</label>
                      <select
                        value={formState.wl_jobcard}
                        onChange={(e) => setFormState({ ...formState, wl_jobcard: e.target.value })}
                      >
                        {jobCards
                          .filter((jc) => jc.status === "in_progress")
                          .map((jc) => (
                            <option key={jc.id} value={jc.id}>
                              {jc.id} — {jc.saree_design} ({jc.operator})
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className={`field ${attempted && formErrors.wl_operator ? "has-error" : ""}`}>
                      <label>Operator name <span className="req">*</span></label>
                      <input
                        type="text"
                        value={formState.wl_operator}
                        onChange={(e) => setFormState({ ...formState, wl_operator: e.target.value })}
                      />
                      {attempted && formErrors.wl_operator && (
                        <div className="field-error-text">{formErrors.wl_operator}</div>
                      )}
                    </div>

                    <hr className="divider" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                      <div style={{ background: "var(--accent-100)", borderRadius: "8px", padding: "12px" }}>
                        <div className="small" style={{ fontWeight: 600, color: "var(--accent-700)", marginBottom: "8px" }}>
                          BEAM / SIDE A
                        </div>
                        <div className="field">
                          <label>Newspaper A (g)</label>
                          <input
                            type="number"
                            value={formState.wl_ns_a}
                            onChange={(e) => setFormState({ ...formState, wl_ns_a: e.target.value })}
                          />
                        </div>
                        <div className="field">
                          <label>Fruity paper A (g)</label>
                          <input
                            type="number"
                            value={formState.wl_fp_a}
                            onChange={(e) => setFormState({ ...formState, wl_fp_a: e.target.value })}
                          />
                        </div>
                        <div className="field">
                          <label>Empty beam A (g)</label>
                          <input
                            type="number"
                            value={formState.wl_eb_a}
                            onChange={(e) => setFormState({ ...formState, wl_eb_a: e.target.value })}
                          />
                        </div>
                        <div className={`field ${attempted && formErrors.wl_gross_a ? "has-error" : ""}`}>
                          <label>Gross weight A (g) <span className="req">*</span></label>
                          <input
                            type="number"
                            value={formState.wl_gross_a}
                            onChange={(e) => setFormState({ ...formState, wl_gross_a: e.target.value })}
                          />
                        </div>
                      </div>

                      <div style={{ background: "var(--accent-100)", borderRadius: "8px", padding: "12px" }}>
                        <div className="small" style={{ fontWeight: 600, color: "var(--accent-700)", marginBottom: "8px" }}>
                          BEAM / SIDE B
                        </div>
                        <div className="field">
                          <label>Newspaper B (g)</label>
                          <input
                            type="number"
                            value={formState.wl_ns_b}
                            onChange={(e) => setFormState({ ...formState, wl_ns_b: e.target.value })}
                          />
                        </div>
                        <div className="field">
                          <label>Fruity paper B (g)</label>
                          <input
                            type="number"
                            value={formState.wl_fp_b}
                            onChange={(e) => setFormState({ ...formState, wl_fp_b: e.target.value })}
                          />
                        </div>
                        <div className="field">
                          <label>Empty beam B (g)</label>
                          <input
                            type="number"
                            value={formState.wl_eb_b}
                            onChange={(e) => setFormState({ ...formState, wl_eb_b: e.target.value })}
                          />
                        </div>
                        <div className={`field ${attempted && formErrors.wl_gross_b ? "has-error" : ""}`}>
                          <label>Gross weight B (g) <span className="req">*</span></label>
                          <input
                            type="number"
                            value={formState.wl_gross_b}
                            onChange={(e) => setFormState({ ...formState, wl_gross_b: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    {attempted && (formErrors.wl_gross_a || formErrors.wl_gross_b) && (
                      <div className="field-error-text" style={{ marginTop: "14px" }}>
                        {formErrors.wl_gross_a || formErrors.wl_gross_b}
                      </div>
                    )}
                  </div>

                  <div className="modal-actions">
                    <button type="button" className="btn" onClick={() => setFormState({})}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Submit log
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {/* --- RETURNS TAB --- */}
      {activeTab === "returns" && (
        <div>
          {returns.map((ret) => (
            <div key={ret.id} className="card" style={{ marginBottom: "14px" }}>
              <div className="section-title">Return {ret.id}</div>
              <div className="recon-line">
                <span className="l">Bobbins</span>
                <span className="num">{ret.bobbins}</span>
              </div>
              <div className="recon-line">
                <span className="l">Gross weight</span>
                <span className="num">{fmtG(ret.gross_g)} g</span>
              </div>
              <div className="recon-line">
                <span className="l">Tare weight</span>
                <span className="num">{fmtG(ret.tare_g)} g</span>
              </div>
              <div className="recon-line" style={{ fontWeight: 500 }}>
                <span className="l">Net returned</span>
                <span className="num">{fmtG(ret.net_g)} g</span>
              </div>
              {ret.lot && (
                <div className="recon-line">
                  <span className="l">Lot created</span>
                  <span className="chip">{ret.lot}</span>
                </div>
              )}
              <div className="recon-line">
                <span className="l">Status</span>
                <span className={`badge badge-${ret.status === "accepted" ? "success" : "warning"}`}>
                  {ret.status === "accepted" ? "Accepted" : "Pending review"}
                </span>
              </div>

              {ret.status === "pending" && user && canEdit("accept_return", role) && (
                <button
                  className="btn btn-primary"
                  style={{ marginTop: "10px" }}
                  onClick={() => handleAcceptReturnClick(ret.id)}
                >
                  Accept return
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* --- CLOSE RECONCILIATION TAB --- */}
      {activeTab === "close" && (
        <div className="card">
          <div className="section-title">Reconciliation for ISS-000044</div>
          <ReconciliationPanel
            issued={warpingClose.issued_g}
            output={warpingClose.output_g}
            waste={warpingClose.waste_g}
            returned={warpingClose.returned_g}
            variance_g={warpingClose.variance_g}
            variance_pct={warpingClose.variance_pct}
            tolerance_pct={warpingClose.tolerance_pct}
            reason={formState.warping_close_reason}
            onChangeReason={(val) => setFormState({ ...formState, warping_close_reason: val })}
          />

          <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
            {warpingClose.status !== "closed" && warpingClose.status !== "flagged" ? (
              warpingClose.variance_pct <= warpingClose.tolerance_pct ? (
                <button className="btn btn-primary" onClick={() => handleWarpingCloseClick(false)}>
                  Close Warping
                </button>
              ) : canAdminApprove ? (
                <button
                  className="btn btn-primary"
                  disabled={!formState.warping_close_reason?.trim()}
                  onClick={() => handleWarpingCloseClick(true)}
                >
                  Approve & close (over tolerance)
                </button>
              ) : (
                <div className="lock-row">
                  <Icon name="gear" size={14} />
                  Over tolerance — only Admin can approve this close.
                </div>
              )
            ) : user && canEdit("reverse", role) ? (
              <button className="btn btn-danger" onClick={handleReverseCloseClick}>
                Reverse this close
              </button>
            ) : (
              <span className={`badge badge-${warpingClose.status === "flagged" ? "flagged" : "success"}`}>
                {warpingClose.status === "flagged" ? "Approved with override" : "Closed"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* --- CONFIRMATION MODALS --- */}
      <ConfirmModal
        isOpen={modal.isOpen}
        title={
          modal.kind === "confirm-issue"
            ? "Issue material"
            : modal.kind === "waste"
            ? "Record waste"
            : modal.kind === "accept-return"
            ? "Accept return"
            : modal.kind === "reverse-close"
            ? "Reverse close"
            : "Close stage"
        }
        sub={
          modal.kind === "confirm-issue"
            ? "This will commit issues and deduct quantities from storage."
            : modal.kind === "waste"
            ? `Record operator waste weight for warping log ${modal.id}.`
            : modal.kind === "reverse-close"
            ? "This reopens the stage and creates reversing ledger adjustments. Admin only."
            : "Write off variance and close warping ledger entries."
        }
        confirmLabel={
          modal.kind === "reverse-close" ? "Reverse close" : "Confirm"
        }
        isDanger={modal.kind === "reverse-close"}
        submitting={submitting}
        requiresReason={modal.kind === "waste" || modal.kind === "reverse-close"}
        reason={modal.reason}
        onChangeReason={(val) => setModal({ ...modal, reason: val })}
        attempted={submitting}
        onCancel={() => setModal({ isOpen: false, kind: null, id: null, reason: "" })}
        onConfirm={handleConfirmAction}
      />
    </>
  );
}
