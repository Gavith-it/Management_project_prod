import React from "react";

export default function ConfirmModal({
  isOpen,
  title,
  sub,
  body,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
  isDanger = false,
  submitting = false,
  requiresReason = false,
  reason = "",
  onChangeReason,
  attempted = false
}) {
  if (!isOpen) return null;

  const showMissingReason = attempted && requiresReason && !reason.trim();

  const handleConfirm = (e) => {
    e.preventDefault();
    onConfirm();
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {sub && <div className="sub">{sub}</div>}
        
        {body && <div style={{ marginBottom: "14px" }}>{body}</div>}
        
        {requiresReason && (
          <div className="field" style={{ marginTop: "14px" }}>
            <label>
              Reason <span className="req">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => onChangeReason && onChangeReason(e.target.value)}
              placeholder="Provide justification..."
              autoFocus
            />
            {showMissingReason && (
              <div className="field-error-text" style={{ marginTop: "6px" }}>
                A reason is required before this can be confirmed.
              </div>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button
            className={`btn ${isDanger ? "btn-danger" : "btn-primary"}`}
            onClick={handleConfirm}
            disabled={submitting || (requiresReason && !reason.trim() && attempted)}
          >
            {submitting ? "Submitting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
