import { supabase } from "./supabase";

// Mock seed data matching the prototype exactly
const INITIAL_SEED = {
  users: [
    { id: 1, name: 'Sharun', role: 'admin', roleLabel: 'Admin' },
    { id: 2, name: 'Deepika', role: 'inv_sup', roleLabel: 'Inventory Supervisor' },
    { id: 3, name: 'Narend', role: 'operator', roleLabel: 'Operator' }
  ],
  legalEntities: [
    { id: 1, name: 'Maradi Zari Works Pvt Ltd', gstin: '29AAMCM1234F1Z8', state_code: '29', state_name: 'Karnataka', address: null }
  ],
  suppliers: [
    { name: 'Suraj Zari Threads Pvt Ltd', state_code: '29', state_name: 'Karnataka', gstin: '29ABCDE1234F1Z5', address: 'Plot 14, Peenya Industrial Area, Bengaluru', payment_terms: 'Net 30', pan_no: null, email: null, phone_no: null },
    { name: 'Kanchi Silk & Zari Co.', state_code: '33', state_name: 'Tamil Nadu', gstin: '33PQRSX5678K1Z2', address: '44 Mint Street, Chennai', payment_terms: 'Net 45', pan_no: null, email: null, phone_no: null },
    { name: 'Ganga Handloom Supplies', state_code: '29', state_name: 'Karnataka', gstin: null, address: '12 Weavers Colony, Mysuru', payment_terms: 'Advance', pan_no: null, email: null, phone_no: null }
  ],
  items: [
    { id: 1, name: 'Zari thread — 90 count', code: 'ZR-001', type: 'Raw zari', uom: 'Grams', hsn: '5605' },
    { id: 2, name: 'Warped beam — partial', code: 'ZB-001', type: 'Beam', uom: 'Grams', hsn: '5605' },
    { id: 3, name: 'Rewound bobbin', code: 'ZK-001', type: 'Rewound bobbin', uom: 'Grams', hsn: '5605' },
    { id: 4, name: 'Pirn — finished', code: 'ZP-001', type: 'Pirn', uom: 'Grams', hsn: '5605' },
    { id: 5, name: 'Zari waste', code: 'ZW-001', type: 'Waste', uom: 'Grams', hsn: '5605' }
  ],
  itemGstRates: [
    { id: 1, item: 'Zari thread — 90 count', rate_pct: 5.00, effective_from: '2025-04-01', effective_to: null },
    { id: 2, item: 'Warped beam — partial', rate_pct: 5.00, effective_from: '2025-04-01', effective_to: null },
    { id: 3, item: 'Rewound bobbin', rate_pct: 5.00, effective_from: '2025-04-01', effective_to: null },
    { id: 4, item: 'Pirn — finished', rate_pct: 5.00, effective_from: '2025-04-01', effective_to: null },
    { id: 5, item: 'Zari waste', rate_pct: 5.00, effective_from: '2025-04-01', effective_to: null }
  ],
  stageOutputMap: [
    { id: 1, stage: 'Warping', input_item: 'Zari thread — 90 count', output_item: 'Warped beam — partial', waste_item: 'Zari waste' },
    { id: 2, stage: 'Rewinding', input_item: 'Zari thread — 90 count', output_item: 'Rewound bobbin', waste_item: 'Zari waste' },
    { id: 3, stage: 'Pirn winding', input_item: 'Rewound bobbin', output_item: 'Pirn — finished', waste_item: 'Zari waste' }
  ],
  locations: [
    { id: 1, name: 'Warping floor', code: 'WARP-01' },
    { id: 2, name: 'Rewinding floor', code: 'REW-02' },
    { id: 3, name: 'Pirn winding floor', code: 'PIRN-03' },
    { id: 4, name: 'Main store', code: 'STORE-01' },
    { id: 5, name: 'Waste store', code: 'WASTE-01' }
  ],
  productionSpaces: [
    { id: 1, name: 'Frame 3', code: 'FRAME-3' },
    { id: 2, name: 'Loom 2', code: '2' },
    { id: 3, name: 'Loom 3', code: '3' },
    { id: 4, name: 'Loom 5', code: '5' },
    { id: 5, name: 'Loom 6', code: '6' }
  ],
  uoms: [
    { id: 1, name: 'Grams', code: 'g' },
    { id: 2, name: 'Bobbin', code: 'bobbin' },
    { id: 3, name: 'Mark', code: 'mark' },
    { id: 4, name: 'Beam', code: 'beam' },
    { id: 5, name: 'Pirn', code: 'pirn' }
  ],
  carriers: [
    { code: 'BEAM-07', type: 'Beam', empty_g: 12400.000 },
    { code: 'BEAM-11', type: 'Beam', empty_g: 9800.000 },
    { code: 'BEAM-04', type: 'Beam', empty_g: 10200.000 },
    { code: 'BEAM-17', type: 'Beam', empty_g: 11950.000 }
  ],
  purchases: [],
  lots: [],
  stockLedger: [],
  wasteEntries: [],
  productionIssues: [],
  jobCards: [],
  warpingLogs: [],
  returns: [],
  warpingClose: null,
  stageCompletions: [],
  jobCardCompletions: [],
  stocktake: { status: 'not_started', location: null, lines: [], finalizedAt: null, approvedAt: null, approvedBy: null },
  sourceBatches: [],
  tieout: null,
  auditLog: []
};

