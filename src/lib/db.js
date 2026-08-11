import { supabase } from "./supabase";

// Mock seed data matching the prototype exactly
const INITIAL_SEED = {
  users: [
    { id: 1, name: 'Asha Rao', role: 'admin', roleLabel: 'Admin' },
    { id: 2, name: 'Manoj Iyer', role: 'inv_sup', roleLabel: 'Inventory Supervisor' },
    { id: 3, name: 'Ravi Kumar', role: 'operator', roleLabel: 'Operator' },
    { id: 4, name: 'Divya Shah', role: 'viewer', roleLabel: 'Viewer' }
  ],
  legalEntities: [
    { id: 1, name: 'Maradi Zari Works Pvt Ltd', gstin: '29AAMCM1234F1Z8', state_code: '29', state_name: 'Karnataka' }
  ],
  suppliers: [
    { name: 'Suraj Zari Threads Pvt Ltd', state_code: '29', state_name: 'Karnataka', gstin: '29ABCDE1234F1Z5', address: 'Plot 14, Peenya Industrial Area, Bengaluru', payment_terms: 'Net 30' },
    { name: 'Kanchi Silk & Zari Co.', state_code: '33', state_name: 'Tamil Nadu', gstin: '33PQRSX5678K1Z2', address: '44 Mint Street, Chennai', payment_terms: 'Net 45' },
    { name: 'Ganga Handloom Supplies', state_code: '29', state_name: 'Karnataka', gstin: null, address: '12 Weavers Colony, Mysuru', payment_terms: 'Advance' }
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

export const db = {
  isSupabase: () => !!supabase,

  // --- GENERIC GETTERS / MUTATORS ---
  get: async (key) => {
    if (supabase) {
      const { data, error } = await supabase.from(key).select("*");
      if (error) throw error;
      return data;
    }
    return localDB[key] || [];
  },

  save: async (key, record, idKey = "id", customId = null) => {
    if (supabase) {
      // Supabase mutation logic
      let query;
      if (customId || record[idKey]) {
        const idVal = customId || record[idKey];
        query = supabase.from(key).upsert(record);
      } else {
        query = supabase.from(key).insert(record);
      }
      const { data, error } = await query.select();
      if (error) throw error;
      return data[0];
    }

    // Local Storage logic
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
      // Auto increment serial id if id is serial
      const numericIds = list.map((item) => Number(item[idKey]) || 0);
      const maxId = numericIds.length ? Math.max(...numericIds) : 0;
      record[idKey] = maxId + 1;
      list.push(record);
    }
    saveState(localDB);
    return record;
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
