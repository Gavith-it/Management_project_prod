"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import Icon from "@/components/Icons";
import {
  fmtG,
  fmtPct,
  fmtMoney,
  fmtSignedG
} from "@/lib/math";

export default function ReportsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "tieout";

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab);

  // DB States
  const [lots, setLots] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [wasteEntries, setWasteEntries] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [tieout, setTieout] = useState({});

  // Helper values
  const [stockValuation, setStockValuation] = useState({ value: 0, avgCost: 0, totalG: 0 });

  const loadData = async () => {
    try {
      const lList = await db.get("lots");
      const slList = await db.get("stockLedger");
      const wList = await db.get("wasteEntries");
      const aList = await db.get("auditLog");
      const to = await db.get("tieout");

      setLots(lList);
      setLedger(slList);
      setWasteEntries(wList);
      setAuditLog(aList);
      setTieout(to || {});

      // Calculate Valuation
      const val = db.getClosingStockValue();
      const totalG = db.getTotalAvailableGrams();
      const avgCost = db.getWeightedAvgLandedCost();
      setStockValuation({ value: val, avgCost, totalG });

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

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    router.push(`/office/reports?tab=${tabId}`);
  };

  // CSV Export utility
  const handleExportCSV = (kind) => {
    let rows = [];
    let filename = "";

    if (kind === "tieout") {
      filename = `batch-tieout-${tieout.batch || "BATCH"}.csv`;
      rows = [["Lot(s)", "Line", "Grams"]];
      (tieout.lines || []).forEach((l) => {
        rows.push([l.ref, l.label, String(l.g)]);
      });
      rows.push(["", "Total", String(tieout.total_g)]);
    } else if (kind === "valuation") {
      filename = "valuation.csv";
      rows = [
        ["Metric", "Value"],
        ["Closing stock value", fmtMoney(stockValuation.value)],
        ["Weighted avg. landed cost / gram", fmtMoney(stockValuation.avgCost)],
        ["Total available grams", fmtG(stockValuation.totalG)]
      ];
    }

    const csvContent = rows
      .map((r) =>
        r
          .map((cell) => {
            const s = String(cell === null || cell === undefined ? "" : cell);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(",")
      )
      .join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (loading) {
    return <div className="small muted">Loading Reports statistics...</div>;
  }

  const role = user?.role;
  const costGated = user ? canEdit("cost_visibility", role) : false;

  return (
    <>
      <div className="page-head">
        <h1>Reports</h1>
      </div>

      <div className="subnav">
        <button className={activeTab === "tieout" ? "active" : ""} onClick={() => handleTabChange("tieout")}>
          Batch tie-out
        </button>
        <button className={activeTab === "trace" ? "active" : ""} onClick={() => handleTabChange("trace")}>
          Lot trace
        </button>
        <button className={activeTab === "ledger" ? "active" : ""} onClick={() => handleTabChange("ledger")}>
          Stock ledger
        </button>
        <button className={activeTab === "waste" ? "active" : ""} onClick={() => handleTabChange("waste")}>
          Waste log
        </button>
        <button className={activeTab === "valuation" ? "active" : ""} onClick={() => handleTabChange("valuation")}>
          Valuation
        </button>
        <button className={activeTab === "audit" ? "active" : ""} onClick={() => handleTabChange("audit")}>
          Activity log
        </button>
      </div>

      {/* --- TAB 1: BATCH TIE OUT --- */}
      {activeTab === "tieout" && (
        <div className="card" style={{ marginBottom: "16px" }}>
          <div className="page-head" style={{ marginBottom: "10px" }}>
            <h2>Batch tie-out — {tieout.batch}</h2>
            <button className="btn" onClick={() => handleExportCSV("tieout")}>
              <Icon name="download" size={16} />
              Export CSV
            </button>
          </div>

          <div className="banner banner-success">
            <Icon name="check" size={18} />
            <div>
              <strong>Ties out.</strong> Every gram of the original {fmtG(tieout.purchase_g)} g purchase is accounted for.
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Lot(s)</th>
                  <th>Line</th>
                  <th className="num">Grams</th>
                </tr>
              </thead>
              <tbody>
                {(tieout.lines || []).map((l, idx) => (
                  <tr key={idx}>
                    <td>
                      {l.ref !== "—" ? <span className="chip">{l.ref}</span> : "—"}
                    </td>
                    <td>{l.label}</td>
                    <td className="num">{fmtG(l.g)} g</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <hr className="divider" />
          <div className="recon-line" style={{ fontWeight: 500 }}>
            <span className="l">Total (matches original purchase)</span>
            <span className="num">{fmtG(tieout.total_g)} g</span>
          </div>

          <div className="tag-row" style={{ marginTop: "14px" }}>
            <span className="chip" style={{ fontFamily: "var(--font-ui)", padding: "6px 12px" }}>
              Recovery: <strong>{fmtPct(tieout.recovery_pct)}</strong>
            </span>
            <span className="chip" style={{ fontFamily: "var(--font-ui)", padding: "6px 12px" }}>
              Waste: <strong>{fmtPct(tieout.waste_pct)}</strong>
            </span>
            <span className="chip" style={{ fontFamily: "var(--font-ui)", padding: "6px 12px" }}>
              Variance: <strong>{fmtPct(tieout.variance_pct)}</strong>
            </span>
          </div>

          <div className="banner banner-neutral" style={{ marginTop: "14px" }}>
            <Icon name="alert" size={18} />
            <div>{tieout.excludedNote}</div>
          </div>
        </div>
      )}

      {/* --- TAB 2: LOT TRACE --- */}
      {activeTab === "trace" && (
        <div className="card" style={{ marginBottom: "16px" }}>
          <div className="section-title">Lot trace</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {lots.map((l) => {
              const bal = db.getLotBalance(l.id);
              const pieceLabel =
                l.qty_pieces != null
                  ? `${l.qty_pieces} ${l.piece_uom.toLowerCase()}${l.qty_pieces === 1 ? "" : "s"}`
                  : "by weight";

              return (
                <div className="recon-line" key={l.id} style={{ alignItems: "center" }}>
                  <span className="l">
                    <span className="chip">{l.id}</span>
                    {l.parent ? ` ← ` : ""}
                    {l.parent && <span className="chip">{l.parent}</span>}
                    {!l.parent && <span className="small muted"> (source lot)</span>}
                  </span>
                  <span className="small muted" style={{ textAlign: "right" }}>
                    {l.item} {l.carrier_code ? `(${l.carrier_code})` : ""} · {fmtG(bal)} g · {pieceLabel} · {l.location} ·{" "}
                    <span className={`badge badge-neutral`}>{l.status}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- TAB 3: STOCK LEDGER --- */}
      {activeTab === "ledger" && (
        <div className="card">
          <div className="section-title">Stock ledger</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Lot</th>
                  <th>Item</th>
                  <th className="num">Qty</th>
                  <th>Type</th>
                  <th>Ref</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {ledger
                  .slice()
                  .reverse()
                  .map((e) => {
                    const isPositive = Number(e.qty_g) >= 0;
                    return (
                      <tr key={e.id}>
                        <td className="small muted">{e.ts}</td>
                        <td>
                          <span className="chip">{e.lot}</span>
                        </td>
                        <td>{e.item}</td>
                        <td className="num" style={{ color: isPositive ? "var(--success-600)" : "var(--danger-600)", fontWeight: 500 }}>
                          {fmtSignedG(e.qty_g)}
                        </td>
                        <td>{e.type}</td>
                        <td>
                          <span className="chip">{e.ref}</span>
                        </td>
                        <td className="small muted">{e.location}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- TAB 4: WASTE LOG --- */}
      {activeTab === "waste" && (
        <div className="card">
          <div className="page-head" style={{ marginBottom: "10px" }}>
            <h2>Waste log</h2>
            <span className="small muted">
              {fmtG(wasteEntries.reduce((s, w) => s + Number(w.qty_g), 0))} g total
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Stage</th>
                  <th>Item</th>
                  <th className="num">Qty</th>
                  <th>Ref</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {wasteEntries
                  .slice()
                  .reverse()
                  .map((w) => (
                    <tr key={w.id}>
                      <td className="small muted">{w.ts}</td>
                      <td>{w.stage}</td>
                      <td>{w.item}</td>
                      <td className="num">{fmtG(w.qty_g)} g</td>
                      <td>
                        <span className="chip">{w.ref}</span>
                      </td>
                      <td className="small muted">{w.location}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- TAB 5: VALUATION --- */}
      {activeTab === "valuation" && (
        <div className="card">
          <div className="page-head" style={{ marginBottom: "10px" }}>
            <h2>Valuation</h2>
            {costGated && (
              <button className="btn" onClick={() => handleExportCSV("valuation")}>
                <Icon name="download" size={16} />
                Export CSV
              </button>
            )}
          </div>

          {costGated ? (
            <>
              <div className="recon-line">
                <span className="l">Closing stock value</span>
                <span className="num" style={{ fontWeight: 600 }}>
                  {fmtMoney(stockValuation.value)}
                </span>
              </div>
              <div className="recon-line">
                <span className="l">Weighted avg. landed cost / gram</span>
                <span className="num" style={{ fontWeight: 600 }}>
                  {fmtMoney(stockValuation.avgCost)}
                </span>
              </div>
              <div className="recon-line">
                <span className="l">Total available stock weight</span>
                <span className="num">{fmtG(stockValuation.totalG)} g</span>
              </div>
            </>
          ) : (
            <div className="lock-row">
              <Icon name="gear" size={14} />
              Cost and supplier prices are not visible for your role.
            </div>
          )}
        </div>
      )}

      {/* --- TAB 6: ACTIVITY LOG --- */}
      {activeTab === "audit" && (
        <div className="card">
          <div className="section-title">Activity log</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {auditLog
                  .slice()
                  .reverse()
                  .map((a, idx) => (
                    <tr key={idx}>
                      <td className="small muted">{a.ts}</td>
                      <td>{a.actor}</td>
                      <td>{a.action}</td>
                      <td>
                        <span className="chip">{a.ref}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