// Check if we are running in the browser
const isClient = typeof window !== "undefined";

function loadState() {
  if (!isClient) return INITIAL_SEED;
  const stored = localStorage.getItem("zari_tracker_v2_db");
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error("Failed to parse stored Zari Tracker state", e);
    }
  }
  localStorage.setItem("zari_tracker_v2_db", JSON.stringify(INITIAL_SEED));
  return INITIAL_SEED;
}

function saveState(state) {
  if (isClient) {
    localStorage.setItem("zari_tracker_v2_db", JSON.stringify(state));
  }
}

// In-memory cache when running in LocalStorage mode
let localDB = loadState();

const TABLE_MAP = {
  users: "profiles",
  legalEntities: "legal_entities",
  itemGstRates: "item_gst_rates",
  stageOutputMap: "stage_output_maps",
  stageOutputMaps: "stage_output_maps",
  productionSpaces: "production_spaces",
  stockLedger: "stock_ledger",
  wasteEntries: "waste_entries",
  productionIssues: "production_issues",
  jobCards: "job_cards",
  warpingLogs: "warping_logs",
  stageCompletions: "stage_completions",
  jobCardCompletions: "job_card_completions",
  sourceBatches: "source_batches",
  auditLog: "audit_log",
  stocktake: "stocktakes"
};

const TABLE_COLUMNS = {
  profiles: ["id", "name", "role", "role_label", "created_at"],
  legal_entities: ["id", "name", "gstin", "state_code", "state_name", "address"],
  suppliers: ["name", "state_code", "state_name", "gstin", "address", "payment_terms", "pan_no", "email", "phone_no"],
  items: ["id", "name", "code", "type", "uom", "hsn"],
  item_gst_rates: ["id", "item", "rate_pct", "effective_from", "effective_to"],
  stage_output_maps: ["id", "stage", "input_item", "output_item", "waste_item"],
  locations: ["id", "name", "code"],
  production_spaces: ["id", "name", "code"],
  carriers: ["code", "type", "empty_g"],
  purchases: [
    "id", "batch", "supplier", "invoice_no", "invoice_date", "status", "uom", "qty",
    "empty_per_unit_g", "gross_per_unit_g", "net_per_unit_g", "net_g", "rate_per_unit",
    "goods_value", "freight", "taxable", "cgst", "sgst", "igst", "gst_type", "total",
    "cost_per_gram", "remarks", "invoice_file", "reversal"
  ],
  lots: [
    "id", "item", "location", "parent", "source", "batch", "qty_pieces", "piece_uom",
    "is_mixed_batch", "carrier_code", "landed_cost_per_gram", "status", "is_partial"
  ],
  stock_ledger: ["id", "ts", "lot", "item", "qty_g", "type", "ref", "location"],
  waste_entries: ["id", "ts", "stage", "item", "qty_g", "ref", "location"],
  production_issues: ["id", "machine", "operator", "status", "date", "qty_g", "lot", "remarks"],
  production_issue_lines: ["id", "issue_id", "lot", "qty_g"],
  job_cards: [
    "id", "issue_id", "carrier", "type", "ends", "length_m", "width_in", "saree_design",
    "loom_no", "operator", "empty_g", "filled_g", "paper_g", "output_g", "waste_g",
    "consumed_g", "status"
  ],
  warping_logs: [
    "id", "job_card", "operator", "bobbins", "ns_a", "fp_a", "eb_a", "gross_a",
    "ns_b", "fp_b", "eb_b", "gross_b", "net_a", "net_b", "total_net_g", "waste_g", "created_at"
  ],
  returns: ["id", "status", "is_partial", "lot", "bobbins", "gross_g", "tare_g", "net_g"],
  return_lines: ["id", "return_id", "lot", "item", "bobbins", "gross_g", "tare_g", "net_g"],
  warping_close: ["id", "issued_g", "output_g", "waste_g", "returned_g", "variance_g", "variance_pct", "tolerance_pct", "status", "reason"],
  stage_completions: [
    "id", "stage", "issue_id", "from_lot", "to_lot", "machine", "issued_g", "output_g",
    "waste_g", "returned_g", "variance_g", "variance_pct", "tolerance_pct", "status",
    "is_mixed_batch", "sources", "pieces_note", "reason"
  ],
  stocktakes: ["id", "status", "location", "finalized_at", "approved_at", "approved_by"],
  stocktake_lines: ["id", "stocktake_id", "lot", "system_g", "counted_g", "variance_g"],
  audit_log: ["id", "ts", "actor", "action", "ref"]
};

