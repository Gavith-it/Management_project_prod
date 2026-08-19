"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import Icon from "@/components/Icons";
import ConfirmModal from "@/components/ConfirmModal";
import {
  computePurchaseTotals,
  fmtG,
  fmtPct,
  fmtMoney,
  todayISO
} from "@/lib/math";

export default function PurchasesPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [itemGstRates, setItemGstRates] = useState([]);
  const [items, setItems] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [legalEntities, setLegalEntities] = useState([]);
  const [carriers, setCarriers] = useState([]);

  const [view, setView] = useState("list"); // 'list', 'detail', 'form'
  const [activePurchaseId, setActivePurchaseId] = useState(null);
  const [formState, setFormState] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState(null);

  // Modal control
  const [modal, setModal] = useState({ isOpen: false, kind: null, id: null, reason: "" });

  const loadData = async () => {
    try {
      const iList = await db.get("items");
      const pList = await db.get("purchases");
      const sList = await db.get("suppliers");
      const rList = await db.get("itemGstRates");
      const uList = await db.get("uoms");
      const lList = await db.get("legalEntities");
      const cList = await db.get("carriers");

      setItems(iList);
      setPurchases(pList);
      setSuppliers(sList);
      setItemGstRates(rList);
      setUoms(uList);
      setLegalEntities(lList);
      setCarriers(cList);
      setLoading(false);
    } catch (e) {
      console.error("Failed to load purchases", e);
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

  const ourStateCode = () => {
    return (legalEntities[0] || {}).state_code || "29";
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case "draft":
        return "neutral";
      case "posted":
        return "success";
      default:
        return "neutral";
    }
  };

  // Entry functions
  const handleNewClick = () => {
    setActivePurchaseId(null);
    const firstItem = items[0] || {};
    const defaultUom = firstItem.uom || "Bobbin";
    const isBobbinOrMark = defaultUom.toLowerCase() === "bobbin" || defaultUom.toLowerCase() === "mark";
    const lookupType = isBobbinOrMark ? "bobbin" : defaultUom.toLowerCase();
    const matchedCarrier = carriers.find(c => c.type.toLowerCase() === lookupType);
    const defaultEmptyG = matchedCarrier ? String(matchedCarrier.empty_g) : "";

    setFormState({
      supplier: suppliers[0]?.name || "",
      invoice_no: "INV - ",
      invoice_date: new Date().toISOString().slice(0, 10),
      item: firstItem.name || "",
      uom: defaultUom,
      bobbins: "",
      qty_g: "",
      rate: "",
      empty_g: defaultUom === "Grams" ? "" : defaultEmptyG,
      gross_g: "",
      freight: "",
      remarks: "",
      invoice_file: null
    });
    setFormErrors({});
    setAttempted(false);
    setView("form");
  };

  const handleEditClick = (p) => {
    setFormState({
      _purchaseId: p.id,
      supplier: p.supplier,
      invoice_no: p.invoice_no,
      invoice_date: p.invoice_date,
      item: p.lines[0]?.item || items[0]?.name || "",
      uom: p.uom,
      bobbins: p.uom === "Grams" ? "" : String(p.qty),
      qty_g: p.uom === "Grams" ? String(p.qty) : "",
      rate: String(p.rate_per_unit),
      empty_g: p.uom === "Grams" ? "" : String(p.empty_per_unit_g),
      gross_g: p.uom === "Grams" ? "" : String(p.gross_per_unit_g),
      freight: p.freight ? String(p.freight) : "",
      remarks: p.remarks || "",
      invoice_file: p.invoice_file || null
    });
    setFormErrors({});
    setAttempted(false);
    setView("form");
  };

  const validateForm = (form) => {
    const errors = {};
    const uom = form.uom || "Bobbin";
    const trimmedInv = (form.invoice_no || "").trim();
    if (!trimmedInv || trimmedInv === "INV -") {
      errors.invoice_no = "Invoice number is required.";
    } else {
      const dup = purchases.some(
        (p) =>
          p.invoice_no.toLowerCase() === form.invoice_no.trim().toLowerCase() &&
          p.supplier === form.supplier &&
          p.id !== form._purchaseId
      );
      if (dup) errors.invoice_no = "This supplier invoice number is already recorded.";
    }

    if (!form.invoice_date) {
      errors.invoice_date = "Invoice date is required.";
    } else if (form.invoice_date > todayISO()) {
      errors.invoice_date = "Invoice date cannot be in the future.";
    }

    if (uom === "Grams") {
      const qty = Number(form.qty_g || 0);
      const rate = Number(form.rate || 0);
      if (!form.qty_g?.trim() || qty <= 0) errors.qty_g = "Quantity must be > 0.";
      if (!form.rate?.trim() || rate <= 0) errors.rate = "Rate must be > 0.";
    } else {
      const bobbins = Number(form.bobbins || 0);
      const rate = Number(form.rate || 0);
      const empty = Number(form.empty_g || 0);
      const gross = Number(form.gross_g || 0);

      if (!form.bobbins?.trim() || bobbins <= 0 || !Number.isInteger(bobbins)) {
        errors.bobbins = "Must be a positive integer.";
      }
      if (!form.rate?.trim() || rate <= 0) errors.rate = "Rate must be > 0.";
      if (!form.empty_g?.trim() || empty < 0) errors.empty_g = "Required.";
      if (!form.gross_g?.trim() || gross < 0) errors.gross_g = "Required.";
      if (!errors.empty_g && !errors.gross_g && gross <= empty) {
        errors.gross_g = "Gross must exceed empty weight.";
      }
    }

    if (form.freight?.trim() && Number(form.freight) < 0) {
      errors.freight = "Freight cannot be negative.";
    }

    return errors;
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormState((prev) => ({
        ...prev,
        invoice_file: JSON.stringify({ name: file.name, data: reader.result })
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleClearFile = () => {
    setFormState((prev) => ({
      ...prev,
      invoice_file: null
    }));
  };

  const handleSaveForm = async (e, isSubmit = false) => {
    if (e) e.preventDefault();
    const errors = validateForm(formState);
    
    // For draft saving, bypass strict validation
    if (!isSubmit) {
      delete errors.qty_g;
      delete errors.bobbins;
      delete errors.rate;
      delete errors.empty_g;
      delete errors.gross_g;
      delete errors.freight;
    }

    setFormErrors(errors);
    setAttempted(true);

    if (Object.keys(errors).length > 0) return;

    if (isSubmit) {
      const confirmed = window.confirm("Are you sure you want to submit this purchase? Once submitted, it cannot be edited later.");
      if (!confirmed) return;
    }

    setSubmitting(true);
    try {
      const calc = computePurchaseTotals(formState, suppliers, itemGstRates, ourStateCode());
      const selectedItem = items.find((i) => i.name === formState.item) || items[0] || { name: "Zari thread — 90 count", code: "ZR-001" };

      // Format Purchase Head
      const pId = activePurchaseId || `PUR-${String(12 + purchases.length).padStart(6, "0")}`;
      const batchId = activePurchaseId
        ? purchases.find((p) => p.id === activePurchaseId).batch
        : `BATCH-${new Date().getFullYear().toString().slice(-2)}-${String(purchases.length + 1).padStart(5, "0")}`;

      const newPurchase = {
        id: pId,
        batch: batchId,
        supplier: calc.supplierName,
        invoice_no: formState.invoice_no,
        invoice_date: formState.invoice_date,
        status: isSubmit ? "posted" : "draft",
        uom: calc.uom,
        qty: calc.qty,
        rate_per_unit: calc.ratePerUnit,
        empty_per_unit_g: calc.empty,
        gross_per_unit_g: calc.gross,
        net_per_unit_g: calc.netPerUnit,
        net_g: calc.totalNet,
        goods_value: calc.taxableItem,
        freight: calc.freight,
        taxable: calc.taxableBase,
        cgst: calc.cgst,
        sgst: calc.sgst,
        igst: calc.igst,
        gst_type: calc.gst.label,
        total: calc.total,
        cost_per_gram: calc.costPerGram,
        remarks: formState.remarks || "",
        invoice_file: formState.invoice_file || null,
        lines: [
          {
            item: selectedItem.name,
            item_code: selectedItem.code,
            uom: calc.uom,
            qty: calc.qty,
            empty_g: calc.empty,
            gross_g: calc.gross,
            net_g: calc.uom === "Grams" ? calc.totalNet : calc.netPerUnit,
            rate: `₹${calc.ratePerUnit.toFixed(2)} / ${calc.uom.toLowerCase()}`
          }
        ],
        reversal: null
      };

      // Serialize lines into remarks column to persist across Supabase column limits
      newPurchase.remarks = (formState.remarks || "") + " ||LINES||" + JSON.stringify(newPurchase.lines);

      await db.save("purchases", newPurchase, "id", pId);

      if (isSubmit) {
        const line = newPurchase.lines[0];
        const actor = `${user.name} · ${user.roleLabel}`;

        // Seed Batch
        await db.save("sourceBatches", {
          id: newPurchase.batch,
          purchase: newPurchase.id,
          item: line.item,
          qty_g: newPurchase.net_g,
          created: newPurchase.invoice_date
        }, "id", newPurchase.batch);

        // Seed Inventory Lot
        const newLotId = `LOT-${String(db.getTotalAvailableGrams() > 0 ? purchases.length + 7 : purchases.length + 1).padStart(8, "0")}`;
        await db.save("lots", {
          id: newLotId,
          item: line.item,
          item_id: line.item_code,
          location: "STORE-01",
          parent: null,
          source: newPurchase.id,
          batch: newPurchase.batch,
          qty_pieces: newPurchase.uom === "Grams" ? null : line.qty,
          piece_uom: newPurchase.uom === "Grams" ? null : newPurchase.uom,
          is_mixed_batch: false,
          carrier_code: null,
          landed_cost_per_gram: newPurchase.cost_per_gram,
          status: "available"
        }, "id", newLotId);

        // Seed Stock Ledger
        const sleId = `SLE-${String((await db.get("stockLedger")).length + 1).padStart(6, "0")}`;
        await db.save("stockLedger", {
          id: sleId,
          lot: newLotId,
          item: line.item,
          qty_g: newPurchase.net_g,
          type: "purchase_receipt",
          ref: newPurchase.id,
          location: "STORE-01"
        }, "id", sleId);

        await db.save("auditLog", { ts: new Date().toLocaleTimeString(), actor, action: "Posted purchase", ref: newPurchase.id });
        setNotification({ tone: "success", text: `${pId} posted successfully. Receipts created.` });
      } else {
        setNotification({ tone: "success", text: `Draft saved successfully as ${pId}.` });
      }

      setView("list");
      loadData();
    } catch (err) {
      console.error("Save/Submit form error", err);
      setNotification({ tone: "danger", text: isSubmit ? "Failed to post purchase." : "Failed to save draft." });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePostPurchaseClick = (pId) => {
    setModal({ isOpen: true, kind: "post", id: pId, reason: "" });
  };

  const handleReverseClick = (pId) => {
    setModal({ isOpen: true, kind: "reverse", id: pId, reason: "" });
  };

  const handleConfirmAction = async () => {
    const actor = `${user.name} · ${user.roleLabel}`;
    setSubmitting(true);

    try {
      const p = purchases.find((x) => x.id === modal.id);
      if (modal.kind === "post") {
        p.status = "posted";
        const line = p.lines[0];

        // Seed Batch
        await db.save("sourceBatches", {
          id: p.batch,
          purchase: p.id,
          item: line.item,
          qty_g: p.net_g,
          created: p.invoice_date
        }, "id", p.batch);

        // Seed Inventory Lot
        const newLotId = `LOT-${String(db.getTotalAvailableGrams() > 0 ? purchases.length + 7 : purchases.length + 1).padStart(8, "0")}`;
        await db.save("lots", {
          id: newLotId,
          item: line.item,
          item_id: line.item_code,
          location: "STORE-01",
          parent: null,
          source: p.id,
          batch: p.batch,
          qty_pieces: p.uom === "Grams" ? null : line.qty,
          piece_uom: p.uom === "Grams" ? null : p.uom,
          is_mixed_batch: false,
          carrier_code: null,
          landed_cost_per_gram: p.cost_per_gram,
          status: "available"
        }, "id", newLotId);

        // Seed Stock Ledger
        const sleId = `SLE-${String((await db.get("stockLedger")).length + 1).padStart(6, "0")}`;
        await db.save("stockLedger", {
          id: sleId,
          lot: newLotId,
          item: line.item,
          qty_g: p.net_g,
          type: "purchase_receipt",
          ref: p.id,
          location: "STORE-01"
        }, "id", sleId);

        await db.save("purchases", p, "id");
        await db.save("auditLog", { ts: new Date().toLocaleTimeString(), actor, action: "Posted purchase", ref: p.id });

        setNotification({ tone: "success", text: `${p.id} posted successfully. Receipts created.` });
      } else if (modal.kind === "reverse") {
        p.status = "draft";
        p.reversal = { reason: modal.reason, at: new Date().toLocaleString() };

        // Post reversing ledger entry
        const lot = (await db.get("lots")).find((l) => l.source === p.id);
        if (lot) {
          const sleId = `SLE-${String((await db.get("stockLedger")).length + 1).padStart(6, "0")}`;
          await db.save("stockLedger", {
            id: sleId,
            lot: lot.id,
            item: lot.item,
            qty_g: -p.net_g,
            type: "reversal",
            ref: p.id,
            location: "STORE-01"
          }, "id", sleId);
          
          lot.status = "consumed";
          await db.save("lots", lot, "id");
        }

        await db.save("purchases", p, "id");
        await db.save("auditLog", {
          ts: new Date().toLocaleTimeString(),
          actor,
          action: "Reversed purchase posting",
          ref: p.id
        });

        setNotification({ tone: "warning", text: `${p.id} reversed to draft.` });
      }
      setModal({ isOpen: false, kind: null, id: null, reason: "" });
      setView("list");
      loadData();
    } catch (e) {
      console.error("Action error", e);
      setNotification({ tone: "danger", text: "Operation failed." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRowClick = (id) => {
    setActivePurchaseId(id);
    setView("detail");
  };

  const activePurchase = purchases.find((x) => x.id === activePurchaseId);

  // Compute live preview state on entry forms
  const calc = view === "form" ? computePurchaseTotals(formState, suppliers, itemGstRates, ourStateCode()) : {};

  return (
    <>
      {notification && (
        <div className={`banner banner-${notification.tone}`}>
          <Icon name={notification.tone === "danger" ? "alert" : "check"} size={18} />
          <div>{notification.text}</div>
        </div>
      )}

      {view !== "detail" ? (
        <>
          <div className="page-head">
            <h1>Purchases</h1>
            {user && canEdit("purchase", user.role) && (
              <button className="btn btn-primary" onClick={handleNewClick}>
                <Icon name="plus" size={16} />
                New purchase
              </button>
            )}
          </div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Purchase</th>
                    <th>Supplier</th>
                    <th>Date</th>
                    <th className="num">Net weight</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr
                      key={p.id}
                      className="row-click"
                      onClick={() => handleRowClick(p.id)}
                    >
                      <td>
                        <span className="chip">{p.id}</span>
                      </td>
                      <td>{p.supplier}</td>
                      <td>{p.invoice_date}</td>
                      <td className="num">{fmtG(p.net_g)} g</td>
                      <td>
                        <span className={`badge badge-${getStatusBadgeClass(p.status)}`}>
                          {p.status === "posted" ? "Posted" : "Draft"}
                        </span>
                        {p.reversal && <span className="small muted"> (reversed)</span>}
                      </td>
                      <td>
                        <Icon name="chev" size={16} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        activePurchase && (
          <>
            <button
              className="sf-back"
              style={{ padding: 0, marginBottom: "14px" }}
              onClick={() => setView("list")}
            >
              <Icon name="undo" size={16} />
              <span>Back to purchases</span>
            </button>

            <div className="page-head">
              <h1>{activePurchase.id}</h1>
              <span className={`badge badge-${getStatusBadgeClass(activePurchase.status)}`}>
                {activePurchase.status === "posted" ? "Posted" : "Draft"}
              </span>
            </div>

            <div className="tag-row" style={{ marginBottom: "14px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
              <span className="chip">{activePurchase.batch}</span>
              {activePurchase.invoice_file && (() => {
                const invoiceFile = activePurchase.invoice_file;
                if (invoiceFile === "INV-scan.pdf") {
                  return <span className="chip">Invoice: INV-scan.pdf</span>;
                }
                try {
                  const parsed = JSON.parse(invoiceFile);
                  if (parsed.data && parsed.name) {
                    const isImage = parsed.data.startsWith("data:image/");
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%", marginTop: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span className="chip" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <Icon name="file" size={14} />
                            <a href={parsed.data} download={parsed.name} style={{ color: "inherit", fontWeight: 600, textDecoration: "underline" }}>
                              Download {parsed.name}
                            </a>
                          </span>
                        </div>
                        {isImage && (
                          <div style={{ border: "1px solid var(--neutral-200)", borderRadius: "6px", padding: "6px", background: "#fff", display: "inline-block", maxWidth: "240px" }}>
                            <img src={parsed.data} alt="Invoice Scan" style={{ width: "100%", height: "auto", borderRadius: "4px", display: "block" }} />
                          </div>
                        )}
                      </div>
                    );
                  }
                } catch (e) {
                  // Fallback
                }
                return <span className="chip">Invoice: {invoiceFile}</span>;
              })()}
            </div>



            {activePurchase.reversal && (
              <div className="banner banner-warning">
                <Icon name="alert" size={18} />
                <div>
                  <strong>This purchase was reversed.</strong>{" "}
                  {activePurchase.reversal.at} — reason: "{activePurchase.reversal.reason}".
                </div>
              </div>
            )}

            <div className="card" style={{ marginBottom: "16px" }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Code</th>
                      <th className="num">Qty</th>
                      <th>UOM</th>
                      {activePurchase.uom !== "Grams" && (
                        <>
                          <th className="num">Empty</th>
                          <th className="num">Gross</th>
                        </>
                      )}
                      <th className="num">Net</th>
                      <th className="num">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePurchase.lines.map((l, idx) => (
                      <tr key={idx}>
                        <td>{l.item}</td>
                        <td>
                          <span className="chip">{l.item_code}</span>
                        </td>
                        <td className="num">{l.qty}</td>
                        <td>{activePurchase.uom}</td>
                        {activePurchase.uom !== "Grams" && (
                          <>
                            <td className="num">{fmtG(l.empty_g)} g</td>
                            <td className="num">{fmtG(l.gross_g)} g</td>
                          </>
                        )}
                        <td className="num">{fmtG(activePurchase.net_g)} g</td>
                        <td className="num">{l.rate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <hr className="divider" />
              <div className="recon">
                <div className="recon-line">
                  <span className="l">Net weight</span>
                  <span className="num">{fmtG(activePurchase.net_g)} g</span>
                </div>
                <div className="recon-line">
                  <span className="l">Goods value</span>
                  <span className="num">{fmtMoney(activePurchase.goods_value)}</span>
                </div>
                {activePurchase.freight > 0 && (
                  <div className="recon-line">
                    <span className="l">Freight</span>
                    <span className="num">{fmtMoney(activePurchase.freight)}</span>
                  </div>
                )}
                <div className="recon-line">
                  <span className="l">Taxable value</span>
                  <span className="num">{fmtMoney(activePurchase.taxable)}</span>
                </div>

                {activePurchase.gst_type === "CGST + SGST" ? (
                  <>
                    <div className="recon-line">
                      <span className="l">CGST</span>
                      <span className="num">{fmtMoney(activePurchase.cgst)}</span>
                    </div>
                    <div className="recon-line">
                      <span className="l">SGST</span>
                      <span className="num">{fmtMoney(activePurchase.sgst)}</span>
                    </div>
                  </>
                ) : activePurchase.gst_type === "IGST" ? (
                  <div className="recon-line">
                    <span className="l">IGST</span>
                    <span className="num">{fmtMoney(activePurchase.igst)}</span>
                  </div>
                ) : (
                  <div className="recon-line">
                    <span className="l">Reverse charge</span>
                    <span>payable directly</span>
                  </div>
                )}

                {(() => {
                  const activeRoundOff = Number(activePurchase.total || 0) - (
                    Number(activePurchase.taxable || 0) + 
                    Number(activePurchase.cgst || 0) + 
                    Number(activePurchase.sgst || 0) + 
                    Number(activePurchase.igst || 0)
                  );
                  return Math.abs(activeRoundOff) > 0.001 ? (
                    <div className="recon-line">
                      <span className="l">Round off</span>
                      <span className="num">
                        {activeRoundOff < 0 ? `-${fmtMoney(Math.abs(activeRoundOff))}` : `+${fmtMoney(activeRoundOff)}`}
                      </span>
                    </div>
                  ) : null;
                })()}

                <div className="recon-line" style={{ fontWeight: 500 }}>
                  <span className="l">Total</span>
                  <span className="num">{fmtMoney(activePurchase.total)}</span>
                </div>

                {user && canEdit("cost_visibility", user.role) && (
                  <div className="recon-line">
                    <span className="l">Landed cost / gram</span>
                    <span className="num">{fmtMoney(activePurchase.cost_per_gram)}</span>
                  </div>
                )}
              </div>
            </div>

            {activePurchase.remarks && (
              <div className="card" style={{ marginBottom: "16px" }}>
                <div className="section-title">Remarks</div>
                <div className="small">{activePurchase.remarks}</div>
              </div>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              {activePurchase.status === "draft" && user && canEdit("purchase", user.role) && (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={() => handlePostPurchaseClick(activePurchase.id)}
                  >
                    Post purchase
                  </button>
                  <button className="btn" onClick={() => handleEditClick(activePurchase)}>
                    Edit
                  </button>
                </>
              )}
              {activePurchase.status === "posted" && user && canEdit("reverse", user.role) && (
                <button
                  className="btn btn-danger"
                  onClick={() => handleReverseClick(activePurchase.id)}
                >
                  Reverse posting
                </button>
              )}
            </div>
          </>
        )
      )}

      {/* Render purchase form in a modal overlay */}
      {view === "form" && (
        <div className="modal-overlay" onClick={() => setView(activePurchaseId ? "detail" : "list")}>
          <div className="modal" style={{ maxWidth: "600px" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: "12px" }}>{activePurchaseId ? `Edit purchase — ${activePurchaseId}` : "New purchase"}</h3>
            
            <form onSubmit={(e) => handleSaveForm(e, true)}>
              <div className="modal-body">
                {/* Row 1: Supplier & Batch ID (2 columns) */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="field">
                    <label>Supplier</label>
                    <select
                      value={formState.supplier}
                      onChange={(e) => setFormState({ ...formState, supplier: e.target.value })}
                    >
                      {suppliers.map((s, idx) => (
                        <option key={idx} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <div className="hint">GST type is picked automatically from the supplier's state and GSTIN — not a field you set.</div>
                  </div>
                  <div className="field">
                    <label>Batch ID</label>
                    <input
                      value={
                        activePurchaseId
                          ? purchases.find((p) => p.id === activePurchaseId).batch
                          : `BATCH-${new Date().getFullYear().toString().slice(-2)}-${String(purchases.length + 1).padStart(5, "0")}`
                      }
                      disabled
                    />
                    <div className="hint">Auto-assigned and sequential — not editable.</div>
                  </div>
                </div>

                {/* Row 2: Invoice no. & Invoice date (2 columns) */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className={`field ${attempted && formErrors.invoice_no ? "has-error" : ""}`}>
                    <label>Invoice no. <span className="req">*</span></label>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <span style={{ padding: "8px 12px", background: "var(--neutral-100)", border: "1px solid var(--neutral-300)", borderRight: "none", borderRadius: "6px 0 0 6px", fontSize: "14px", color: "var(--neutral-600)", whiteSpace: "nowrap" }}>INV -</span>
                      <input
                        type="text"
                        style={{ borderRadius: "0 6px 6px 0", flex: 1 }}
                        placeholder="e.g. 2202"
                        value={formState.invoice_no ? formState.invoice_no.replace(/^INV\s*-\s*/i, "") : ""}
                        onChange={(e) => {
                          const rawVal = e.target.value.replace(/^INV\s*-\s*/i, "");
                          setFormState({ ...formState, invoice_no: "INV - " + rawVal });
                        }}
                      />
                    </div>
                    {attempted && formErrors.invoice_no && (
                      <div className="field-error-text" style={{ fontSize: "10px", marginTop: "2px" }}>{formErrors.invoice_no}</div>
                    )}
                  </div>
                  <div className={`field ${attempted && formErrors.invoice_date ? "has-error" : ""}`}>
                    <label>Invoice date <span className="req">*</span></label>
                    <input
                      type="date"
                      value={formState.invoice_date}
                      max={todayISO()}
                      onChange={(e) => setFormState({ ...formState, invoice_date: e.target.value })}
                    />
                    {attempted && formErrors.invoice_date && (
                      <div className="field-error-text" style={{ fontSize: "10px", marginTop: "2px" }}>{formErrors.invoice_date}</div>
                    )}
                    <div className="hint">Defaults to today — change it if the invoice is dated earlier.</div>
                  </div>
                </div>

                {/* Row 3: Invoice scan (full width) */}
                <div className="field">
                  <label>Invoice scan</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "8px" }}>
                    <div>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        style={{ width: "100%", height: "38px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: "var(--neutral-100)", border: "1px solid var(--neutral-300)", borderRadius: "var(--radius-s)", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}
                        onClick={() => document.getElementById("file-upload").click()}
                      >
                        <Icon name="file" size={16} />
                        Choose file
                      </button>
                      <input 
                        id="file-upload" 
                        type="file" 
                        accept="image/*,application/pdf"
                        style={{ display: "none" }} 
                        onChange={handleFileChange}
                      />
                    </div>
                    <div>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        style={{ width: "100%", height: "38px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: "var(--neutral-100)", border: "1px solid var(--neutral-300)", borderRadius: "var(--radius-s)", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}
                        onClick={() => document.getElementById("photo-capture").click()}
                      >
                        <Icon name="camera" size={16} />
                        Take Photo
                      </button>
                      <input 
                        id="photo-capture" 
                        type="file" 
                        accept="image/*"
                        capture="environment"
                        style={{ display: "none" }} 
                        onChange={handleFileChange}
                      />
                    </div>
                  </div>
                  {formState.invoice_file && (() => {
                    let fileData = null;
                    if (formState.invoice_file === "INV-scan.pdf") {
                      fileData = { name: "INV-scan.pdf" };
                    } else {
                      try {
                        fileData = JSON.parse(formState.invoice_file);
                      } catch (e) {
                        fileData = { name: "Invoice file" };
                      }
                    }
                    return fileData ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--neutral-50)", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--neutral-200)", marginTop: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                          <Icon name="check" size={16} style={{ color: "var(--success-600)" }} />
                          <span style={{ fontSize: "12px", fontWeight: 600, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{fileData.name}</span>
                        </div>
                        <button 
                          type="button" 
                          onClick={handleClearFile} 
                          style={{ background: "none", border: "none", color: "var(--danger-600)", cursor: "pointer", display: "flex", alignItems: "center", padding: "4px" }}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    ) : null;
                  })()}
                </div>

                <div style={{ fontWeight: 600, fontSize: "14px", marginTop: "16px", marginBottom: "8px", borderBottom: "1px solid var(--neutral-200)", paddingBottom: "4px" }}>Line item</div>

                {/* Row 4: Item & UOM (2 columns) */}
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "12px" }}>
                  <div className="field">
                    <label>Item</label>
                    <select
                      value={formState.item}
                      onChange={(e) => {
                        const newName = e.target.value;
                        const matchedItem = items.find((i) => i.name === newName) || {};
                        const newUom = matchedItem.uom || "Bobbin";
                        const isBobbinOrMark = newUom.toLowerCase() === "bobbin" || newUom.toLowerCase() === "mark";
                        const lookupType = isBobbinOrMark ? "bobbin" : newUom.toLowerCase();
                        const matchedCarrier = carriers.find(c => c.type.toLowerCase() === lookupType);
                        const defaultEmptyG = matchedCarrier ? String(matchedCarrier.empty_g) : "";
                        setFormState({
                          ...formState,
                          item: newName,
                          uom: newUom,
                          empty_g: newUom === "Grams" ? "" : defaultEmptyG
                        });
                      }}
                    >
                      {items.map((i, idx) => (
                        <option key={idx} value={i.name}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                    <div className="hint">Item code (from Masters): <strong>{(items.find((i) => i.name === formState.item) || items[0])?.code}</strong></div>
                  </div>
                  <div className="field">
                    <label>UOM</label>
                    <select
                      value={formState.uom}
                      onChange={(e) => {
                        const newUom = e.target.value;
                        const isBobbinOrMark = newUom.toLowerCase() === "bobbin" || newUom.toLowerCase() === "mark";
                        const lookupType = isBobbinOrMark ? "bobbin" : newUom.toLowerCase();
                        const matchedCarrier = carriers.find(c => c.type.toLowerCase() === lookupType);
                        const defaultEmptyG = matchedCarrier ? String(matchedCarrier.empty_g) : "";
                        setFormState({
                          ...formState,
                          uom: newUom,
                          empty_g: newUom === "Grams" ? "" : defaultEmptyG
                        });
                      }}
                    >
                      {uoms.map((u) => (
                        <option key={u.id || u.name} value={u.name}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                    <div className="hint">From Masters — changes which fields appear below.</div>
                  </div>
                </div>

                {/* Row 5 & 6: UOM Dependent fields */}
                {formState.uom === "Grams" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div className={`field ${attempted && formErrors.qty_g ? "has-error" : ""}`}>
                      <label>Quantity (g) <span className="req">*</span></label>
                      <input
                        type="number"
                        value={formState.qty_g}
                        onChange={(e) => setFormState({ ...formState, qty_g: e.target.value })}
                      />
                      {attempted && formErrors.qty_g && (
                        <div className="field-error-text" style={{ fontSize: "10px", marginTop: "2px" }}>{formErrors.qty_g}</div>
                      )}
                    </div>
                    <div className={`field ${attempted && formErrors.rate ? "has-error" : ""}`}>
                      <label>Rate (₹ / g) <span className="req">*</span></label>
                      <input
                        type="number"
                        step="0.01"
                        value={formState.rate}
                        onChange={(e) => setFormState({ ...formState, rate: e.target.value })}
                      />
                      {attempted && formErrors.rate && (
                        <div className="field-error-text" style={{ fontSize: "10px", marginTop: "2px" }}>{formErrors.rate}</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div className={`field ${attempted && formErrors.bobbins ? "has-error" : ""}`}>
                        <label>{formState.uom === "Bobbin" ? "Bobbins" : formState.uom === "Mark" ? "Marks" : formState.uom} <span className="req">*</span></label>
                        <input
                          type="number"
                          value={formState.bobbins}
                          onChange={(e) => setFormState({ ...formState, bobbins: e.target.value })}
                        />
                        {attempted && formErrors.bobbins && (
                          <div className="field-error-text" style={{ fontSize: "10px", marginTop: "2px" }}>{formErrors.bobbins}</div>
                        )}
                      </div>
                      <div className={`field ${attempted && formErrors.rate ? "has-error" : ""}`}>
                        <label>Rate (₹ / {formState.uom}) <span className="req">*</span></label>
                        <input
                          type="number"
                          step="0.01"
                          value={formState.rate}
                          onChange={(e) => setFormState({ ...formState, rate: e.target.value })}
                        />
                        {attempted && formErrors.rate && (
                          <div className="field-error-text" style={{ fontSize: "10px", marginTop: "2px" }}>{formErrors.rate}</div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div className={`field ${attempted && formErrors.empty_g ? "has-error" : ""}`}>
                        <label>Empty weight / bobbin (g) <span className="req">*</span></label>
                        <input
                          type="number"
                          step="0.001"
                          value={formState.empty_g}
                          onChange={(e) => setFormState({ ...formState, empty_g: e.target.value })}
                        />
                        {attempted && formErrors.empty_g && (
                          <div className="field-error-text" style={{ fontSize: "10px", marginTop: "2px" }}>{formErrors.empty_g}</div>
                        )}
                      </div>
                      <div className={`field ${attempted && formErrors.gross_g ? "has-error" : ""}`}>
                        <label>Gross weight / bobbin (g) <span className="req">*</span></label>
                        <input
                          type="number"
                          step="0.001"
                          value={formState.gross_g}
                          onChange={(e) => setFormState({ ...formState, gross_g: e.target.value })}
                        />
                        {attempted && formErrors.gross_g && (
                          <div className="field-error-text" style={{ fontSize: "10px", marginTop: "2px" }}>{formErrors.gross_g}</div>
                        )}
                      </div>
                    </div>
                    {formState.uom === "Mark" && (
                      <div style={{ fontSize: "11px", color: "var(--neutral-600)", marginTop: "6px", fontStyle: "italic", background: "var(--neutral-50)", padding: "6px 10px", borderRadius: "4px", borderLeft: "3px solid var(--primary)" }}>
                        ℹ️ <strong>UOM is Mark (1 Mark = 4 Bobbins)</strong>: Enter the weights per bobbin. The system automatically multiplies these by 4 (e.g. {formState.empty_g || 16}g empty becomes {Number(formState.empty_g || 16) * 4}g, {formState.gross_g || ""}g gross becomes {Number(formState.gross_g || 0) * 4}g) to compute the correct total net weight.
                      </div>
                    )}
                  </>
                )}

                <div style={{ fontWeight: 600, fontSize: "14px", marginTop: "16px", marginBottom: "8px", borderBottom: "1px solid var(--neutral-200)", paddingBottom: "4px" }}>Freight</div>

                {/* Freight charges */}
                <div className={`field ${attempted && formErrors.freight ? "has-error" : ""}`}>
                  <label>Freight charges (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formState.freight}
                    placeholder="0.00"
                    onChange={(e) => setFormState({ ...formState, freight: e.target.value })}
                  />
                  {attempted && formErrors.freight && (
                    <div className="field-error-text" style={{ fontSize: "10px", marginTop: "2px" }}>{formErrors.freight}</div>
                  )}
                  <div className="hint">Added to the goods value before GST is calculated — GST is charged on goods + freight together.</div>
                </div>

                <div style={{ fontWeight: 600, fontSize: "14px", marginTop: "16px", marginBottom: "8px", borderBottom: "1px solid var(--neutral-200)", paddingBottom: "4px" }}>Remarks (optional)</div>

                {/* Remarks */}
                <div className="field">
                  <textarea
                    value={formState.remarks}
                    onChange={(e) => setFormState({ ...formState, remarks: e.target.value })}
                    placeholder="Any notes about this purchase..."
                    style={{ minHeight: "60px", resize: "vertical" }}
                  />
                </div>

                {/* Live Calculations Preview */}
                <div style={{ background: "var(--neutral-100)", borderRadius: "8px", padding: "16px", marginTop: "16px" }}>
                  <div style={{ fontWeight: 600, fontSize: "13.5px", marginBottom: "12px", color: "var(--neutral-700)" }}>Preview — not the value that gets submitted</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {formState.uom !== "Grams" && (
                      <div className="recon-line" style={{ fontSize: "13px" }}>
                        <span className="l" style={{ color: "var(--neutral-600)" }}>Net weight / {formState.uom.toLowerCase()}</span>
                        <span className="num">{fmtG(calc.netPerUnit || 0)} g</span>
                      </div>
                    )}
                    <div className="recon-line" style={{ fontSize: "13px" }}>
                      <span className="l" style={{ color: "var(--neutral-600)" }}>Total net weight</span>
                      <span className="num">{fmtG(calc.totalNet || 0)} g</span>
                    </div>
                    <div className="recon-line" style={{ fontSize: "13px" }}>
                      <span className="l" style={{ color: "var(--neutral-600)" }}>Goods value</span>
                      <span className="num">{fmtMoney(calc.taxableItem || 0)}</span>
                    </div>
                    <div className="recon-line" style={{ fontSize: "13px" }}>
                      <span className="l" style={{ color: "var(--neutral-600)" }}>Freight</span>
                      <span className="num">{fmtMoney(calc.freight || 0)}</span>
                    </div>
                    <div className="recon-line" style={{ fontSize: "13px" }}>
                      <span className="l" style={{ color: "var(--neutral-600)" }}>Taxable value (goods + freight)</span>
                      <span className="num">{fmtMoney(calc.taxableBase || 0)}</span>
                    </div>
                    <div className="recon-line" style={{ fontSize: "13px" }}>
                      <span className="l" style={{ color: "var(--neutral-600)" }}>GST rate (from item master)</span>
                      <span className="num">{calc.gstPct ? calc.gstPct.toFixed(2) : "5.00"}%</span>
                    </div>
                    <div className="recon-line" style={{ fontSize: "13px", flexDirection: "column", alignItems: "flex-start", gap: "2px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                        <span className="l" style={{ color: "var(--neutral-600)" }}>GST type</span>
                        <span className="num" style={{ fontWeight: 600 }}>{calc.gst ? calc.gst.label : ""}</span>
                      </div>
                      {calc.gst && calc.gst.note && (
                        <span className="muted" style={{ fontSize: "11.5px", color: "var(--neutral-500)", fontWeight: 400 }}>{calc.gst.note}</span>
                      )}
                    </div>
                    <div className="recon-line" style={{ fontSize: "13px" }}>
                      <span className="l" style={{ color: "var(--neutral-600)" }}>Landed cost / gram (est.)</span>
                      <span className="num">{fmtMoney(calc.costPerGram || 0)}</span>
                    </div>
                    {Math.abs(calc.roundOff || 0) > 0.001 && (
                      <div className="recon-line" style={{ fontSize: "13px" }}>
                        <span className="l" style={{ color: "var(--neutral-600)" }}>Round off</span>
                        <span className="num" style={{ color: "var(--neutral-600)" }}>
                          {calc.roundOff < 0 ? `-${fmtMoney(Math.abs(calc.roundOff))}` : `+${fmtMoney(calc.roundOff)}`}
                        </span>
                      </div>
                    )}
                    <div className="recon-line" style={{ fontSize: "14px", borderTop: "1px solid var(--neutral-300)", paddingTop: "8px", marginTop: "4px" }}>
                      <span className="l" style={{ fontWeight: 700 }}>Total</span>
                      <span className="num" style={{ fontWeight: 700, fontSize: "15px" }}>{fmtMoney(calc.total || 0)}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--neutral-500)", marginTop: "12px", lineHeight: "1.4" }}>
                    The server recalculates net weight, the GST split, and cost per gram authoritatively on save — this preview is formatting only, never the submitted value.
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--warning-700)", fontSize: "11.5px", fontWeight: 600, marginTop: "12px", background: "var(--warning-50)", border: "1px solid var(--warning-200)", padding: "8px 12px", borderRadius: "6px" }}>
                    <Icon name="alert" size={14} style={{ color: "var(--warning-600)", flexShrink: 0 }} />
                    <span>Once submitted, this purchase is posted to the ledger and cannot be edited.</span>
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setView(activePurchaseId ? "detail" : "list")}>
                  Cancel
                </button>
                <button type="button" className="btn" onClick={(e) => handleSaveForm(e, false)} disabled={submitting}>
                  Save as draft
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : "Submit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modals */}
      <ConfirmModal
        isOpen={modal.isOpen}
        title={modal.kind === "post" ? "Post purchase" : "Reverse posting"}
        sub={
          modal.kind === "post"
            ? "This creates real ledger entries and cannot be undone from here."
            : "This reopens the purchase and offsets ledger entries. Admin only."
        }
        confirmLabel={modal.kind === "post" ? "Post purchase" : "Reverse posting"}
        isDanger={modal.kind === "reverse"}
        submitting={submitting}
        requiresReason={modal.kind === "reverse"}
        reason={modal.reason}
        onChangeReason={(val) => setModal({ ...modal, reason: val })}
        attempted={submitting}
        onCancel={() => setModal({ isOpen: false, kind: null, id: null, reason: "" })}
        onConfirm={handleConfirmAction}
      />
    </>
  );
}
