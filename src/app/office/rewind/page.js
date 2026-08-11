"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import Icon from "@/components/Icons";
import ConfirmModal from "@/components/ConfirmModal";
import ReconciliationPanel from "@/components/ReconciliationPanel";
import { fmtG } from "@/lib/math";

export default function RewindPirnPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stageCompletions, setStageCompletions] = useState([]);
  const [lots, setLots] = useState([]);

  // Form State for variance reasons
  const [reasons, setReasons] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState(null);

  // Modals
  const [modal, setModal] = useState({ isOpen: false, kind: null, comp: null, reason: "" });

  const loadData = async () => {
    try {
      const list = await db.get("stageCompletions");
      const lList = await db.get("lots");
      setStageCompletions(list);
      setLots(lList);

      // Pre-populate reasons
      const initialReasons = {};
      list.forEach((sc) => {
        initialReasons[sc.id] = sc.reason || "";
      });
      setReasons(initialReasons);
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

      <div className="banner banner-neutral">
        <Icon name="alert" size={18} />
        <div>
          Completions are reported directly from the mobile shop-floor app.
          Supervisors run reconciliations and sign off closures here.
        </div>
      </div>

      {stageCompletions.map((comp) => {
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
      })}

      {/* --- CONFIRM MODAL --- */}
      <ConfirmModal
        isOpen={modal.isOpen}
        title={
          modal.kind === "reverse"
            ? `Reverse close — ${modal.comp?.issue_id}`
            : `Close stage — ${modal.comp?.issue_id}`
        }
        sub={
          modal.kind === "reverse"
            ? "Reopens this stage and logs reversing entries in the ledger. Admin only."
            : modal.kind === "close-override"
            ? "You are approving an out-of-tolerance close. This writes off the variance."
            : "This posts stage closure and writes off variance shrinkage."
        }
        confirmLabel={modal.kind === "reverse" ? "Reverse close" : "Confirm close"}
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