const COLUMN_FIELD_MAP = {
  roleLabel: "role_label",
  finalizedAt: "finalized_at",
  approvedAt: "approved_at",
  approvedBy: "approved_by"
};

const isUUID = (str) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(str));

const toSnakeCaseRecord = (tableName, record) => {
  const allowedCols = TABLE_COLUMNS[tableName];
  if (!allowedCols) return record;
  const cleaned = {};
  for (const k in record) {
    const dbKey = COLUMN_FIELD_MAP[k] || k;
    if (allowedCols.includes(dbKey)) {
      cleaned[dbKey] = record[k];
    }
  }
  return cleaned;
};

const fromSnakeCaseRow = (row) => {
  if (!row) return row;
  const mapped = { ...row };
  if (row.role_label !== undefined) mapped.roleLabel = row.role_label;
  if (row.finalized_at !== undefined) mapped.finalizedAt = row.finalized_at;
  if (row.approved_at !== undefined) mapped.approvedAt = row.approved_at;
  if (row.approved_by !== undefined) mapped.approvedBy = row.approved_by;

  // Reconstruct lines array for purchases from serialized remarks or default columns
  if (row.invoice_no !== undefined) {
    if (row.remarks && row.remarks.includes(" ||LINES||")) {
      const parts = row.remarks.split(" ||LINES||");
      mapped.remarks = parts[0];
      try {
        mapped.lines = JSON.parse(parts[1]).map(l => {
          const matchedItem = localDB.items && localDB.items.find(i => i.name === l.item);
          const fallbackItem = (localDB.items && localDB.items[0]) || { name: "Zari thread — 90 count", code: "ZR-001" };
          return {
            ...l,
            item: matchedItem ? l.item : fallbackItem.name,
            item_code: matchedItem ? l.item_code : fallbackItem.code
          };
        });
      } catch (e) {
        mapped.lines = [];
      }
    }
    
    // If lines array is missing or empty, build a fallback using columns
    if (!mapped.lines || mapped.lines.length === 0) {
      const fallbackItem = (localDB.items && localDB.items[0]) || { name: "Zari thread — 90 count", code: "ZR-001" };
      mapped.lines = [
        {
          item: fallbackItem.name,
          item_code: fallbackItem.code,
          uom: row.uom || "Bobbin",
          qty: row.qty,
          empty_g: row.empty_per_unit_g,
          gross_g: row.gross_per_unit_g,
          net_g: row.net_g,
          rate: `₹${(row.rate_per_unit || 0).toFixed(2)} / ${(row.uom || "bobbin").toLowerCase()}`
        }
      ];
    }
  }

  return mapped;
};

