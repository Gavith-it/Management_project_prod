"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import Icon from "@/components/Icons";
import { fmtG } from "@/lib/math";
import ConfirmModal from "@/components/ConfirmModal";

const CATEGORIES = [
  { label: "Legal entities", entity: "legalEntities" },
  { label: "Suppliers", entity: "suppliers" },
  { label: "Items", entity: "items" },
  { label: "Item GST rates", entity: "itemGstRates" },
  { label: "UOMs", entity: "uoms" },
  { label: "Stage → output map", entity: "stageOutputMap" },
  { label: "Locations", entity: "locations" },
  { label: "Production spaces", entity: "productionSpaces" },
  { label: "Carriers (beams / pirn tubes)", entity: "carriers" },
  { label: "Users", entity: "users" }
];

export default function MastersPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({});
  const [view, setView] = useState("list"); // 'list' or 'form'
  const [activeEntity, setActiveEntity] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [formState, setFormState] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, entity: null, record: null });

  // Load all master tables
  const loadData = async () => {
    try {
      const dbState = {};
      for (const cat of CATEGORIES) {
        try {
          dbState[cat.entity] = await db.get(cat.entity);
        } catch (err) {
          console.error(`Failed to load master category ${cat.entity}:`, err);
          dbState[cat.entity] = []; // Fallback to empty array if query fails
        }
      }
      setData(dbState);
      setLoading(false);
    } catch (e) {
      console.error("Failed to load masters", e);
      setLoading(false);
    }
  };

  useEffect(() => {
    const activeUser = getSessionUser();
    setUser(activeUser);
    loadData();
  }, []);

  const handleScrollTo = (targetId) => {
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("scroll-highlight");
      setTimeout(() => {
        el.classList.remove("scroll-highlight");
      }, 1400);
    }
  };

  // Setup form fields & configurations
  const getEntityConfig = (key) => {
    const configs = {
      suppliers: {
        label: "Supplier",
        tableLabel: "Suppliers",
        addLabel: "Add supplier",
        idKey: "name",
        columns: [
          { key: "name", label: "Supplier", chip: true },
          { key: "state_name", label: "State" },
          { key: "gstin", label: "GSTIN", fmt: (v) => v || "Unregistered (reverse charge)" },
          { key: "pan_no", label: "PAN no." },
          { key: "email", label: "Email" },
          { key: "phone_no", label: "Phone no." },
          { key: "payment_terms", label: "Payment terms" }
        ],
        fields: [
          { key: "name", label: "Supplier name", type: "text", required: true },
          { key: "address", label: "Address", type: "text", required: true, placeholder: "e.g. Plot 14, Peenya Industrial Area, Bengaluru" },
          { key: "state_code", label: "State code", type: "text", required: true, placeholder: "e.g. 29" },
          { key: "state_name", label: "State name", type: "text", required: true, placeholder: "e.g. Karnataka" },
          { key: "gstin", label: "GSTIN (leave blank if unregistered)", type: "text", placeholder: "e.g. 29ABCDE1234F1Z5" },
          { key: "pan_no", label: "PAN no.", type: "text", placeholder: "e.g. ABCDE1234F" },
          { key: "email", label: "Email", type: "text", placeholder: "e.g. contact@supplier.com" },
          { key: "phone_no", label: "Phone number", type: "text", placeholder: "e.g. +91 98765 43210" },
          { key: "payment_terms", label: "Payment terms", type: "select", options: ["Advance", "Net 15", "Net 30", "Net 45", "Net 60"] }
        ],
        validate: (form, id) => {
          const errors = {};
          if (!form.name?.trim()) errors.name = "Supplier name is required.";
          else if (
            (data.suppliers || []).some(
              (s) => s.name.toLowerCase() === form.name.trim().toLowerCase() && s.name !== id
            )
          ) {
            errors.name = "A supplier with this name already exists.";
          }
          if (!form.address?.trim()) errors.address = "Address is required.";
          if (!form.state_code?.trim()) errors.state_code = "State code is required.";
          if (!form.state_name?.trim()) errors.state_name = "State name is required.";
          return errors;
        },
        toRecord: (form) => ({
          name: form.name.trim(),
          address: form.address.trim(),
          state_code: form.state_code.trim(),
          state_name: form.state_name.trim(),
          gstin: form.gstin?.trim() || null,
          pan_no: form.pan_no?.trim() || null,
          email: form.email?.trim() || null,
          phone_no: form.phone_no?.trim() || null,
          payment_terms: form.payment_terms || "Net 30"
        })
      },
      items: {
        label: "Item",
        tableLabel: "Items",
        addLabel: "Add item",
        idKey: "id",
        columns: [
          { key: "code", label: "Item code", chip: true },
          { key: "name", label: "Item" },
          { key: "type", label: "Type" },
          { key: "uom", label: "UOM" },
          { key: "hsn", label: "HSN" }
        ],
        fields: [
          { key: "code", label: "Item code", type: "text", required: true, placeholder: "e.g. ZB-001" },
          { key: "name", label: "Item name", type: "text", required: true },
          { key: "type", label: "Item type", type: "select", options: ["Raw zari", "Beam", "Rewound bobbin", "Pirn", "Waste"] },
          { key: "uom", label: "UOM", type: "select", options: (data.uoms || []).map((u) => u.name) },
          { key: "hsn", label: "HSN code", type: "text", required: true, placeholder: "e.g. 5605" }
        ],
        validate: (form, id) => {
          const errors = {};
          if (!form.code?.trim()) errors.code = "Item code is required.";
          else if ((data.items || []).some((i) => i.code === form.code.trim() && i.id !== id)) {
            errors.code = "An item with this code already exists.";
          }
          if (!form.name?.trim()) errors.name = "Item name is required.";
          else if ((data.items || []).some((i) => i.name === form.name.trim() && i.id !== id)) {
            errors.name = "An item with this name already exists.";
          }
          if (!form.hsn?.trim()) errors.hsn = "HSN code is required.";
          return errors;
        },
        toRecord: (form) => ({
          code: form.code.trim(),
          name: form.name.trim(),
          type: form.type || "Raw zari",
          uom: form.uom || "Grams",
          hsn: form.hsn.trim()
        })
      },
      itemGstRates: {
        label: "GST rate",
        tableLabel: "Item GST rates",
        addLabel: "Add GST rate",
        idKey: "id",
        columns: [
          { key: "item", label: "Item" },
          { key: "rate_pct", label: "Rate %", num: true, fmt: (v) => `${Number(v).toFixed(2)}%` },
          { key: "effective_from", label: "Effective from" },
          { key: "effective_to", label: "Effective to", fmt: (v) => v || "Current" }
        ],
        fields: [
          { key: "item", label: "Item", type: "select", options: (data.items || []).map((i) => i.name) },
          { key: "rate_pct", label: "Rate %", type: "number", step: "0.01", required: true },
          { key: "effective_from", label: "Effective from", type: "date", required: true }
        ],
        validate: (form) => {
          const errors = {};
          if (!form.item) errors.item = "Item is required.";
          if (!form.rate_pct?.trim() || Number(form.rate_pct) < 0) {
            errors.rate_pct = "Rate % is required and cannot be negative.";
          }
          if (!form.effective_from) errors.effective_from = "Effective date is required.";
          return errors;
        },
        toRecord: (form) => {
          const dayBefore = (iso) => {
            const d = new Date(iso + "T00:00:00");
            d.setDate(d.getDate() - 1);
            return d.toISOString().slice(0, 10);
          };
          // Close out previous active rate
          const list = data.itemGstRates || [];
          list.forEach((r) => {
            if (r.item === form.item && !r.effective_to) {
              r.effective_to = dayBefore(form.effective_from);
              db.save("itemGstRates", r, "id");
            }
          });

          return {
            item: form.item,
            rate_pct: Number(form.rate_pct || 0),
            effective_from: form.effective_from,
            effective_to: null
          };
        }
      },
      stageOutputMap: {
        label: "Stage output rule",
        tableLabel: "Stage → output item map",
        addLabel: "Add mapping",
        idKey: "id",
        columns: [
          { key: "stage", label: "Stage" },
          { key: "input_item", label: "Input item" },
          { key: "output_item", label: "Output item" },
          { key: "waste_item", label: "Waste item" }
        ],
        fields: [
          { key: "stage", label: "Stage", type: "select", options: ["Warping", "Rewinding", "Pirn winding"] },
          { key: "input_item", label: "Input item", type: "select", options: (data.items || []).map((i) => i.name) },
          { key: "output_item", label: "Output item", type: "select", options: (data.items || []).map((i) => i.name) },
          { key: "waste_item", label: "Waste item", type: "select", options: (data.items || []).map((i) => i.name) }
        ],
        validate: (form, id) => {
          const errors = {};
          if (!form.stage) errors.stage = "Stage is required.";
          if (!form.input_item) errors.input_item = "Input item is required.";
          if (!form.output_item) errors.output_item = "Output item is required.";
          else if (
            (data.stageOutputMap || []).some(
              (r) => r.stage === form.stage && r.input_item === form.input_item && r.id !== id
            )
          ) {
            errors.input_item = "A mapping for this stage + input item already exists.";
          }
          return errors;
        },
        toRecord: (form) => ({
          stage: form.stage,
          input_item: form.input_item,
          output_item: form.output_item,
          waste_item: form.waste_item || null
        })
      },
      legalEntities: {
        label: "Legal entity",
        tableLabel: "Legal entities",
        addLabel: "Add legal entity",
        idKey: "id",
        columns: [
          { key: "name", label: "Legal entity", chip: true },
          { key: "gstin", label: "GSTIN" },
          { key: "state_name", label: "State" },
          { key: "state_code", label: "gst_state_code" },
          { key: "address", label: "Address", fmt: (v) => v || "Not specified" }
        ],
        fields: [
          { key: "name", label: "Legal entity name", type: "text", required: true },
          { key: "gstin", label: "GSTIN", type: "text", required: true, placeholder: "e.g. 29AAMCM1234F1Z8" },
          { key: "state_code", label: "GST state code", type: "text", required: true, placeholder: "e.g. 29" },
          { key: "state_name", label: "State name", type: "text", required: true, placeholder: "e.g. Karnataka" },
          { key: "address", label: "Company address", type: "text", required: false, placeholder: "e.g. Plot 14, Peenya Industrial Area, Bengaluru" }
        ],
        validate: (form) => {
          const errors = {};
          if (!form.name?.trim()) errors.name = "Legal entity name is required.";
          if (!form.gstin?.trim()) errors.gstin = "GSTIN is required.";
          if (!form.state_code?.trim()) errors.state_code = "GST state code is required.";
          if (!form.state_name?.trim()) errors.state_name = "State name is required.";
          return errors;
        },
        toRecord: (form) => ({
          name: form.name.trim(),
          gstin: form.gstin.trim(),
          state_code: form.state_code.trim(),
          state_name: form.state_name.trim(),
          address: form.address?.trim() || null
        })
      },
      locations: {
        label: "Location",
        tableLabel: "Locations",
        addLabel: "Add location",
        idKey: "id",
        columns: [
          { key: "name", label: "Name" },
          { key: "code", label: "Code", chip: true }
        ],
        fields: [
          { key: "name", label: "Location name", type: "text", required: true },
          { key: "code", label: "Code", type: "text", required: true }
        ],
        validate: (form, id) => {
          const errors = {};
          if (!form.name?.trim()) errors.name = "Location name is required.";
          if (!form.code?.trim()) errors.code = "Code is required.";
          else if ((data.locations || []).some((r) => r.code === form.code.trim() && r.id !== id)) {
            errors.code = "This code is already used.";
          }
          return errors;
        },
        toRecord: (form) => ({
          name: form.name.trim(),
          code: form.code.trim()
        })
      },
      productionSpaces: {
        label: "Production space",
        tableLabel: "Production spaces",
        addLabel: "Add production space",
        idKey: "id",
        columns: [
          { key: "name", label: "Name" },
          { key: "code", label: "Code", chip: true }
        ],
        fields: [
          { key: "name", label: "Production space name", type: "text", required: true },
          { key: "code", label: "Code", type: "text", required: true }
        ],
        validate: (form, id) => {
          const errors = {};
          if (!form.name?.trim()) errors.name = "Production space name is required.";
          if (!form.code?.trim()) errors.code = "Code is required.";
          else if ((data.productionSpaces || []).some((r) => r.code === form.code.trim() && r.id !== id)) {
            errors.code = "This code is already used.";
          }
          return errors;
        },
        toRecord: (form) => ({
          name: form.name.trim(),
          code: form.code.trim()
        })
      },
      carriers: {
        label: "Carrier",
        tableLabel: "Carriers",
        addLabel: "Add carrier",
        idKey: "code",
        columns: [
          { key: "code", label: "Carrier", chip: true },
          { key: "type", label: "Type" },
          { key: "empty_g", label: "Certified empty weight", num: true, fmt: (v) => `${fmtG(v)} g` }
        ],
        fields: [
          { key: "code", label: "Carrier code", type: "text", required: true, placeholder: "e.g. BEAM-21" },
          { key: "type", label: "Type", type: "select", options: ["Beam", "Pirn tube", "Pagadi"] },
          { key: "empty_g", label: "Certified empty weight (g)", type: "number", step: "0.001", required: true }
        ],
        validate: (form, id) => {
          const errors = {};
          if (!form.code?.trim()) errors.code = "Carrier code is required.";
          else if ((data.carriers || []).some((c) => c.code === form.code.trim() && c.code !== id)) {
            errors.code = "A carrier with this code already exists.";
          }
          const w = Number(form.empty_g);
          if (!form.empty_g?.trim() || w <= 0) {
            errors.empty_g = "Certified empty weight must be greater than 0.";
          }
          return errors;
        },
        toRecord: (form) => ({
          code: form.code.trim(),
          type: form.type || "Beam",
          empty_g: Number(form.empty_g || 0)
        })
      },
      uoms: {
        label: "UOM",
        tableLabel: "UOMs",
        addLabel: "Add UOM",
        idKey: "id",
        columns: [
          { key: "name", label: "Name" },
          { key: "code", label: "Code", chip: true }
        ],
        fields: [
          { key: "name", label: "UOM name", type: "text", required: true },
          { key: "code", label: "Code", type: "text", required: true }
        ],
        validate: (form, id) => {
          const errors = {};
          if (!form.name?.trim()) errors.name = "UOM name is required.";
          if (!form.code?.trim()) errors.code = "Code is required.";
          else if ((data.uoms || []).some((r) => r.code === form.code.trim() && r.id !== id)) {
            errors.code = "This code is already used.";
          }
          return errors;
        },
        toRecord: (form) => ({
          name: form.name.trim(),
          code: form.code.trim()
        })
      },
      users: {
        label: "User",
        tableLabel: "Users",
        addLabel: "Invite user",
        idKey: "id",
        adminOnly: true,
        columns: [
          { key: "name", label: "Name" },
          { key: "roleLabel", label: "Role" }
        ],
        fields: [
          { key: "name", label: "Name", type: "text", required: true },
          {
            key: "role",
            label: "Role",
            type: "select",
            options: [
              { value: "admin", label: "Admin" },
              { value: "inv_sup", label: "Inventory Supervisor" },
              { value: "operator", label: "Operator" }
            ]
          }
        ],
        validate: (form) => {
          const errors = {};
          if (!form.name?.trim()) errors.name = "Name is required.";
          if (!form.role) errors.role = "Role is required.";
          return errors;
        },
        toRecord: (form) => {
          const roleMap = { admin: "Admin", inv_sup: "Inventory Supervisor", operator: "Operator" };
          return {
            name: form.name.trim(),
            role: form.role,
            roleLabel: roleMap[form.role] || "Operator"
          };
        }
      }
    };

    return configs[key];
  };

  const handleAddClick = (entityKey) => {
    const config = getEntityConfig(entityKey);
    const initialForm = {};
    config.fields.forEach((f) => {
      if (f.type === "select") {
        const firstOpt = typeof f.options === "function" ? f.options()[0] : f.options[0];
        initialForm[f.key] = typeof firstOpt === "object" ? firstOpt.value : firstOpt;
      } else {
        initialForm[f.key] = "";
      }
    });

    setFormState(initialForm);
    setEditingId(null);
    setActiveEntity(entityKey);
    setView("form");
    setFormErrors({});
    setAttempted(false);
  };

  const handleEditClick = (entityKey, record) => {
    const config = getEntityConfig(entityKey);
    const editForm = {};
    config.fields.forEach((f) => {
      editForm[f.key] = record[f.key] !== undefined && record[f.key] !== null ? String(record[f.key]) : "";
    });

    setFormState(editForm);
    setEditingId(record[config.idKey]);
    setActiveEntity(entityKey);
    setView("form");
    setFormErrors({});
    setAttempted(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const config = getEntityConfig(activeEntity);
    const errors = config.validate(formState, editingId);
    setFormErrors(errors);
    setAttempted(true);

    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const record = config.toRecord(formState);
      if (editingId !== null && editingId !== undefined) {
        record[config.idKey] = editingId;
      }
      await db.save(activeEntity, record, config.idKey, editingId);

      // Create Audit Log Entry
      const actor = `${user.name} · ${user.roleLabel}`;
      const action = editingId ? `Updated ${config.label.toLowerCase()}` : `Added ${config.label.toLowerCase()}`;
      const ref = String(editingId || record[config.idKey]);
      await db.save("auditLog", { ts: new Date().toLocaleTimeString(), actor, action, ref });

      setNotification({ tone: "success", text: `${config.label} saved successfully.` });
      setView("list");
      loadData();
    } catch (err) {
      console.error("Save error", err);
      setNotification({ tone: "danger", text: "Failed to save record." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClick = (entityKey, record) => {
    setDeleteConfirm({ isOpen: true, entity: entityKey, record });
  };

  const handleConfirmDelete = async () => {
    const { entity, record } = deleteConfirm;
    const config = getEntityConfig(entity);
    const idVal = record[config.idKey];

    setSubmitting(true);
    try {
      await db.delete(entity, idVal, config.idKey);

      // Create Audit Log Entry
      const actor = `${user.name} · ${user.roleLabel}`;
      const action = `Deleted ${config.label.toLowerCase()}`;
      const ref = String(idVal);
      await db.save("auditLog", { ts: new Date().toLocaleTimeString(), actor, action, ref });

      setNotification({ tone: "success", text: `${config.label} deleted successfully.` });
      setDeleteConfirm({ isOpen: false, entity: null, record: null });
      loadData();
    } catch (err) {
      console.error("Delete error", err);
      setNotification({ tone: "danger", text: "Failed to delete record. It may be referenced in active transactions." });
      setDeleteConfirm({ isOpen: false, entity: null, record: null });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="small muted">Loading Masters settings...</div>;
  }

  const role = user?.role;
  const isMasterEditable = user ? canEdit("masters", role) : false;

  return (
    <>
      {notification && (
        <div className={`banner banner-${notification.tone}`}>
          <Icon name={notification.tone === "danger" ? "alert" : "check"} size={18} />
          <div>{notification.text}</div>
        </div>
      )}

      <div className="page-head">
        <h1>Masters</h1>
      </div>

      <div className="card" style={{ marginBottom: "16px" }}>
        <div className="section-title">Categories</div>
        <div className="tag-row">
          {CATEGORIES.map((c) => (
            <span
              key={c.entity}
              className="chip chip-link"
              onClick={() => handleScrollTo(`masters-${c.entity}`)}
            >
              {c.label}
            </span>
          ))}
        </div>
      </div>

      {CATEGORIES.map((cat) => {
        const config = getEntityConfig(cat.entity);
        const isUserAdminOnly = config.adminOnly && role !== "admin";
        const canModifyThisTable = isUserAdminOnly ? false : isMasterEditable;
        const rows = data[cat.entity] || [];

        return (
          <div
            key={cat.entity}
            className="card"
            id={`masters-${cat.entity}`}
            style={{ marginBottom: "16px" }}
          >
            <div className="page-head" style={{ marginBottom: "12px" }}>
              <h2 style={{ fontSize: "15px" }}>{config.tableLabel}</h2>
              {canModifyThisTable ? (
                <button className="btn" onClick={() => handleAddClick(cat.entity)}>
                  <Icon name="plus" size={16} />
                  {config.addLabel}
                </button>
              ) : (
                role === "viewer" && <span className="lock-row"><Icon name="gear" size={14} />View only</span>
              )}
            </div>

            {rows.length === 0 ? (
              <div className="empty-state">
                <Icon name="box" size={26} />
                <div className="title" style={{ marginTop: "8px" }}>
                  No {config.tableLabel.toLowerCase()} yet
                </div>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {config.columns.map((col) => (
                        <th key={col.key} className={col.num ? "num" : ""}>
                          {col.label}
                        </th>
                      ))}
                      {canModifyThisTable && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={idx}>
                        {config.columns.map((col) => {
                          const rawVal = row[col.key];
                          const val = col.fmt ? col.fmt(rawVal) : rawVal;
                          return (
                            <td key={col.key} className={col.num ? "num" : ""}>
                              {col.chip ? <span className="chip">{val}</span> : val}
                            </td>
                          );
                        })}
                        {canModifyThisTable && (
                          <td style={{ display: "flex", gap: "6px" }}>
                            <button
                              className="btn"
                              style={{ padding: "5px 10px" }}
                              onClick={() => handleEditClick(cat.entity, row)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-danger"
                              style={{ padding: "5px 10px" }}
                              onClick={() => handleDeleteClick(cat.entity, row)}
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {cat.entity === "users" && role !== "admin" && (
              <div className="lock-row" style={{ marginTop: "10px" }}>
                <Icon name="gear" size={14} />
                Only Admin manages users and roles.
              </div>
            )}
          </div>
        );
      })}

      {/* Render the Add/Edit form in a premium modal overlay directly on this page */}
      {view === "form" && activeEntity && (
        <div className="modal-overlay" onClick={() => setView("list")}>
          <div className="modal" style={{ maxWidth: "520px" }} onClick={(e) => e.stopPropagation()}>
            <h3>
              {editingId !== null
                ? `Edit ${getEntityConfig(activeEntity).label.toLowerCase()}`
                : getEntityConfig(activeEntity).addLabel}
            </h3>
            
            <form onSubmit={handleSave}>
              <div className="modal-body" style={{ marginTop: "14px" }}>
                {getEntityConfig(activeEntity).fields.map((f) => {
                  const val = formState[f.key] !== undefined ? formState[f.key] : "";
                  const isError = attempted && formErrors[f.key];

                  let inputNode;
                  if (f.type === "select") {
                    const opts = typeof f.options === "function" ? f.options() : f.options;
                    inputNode = (
                      <select
                        value={val}
                        onChange={(e) => setFormState({ ...formState, [f.key]: e.target.value })}
                      >
                        {opts.map((o, oIdx) => {
                          const ov = typeof o === "object" ? o.value : o;
                          const ol = typeof o === "object" ? o.label : o;
                          return (
                            <option key={oIdx} value={ov}>
                              {ol}
                            </option>
                          );
                        })}
                      </select>
                    );
                  } else {
                    inputNode = (
                      <input
                        type={f.type || "text"}
                        step={f.step}
                        placeholder={f.placeholder}
                        value={val}
                        onChange={(e) => setFormState({ ...formState, [f.key]: e.target.value })}
                      />
                    );
                  }

                  return (
                    <div key={f.key} className={`field ${isError ? "has-error" : ""}`}>
                      <label>
                        {f.label}
                        {f.required && <span className="req"> *</span>}
                      </label>
                      {inputNode}
                      {isError && <div className="field-error-text">{formErrors[f.key]}</div>}
                    </div>
                  );
                })}

                {attempted && Object.keys(formErrors).length > 0 && (
                  <div className="banner banner-danger" style={{ marginTop: "14px" }}>
                    <Icon name="alert" size={18} />
                    <div>Fix the highlighted fields before saving.</div>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setView("list")} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title={`Delete ${deleteConfirm.entity ? getEntityConfig(deleteConfirm.entity).label.toLowerCase() : ""}`}
        body={`Are you sure you want to delete this ${deleteConfirm.entity ? getEntityConfig(deleteConfirm.entity).label.toLowerCase() : ""}? This action cannot be undone.`}
        confirmLabel="Delete"
        isDanger={true}
        submitting={submitting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, entity: null, record: null })}
      />
    </>
  );
}
