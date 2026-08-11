"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import MetricCard from "@/components/MetricCard";
import Icon from "@/components/Icons";
import { fmtMoney, fmtG, todayISO, computePurchaseTotals } from "@/lib/math";

export default function OfficeDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    openStagesCount: 0,
    attentionCount: 0,
    stockValue: 0,
    pendingStocktakes: 0,
    attentionItems: []
  });

  // Purchase Form states
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [itemGstRates, setItemGstRates] = useState({});
  const [legalEntities, setLegalEntities] = useState([]);
  
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [formState, setFormState] = useState({
    supplier: "",
    item: "",
    uom: "Bobbin",
    bobbins: "",
    qty_g: "",
    rate: "",
    empty_g: "16",
    gross_g: "",
    freight: "",
    remarks: "",
    invoice_no: "",
    invoice_date: ""
  });

  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return "Good morning";
    if (hr < 17) return "Good afternoon";
    return "Good evening";
  };

  const formatDateLine = () => {
    const options = { weekday: "long", day: "numeric", month: "long", year: "numeric" };
    const dateStr = new Date().toLocaleDateString("en-GB", options);
    return `${dateStr.replace(/,/g, "")} · Yeshwanthpur`;
  };

  const loadDashboardData = async () => {
    try {
      const pList = await db.get("purchases");
      const lots = await db.get("lots");
      const ledger = await db.get("stockLedger");
      const warpingClose = await db.get("warpingClose");
      const stageCompletions = await db.get("stageCompletions");
      const stocktake = await db.get("stocktake");
      
      const sList = await db.get("suppliers");
      const rList = await db.get("itemGstRates");
      const iList = await db.get("items");
      const lList = await db.get("legalEntities");

      setPurchases(pList);
      setSuppliers(sList);
      setItemGstRates(rList);
      setItems(iList);
      setLegalEntities(lList);

      const openWarping = warpingClose && warpingClose.status !== "closed" && warpingClose.status !== "flagged" ? 1 : 0;
      const openStageComps = (stageCompletions || []).filter(
        (sc) => sc.status !== "closed" && sc.status !== "flagged"
      ).length;
      const openStagesCount = openWarping + openStageComps;

      const attentionItems = [];
      (stageCompletions || []).forEach((sc) => {
        if (sc.status === "needs_approval") {
          attentionItems.push({
            id: sc.id,
            stage: `${sc.stage} close`,
            ref: sc.to_lot,
            variance: `${Number(sc.variance_g).toFixed(3)} g · ${Number(sc.variance_pct).toFixed(2)}%`,
            status: "needs_approval",
            link: "/office/rewind"
          });
        }
      });

      if (warpingClose && warpingClose.status === "needs_approval") {
        attentionItems.push({
          id: "warping-close",
          stage: "Warping close",
          ref: "ISS-000044",
          variance: `${Number(warpingClose.variance_g).toFixed(3)} g · ${Number(warpingClose.variance_pct).toFixed(2)}%`,
          status: "needs_approval",
          link: "/office/warping?tab=close"
        });
      }

      if (stocktake && stocktake.status === "finalized") {
        const lines = stocktake.lines || [];
        const nonZero = lines.filter((l) => Number(l.variance_g) !== 0).length;
        const sum = lines.reduce((s, l) => s + Number(l.variance_g), 0);
        attentionItems.push({
          id: "stocktake",
          stage: "Stock take",
          ref: stocktake.location,
          variance: `${sum > 0 ? "+" : ""}${sum.toFixed(3)} g (${nonZero} lines)`,
          status: "pending",
          link: "/office/stocktake"
        });
      }

      const stockValue = db.getClosingStockValue();
      const pendingStocktakes = stocktake && stocktake.status === "finalized" ? 1 : 0;

      setMetrics({
        openStagesCount,
        attentionCount: attentionItems.length,
        stockValue,
        pendingStocktakes,
        attentionItems
      });
      setLoading(false);
    } catch (err) {
      console.error("Dashboard load error", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    const activeUser = getSessionUser();
    setUser(activeUser);
    loadDashboardData();
  }, []);

  const ourStateCode = () => {
    return (legalEntities[0] || {}).state_code || "29";
  };

  const handleNewPurchaseClick = () => {
    setFormState({
      supplier: suppliers[0]?.name || "",
      invoice_no: "",
      invoice_date: todayISO(),
      item: items[0]?.name || "",
      uom: "Bobbin",
      bobbins: "",
      qty_g: "",
      rate: "",
      empty_g: "16",
      gross_g: "",
      freight: "",
      remarks: ""
    });
    setFormErrors({});
    setAttempted(false);
    setShowPurchaseForm(true);
  };

  const validateForm = (form) => {
    const errors = {};
    const uom = form.uom || "Bobbin";
    
    if (!form.invoice_no?.trim()) {
      errors.invoice_no = "Invoice number is required.";
    } else {
      const dup = purchases.some(
        (p) =>
          p.invoice_no.toLowerCase() === form.invoice_no.trim().toLowerCase() &&
          p.supplier === form.supplier
      );
      if (dup) errors.invoice_no = "This invoice is already recorded.";
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

  const handleSaveDraft = async (e) => {
    e.preventDefault();
    const errors = validateForm(formState);
    setFormErrors(errors);
    setAttempted(true);

    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const calc = computePurchaseTotals(formState, suppliers, itemGstRates, ourStateCode());
      const selectedItem = items.find((i) => i.name === formState.item) || items[0];

      const pId = `PUR-${String(12 + purchases.length).padStart(6, "0")}`;
      const batchId = `BATCH-2627-${String(purchases.length + 1).padStart(5, "0")}`;

      const newPurchase = {
        id: pId,
        batch: batchId,
        supplier: calc.supplierName,
        invoice_no: formState.invoice_no,
        invoice_date: formState.invoice_date,
        status: "draft",
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
        invoice_file: "INV-scan.pdf",
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

      await db.save("purchases", newPurchase, "id", pId);
      setShowPurchaseForm(false);
      loadDashboardData();
    } catch (err) {
      console.error("Save purchase error", err);
      alert("Failed to save purchase.");
    } finally {
      setSubmitting(false);
    }
  };

  const calc = (() => {
    try {
      return computePurchaseTotals(formState, suppliers, itemGstRates, ourStateCode());
    } catch {
      return { totalNet: 0, taxableItem: 0, total: 0 };
    }
  })();

  if (loading) {
    return <div className="small muted">Loading dashboard stats...</div>;
  }

  const showCost = user ? canEdit("cost_visibility", user.role) : false;

  return (
    <>
      {/* Welcome header matching reference screenshot */}
      <div className="page-head" style={{ marginBottom: "24px", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: "21px", fontWeight: "600", color: "#111827" }}>
            {getGreeting()}, {user?.name || "User"}
          </h1>
          <div className="small muted" style={{ marginTop: "4px", fontSize: "13px" }}>
            {formatDateLine()}
          </div>
        </div>
        {user && canEdit("purchase", user.role) && (
          <button
            className="btn btn-primary"
            style={{ background: "#0d2218", borderColor: "#0d2218" }}
            onClick={handleNewPurchaseClick}
          >
            <Icon name="plus" size={16} />
            New purchase
          </button>
        )}
      </div>

      <div className="metric-grid">
        <MetricCard
          label="Material issued, not yet closed"
          value={metrics.openStagesCount}
          onClick={() => router.push("/office/warping?tab=close")}
        />
        <MetricCard
          label="Variance flags"
          value={metrics.attentionCount}
          onClick={() => router.push("/office/rewind")}
        />
        {showCost && (
          <MetricCard
            label="Stock value"
            value={fmtMoney(metrics.stockValue)}
            onClick={() => router.push("/office/reports?tab=valuation")}
          />
        )}
        <MetricCard
          label="Stock takes pending approval"
          value={metrics.pendingStocktakes}
          onClick={() => router.push("/office/stocktake")}
        />
      </div>

      <div className="card">
        <div className="section-title">Needs attention</div>
        {metrics.attentionItems.length === 0 ? (
          <div className="empty-state">
            <Icon name="check" size={26} />
            <div className="title" style={{ marginTop: "8px" }}>
              Nothing needs attention right now
            </div>
            <div className="small">
              Every close is within tolerance and there's no stock take waiting
              on approval.
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Reference</th>
                  <th className="num">Variance</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {metrics.attentionItems.map((item) => (
                  <tr
                    key={item.id}
                    className="row-click"
                    onClick={() => router.push(item.link)}
                  >
                    <td>{item.stage}</td>
                    <td>
                      <span className="chip chip-link">{item.ref}</span>
                    </td>
                    <td className="num">{item.variance}</td>
                    <td>
                      <span
                        className={`badge badge-${
                          item.status === "needs_approval" ? "warning" : "neutral"
                        }`}
                      >
                        {item.status === "needs_approval"
                          ? "Needs approval"
                          : "Pending review"}
                      </span>
                    </td>
                    <td>
                      <Icon name="chev" size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Render purchase form in a modal overlay directly on Dashboard */}
      {showPurchaseForm && (
        <div className="modal-overlay" onClick={() => setShowPurchaseForm(false)}>
          <div className="modal" style={{ maxWidth: "780px" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: "12px" }}>New purchase</h3>
            
            <form onSubmit={handleSaveDraft}>
              {/* Row 1: Supplier, Batch ID, Invoice no., Invoice date */}
              <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr 1fr", gap: "10px", marginBottom: "8px" }}>
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
                </div>
                <div className="field">
                  <label>Batch ID</label>
                  <input
                    value={`BATCH-2627-${String(purchases.length + 1).padStart(5, "0")}`}
                    disabled
                  />
                </div>
                <div className={`field ${attempted && formErrors.invoice_no ? "has-error" : ""}`}>
                  <label>Invoice no. <span className="req">*</span></label>
                  <input
                    type="text"
                    value={formState.invoice_no}
                    onChange={(e) => setFormState({ ...formState, invoice_no: e.target.value })}
                    placeholder="e.g. INV-2202"
                  />
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
                </div>
              </div>

              {/* Row 2: Item, UOM, Freight charges */}
              <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1.2fr", gap: "10px", marginBottom: "8px" }}>
                <div className="field">
                  <label>Item</label>
                  <select
                    value={formState.item}
                    onChange={(e) => setFormState({ ...formState, item: e.target.value })}
                  >
                    {items.map((i, idx) => (
                      <option key={idx} value={i.name}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>UOM</label>
                  <select
                    value={formState.uom}
                    onChange={(e) => setFormState({ ...formState, uom: e.target.value })}
                  >
                    <option value="Bobbin">Bobbin</option>
                    <option value="Grams">Grams</option>
                  </select>
                </div>
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
                </div>
              </div>

              {/* Row 3: Bobbin inputs or Grams inputs */}
              {formState.uom === "Grams" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "8px" }}>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "10px", marginBottom: "8px" }}>
                  <div className={`field ${attempted && formErrors.bobbins ? "has-error" : ""}`}>
                    <label>Bobbins <span className="req">*</span></label>
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
                    <label>Rate (₹ / Bobbin) <span className="req">*</span></label>
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
                  <div className={`field ${attempted && formErrors.empty_g ? "has-error" : ""}`}>
                    <label>Empty wt / bobbin (g) <span className="req">*</span></label>
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
                    <label>Gross wt / bobbin (g) <span className="req">*</span></label>
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
              )}

              {/* Row 4: Remarks & Live Calculations */}
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "14px", marginTop: "4px" }}>
                <div className="field">
                  <label>Remarks</label>
                  <textarea
                    value={formState.remarks}
                    onChange={(e) => setFormState({ ...formState, remarks: e.target.value })}
                    placeholder="Notes..."
                    style={{ height: "64px", resize: "none" }}
                  />
                </div>

                <div className="banner banner-neutral" style={{ padding: "8px 12px", margin: 0, height: "82px", display: "flex", alignItems: "center" }}>
                  <div style={{ width: "100%" }}>
                    <div className="recon-line" style={{ margin: "2px 0", fontSize: "11.5px" }}>
                      <span className="l">Total net weight</span>
                      <span className="num" style={{ fontWeight: 600 }}>{fmtG(calc.totalNet)} g</span>
                    </div>
                    <div className="recon-line" style={{ margin: "2px 0", fontSize: "11.5px" }}>
                      <span className="l">Goods value</span>
                      <span className="num" style={{ fontWeight: 600 }}>{fmtMoney(calc.taxableItem)}</span>
                    </div>
                    <div className="recon-line" style={{ margin: "2px 0", fontSize: "11.5px", borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: "2px" }}>
                      <span className="l" style={{ fontWeight: 600 }}>Total estimate</span>
                      <span className="num" style={{ fontWeight: 700 }}>{fmtMoney(calc.total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: "12px" }}>
                <button type="button" className="btn" onClick={() => setShowPurchaseForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : "Save as draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