export const db = {
  isSupabase: () => !!supabase,

  // --- GENERIC GETTERS / MUTATORS ---
  get: async (key) => {
    // 1. Stocktake special handling
    if (key === "stocktake") {
      if (supabase) {
        const { data: stData, error: stErr } = await supabase.from("stocktakes").select("*").order("id", { ascending: false });
        if (stErr) throw stErr;
        if (!stData || stData.length === 0) {
          return { status: "not_started", location: null, lines: [], finalizedAt: null, approvedAt: null, approvedBy: null };
        }
        const activeSt = stData[0];
        const { data: linesData, error: linesErr } = await supabase.from("stocktake_lines").select("*").eq("stocktake_id", activeSt.id);
        if (linesErr) throw linesErr;
        
        return {
          status: activeSt.status,
          location: activeSt.location,
          finalizedAt: activeSt.finalized_at,
          approvedAt: activeSt.approved_at,
          approvedBy: activeSt.approved_by,
          lines: (linesData || []).map(l => ({
            lot: l.lot,
            system_g: Number(l.system_g),
            counted_g: Number(l.counted_g),
            variance_g: Number(l.variance_g)
          }))
        };
      }
      return localDB.stocktake || { status: "not_started", location: null, lines: [], finalizedAt: null, approvedAt: null, approvedBy: null };
    }

    // 2. Generic supabase table mapping
    const tableName = TABLE_MAP[key] || key;
    if (supabase && TABLE_COLUMNS[tableName]) {
      const { data, error } = await supabase.from(tableName).select("*");
      if (error) throw error;
      const mappedList = (data || []).map(fromSnakeCaseRow);
      localDB[key] = mappedList;
      return mappedList;
    }

    return localDB[key] || [];
  },

  save: async (key, record, idKey = "id", customId = null) => {
    // 1. Stocktake special handling
    if (key === "stocktake") {
      const idVal = "STK-CURRENT";
      if (supabase) {
        const row = {
          id: idVal,
          status: record.status,
          location: record.location,
          finalized_at: record.finalizedAt,
          approved_at: record.approvedAt,
          approved_by: record.approvedBy
        };
        const { error: stErr } = await supabase.from("stocktakes").upsert(row);
        if (stErr) throw stErr;

        await supabase.from("stocktake_lines").delete().eq("stocktake_id", idVal);
        if (record.lines && record.lines.length > 0) {
          const linesToInsert = record.lines.map(l => ({
            stocktake_id: idVal,
            lot: l.lot,
            system_g: l.system_g,
            counted_g: l.counted_g,
            variance_g: l.variance_g
          }));
          const { error: linesErr } = await supabase.from("stocktake_lines").insert(linesToInsert);
          if (linesErr) throw linesErr;
        }
        return record;
      }
      localDB.stocktake = record;
      saveState(localDB);
      return record;
    }

    // 2. Generic supabase table mapping
    const tableName = TABLE_MAP[key] || key;
    if (supabase && TABLE_COLUMNS[tableName]) {
      // Profiles UUID protection
      const recordId = customId || record[idKey];
      if (tableName === "profiles" && recordId !== undefined && !isUUID(recordId)) {
        // Fall back to local DB for non-UUID users/profiles
        if (!localDB[key]) localDB[key] = [];
        const list = localDB[key];
        const idx = list.findIndex((item) => String(item[idKey]) === String(recordId));
        if (idx > -1) {
          list[idx] = { ...list[idx], ...record };
        } else {
          list.push(record);
        }
        saveState(localDB);
        return record;
      }

      const cleaned = toSnakeCaseRecord(tableName, record);
      let query;
      if (customId || record[idKey]) {
        query = supabase.from(tableName).upsert(cleaned);
      } else {
        query = supabase.from(tableName).insert(cleaned);
      }
      const { data, error } = await query.select();
      if (error) throw error;
      return fromSnakeCaseRow(data[0]);
    }

    // Local Storage fallback
    if (!localDB[key]) localDB[key] = [];
    const list = localDB[key];
    const matchId = customId || record[idKey];

    if (matchId !== undefined && matchId !== null) {
      const idx = list.findIndex((item) => String(item[idKey]) === String(matchId));
      if (idx > -1) {
        list[idx] = { ...list[idx], ...record };
      } else {
        list.push(record);
      }
    } else {
      const numericIds = list.map((item) => Number(item[idKey]) || 0);
      const maxId = numericIds.length ? Math.max(...numericIds) : 0;
      record[idKey] = maxId + 1;
      list.push(record);
    }
    saveState(localDB);
    return record;
  },

  delete: async (key, idValue, idKey = "id") => {
    const tableName = TABLE_MAP[key] || key;
    if (supabase && TABLE_COLUMNS[tableName]) {
      if (tableName === "profiles" && !isUUID(idValue)) {
        // Delete local profile
        if (localDB[key]) {
          localDB[key] = localDB[key].filter((item) => String(item[idKey]) !== String(idValue));
          saveState(localDB);
        }
        return;
      }
      const { data, error } = await supabase.from(tableName).delete().eq(idKey, idValue);
      if (error) throw error;
      return data;
    }

    if (localDB[key]) {
      localDB[key] = localDB[key].filter((item) => String(item[idKey]) !== String(idValue));
      saveState(localDB);
    }
  },

  // Reset database state (mostly for demo purposes)
  resetToSeed: async () => {
    if (supabase) {
      // We don't truncate Supabase directly in this simple client wrapper
      console.warn("Reset to seed is not supported automatically in Supabase mode.");
      return;
    }
    localDB = JSON.parse(JSON.stringify(INITIAL_SEED));
    saveState(localDB);
  },

  // Specific state getters to support calculated fields reactively
  getLotBalance: (lotId) => {
    const ledger = localDB.stockLedger || [];
    return ledger
      .filter((e) => e.lot === lotId)
      .reduce((sum, e) => sum + Number(e.qty_g || 0), 0);
  },

  getClosingStockValue: () => {
    const lots = localDB.lots || [];
    return lots.reduce((sum, lot) => {
      const bal = db.getLotBalance(lot.id);
      if (bal <= 0 || lot.landed_cost_per_gram == null) return sum;
      return sum + bal * Number(lot.landed_cost_per_gram);
    }, 0);
  },

  getTotalAvailableGrams: () => {
    const lots = localDB.lots || [];
    return lots.reduce((sum, lot) => sum + Math.max(0, db.getLotBalance(lot.id)), 0);
  },

  getWeightedAvgLandedCost: () => {
    const totalG = db.getTotalAvailableGrams();
    return totalG > 0 ? db.getClosingStockValue() / totalG : 0;
  }
};
