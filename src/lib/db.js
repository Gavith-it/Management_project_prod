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
  purchases: [
    {
      id: 'PUR-000012', batch: 'BATCH-2627-00001', supplier: 'Suraj Zari Threads Pvt Ltd', invoice_no: 'INV-2201', invoice_date: '2026-07-02',
      status: 'posted', uom: 'Bobbin', qty: 10, empty_per_unit_g: 45.000, gross_per_unit_g: 545.000, net_per_unit_g: 500.000, net_g: 5000.000,
      rate_per_unit: 5000.00, goods_value: 50000.00, freight: 0, taxable: 50000.00, cgst: 1250.00, sgst: 1250.00, igst: 0, gst_type: 'CGST + SGST', total: 52500.00,
      cost_per_gram: 10.00, remarks: '', invoice_file: 'INV-2201.pdf',
      lines: [{ item: 'Zari thread — 90 count', item_code: 'ZR-001', uom: 'Bobbin', qty: 10, empty_g: 45.000, gross_g: 545.000, net_g: 500.000, rate: '₹5,000.00 / bobbin' }],
      reversal: null
    }
  ],
  lots: [
    { id: 'LOT-00000001', item: 'Zari thread — 90 count', item_id: 'ZR-001', location: 'WARP-01', parent: null, source: 'PUR-000012', batch: 'BATCH-2627-00001', qty_pieces: 10, piece_uom: 'Bobbin', is_mixed_batch: false, carrier_code: null, landed_cost_per_gram: 10.00, status: 'consumed' },
    { id: 'LOT-00000002', item: 'Warped beam — partial', item_id: 'ZB-001', location: 'STORE-01', parent: 'LOT-00000001', source: 'JC-000001', batch: 'BATCH-2627-00001', qty_pieces: 1, piece_uom: 'Beam', is_mixed_batch: false, carrier_code: 'BEAM-07', landed_cost_per_gram: 10.00, status: 'available' },
    { id: 'LOT-00000003', item: 'Warped beam — partial', item_id: 'ZB-001', location: 'STORE-01', parent: 'LOT-00000001', source: 'JC-000002', batch: 'BATCH-2627-00001', qty_pieces: 1, piece_uom: 'Beam', is_mixed_batch: false, carrier_code: 'BEAM-11', landed_cost_per_gram: 10.00, status: 'available' },
    { id: 'LOT-00000004', item: 'Warped beam — partial', item_id: 'ZB-001', location: 'STORE-01', parent: 'LOT-00000001', source: 'JC-000003', batch: 'BATCH-2627-00001', qty_pieces: 1, piece_uom: 'Beam', is_mixed_batch: false, carrier_code: 'BEAM-04', landed_cost_per_gram: 10.00, status: 'available' },
    { id: 'LOT-00000005', item: 'Zari thread — 90 count', item_id: 'ZR-001', location: 'REW-02', parent: 'LOT-00000001', source: 'RET-000021', batch: 'BATCH-2627-00001', qty_pieces: 3, piece_uom: 'Bobbin', is_mixed_batch: false, carrier_code: null, landed_cost_per_gram: 10.00, status: 'consumed', is_partial: true },
    { id: 'LOT-00000006', item: 'Rewound bobbin', item_id: 'ZK-001', location: 'PIRN-03', parent: 'LOT-00000005', source: 'stage completion', batch: 'BATCH-2627-00001', qty_pieces: 1, piece_uom: 'Bobbin', is_mixed_batch: false, carrier_code: null, landed_cost_per_gram: 10.00, status: 'consumed' },
    { id: 'LOT-00000007', item: 'Pirn — finished', item_id: 'ZP-001', location: 'STORE-01', parent: 'LOT-00000006', source: 'stage completion', batch: 'BATCH-2627-00001', qty_pieces: 40, piece_uom: 'Pirn', is_mixed_batch: false, carrier_code: null, landed_cost_per_gram: 10.00, status: 'available' },
    { id: 'LOT-00000008', item: 'Zari thread — 90 count', item_id: 'ZR-001', location: 'STORE-01', parent: null, source: 'PUR-000013 (demo)', batch: 'BATCH-2627-00002', qty_pieces: 6, piece_uom: 'Bobbin', is_mixed_batch: false, carrier_code: null, landed_cost_per_gram: 10.00, status: 'available' }
  ],
  stockLedger: [
    { id: 'SLE-000001', ts: '2026-07-02', lot: 'LOT-00000001', item: 'Zari thread — 90 count', qty_g: 5000.000, type: 'purchase_receipt', ref: 'PUR-000012', location: 'STORE-01' },
    { id: 'SLE-000002', ts: '2026-07-03', lot: 'LOT-00000001', item: 'Zari thread — 90 count', qty_g: -5000.000, type: 'issue', ref: 'ISS-000044', location: 'WARP-01' },
    { id: 'SLE-000003', ts: '2026-07-04', lot: 'LOT-00000002', item: 'Warped beam — partial', qty_g: 1250.000, type: 'stage_output', ref: 'JC-000001', location: 'STORE-01' },
    { id: 'SLE-000004', ts: '2026-07-04', lot: 'LOT-00000003', item: 'Warped beam — partial', qty_g: 1500.000, type: 'stage_output', ref: 'JC-000002', location: 'STORE-01' },
    { id: 'SLE-000005', ts: '2026-07-04', lot: 'LOT-00000004', item: 'Warped beam — partial', qty_g: 1800.000, type: 'stage_output', ref: 'JC-000003', location: 'STORE-01' },
    { id: 'SLE-000006', ts: '2026-07-04', lot: 'LOT-00000005', item: 'Zari thread — partial bobbins', qty_g: 380.000, type: 'return_receipt', ref: 'RET-000021', location: 'STORE-01' },
    { id: 'SLE-000007', ts: '2026-07-05', lot: 'LOT-00000005', item: 'Zari thread — partial bobbins', qty_g: -380.000, type: 'issue', ref: 'ISS-000045', location: 'REW-02' },
    { id: 'SLE-000008', ts: '2026-07-05', lot: 'LOT-00000006', item: 'Rewound bobbin', qty_g: 373.000, type: 'stage_output', ref: 'ISS-000045', location: 'STORE-01' },
    { id: 'SLE-000009', ts: '2026-07-06', lot: 'LOT-00000006', item: 'Rewound bobbin', qty_g: -373.000, type: 'issue', ref: 'ISS-000046', location: 'PIRN-03' },
    { id: 'SLE-000010', ts: '2026-07-06', lot: 'LOT-00000007', item: 'Pirn — finished', qty_g: 364.000, type: 'stage_output', ref: 'ISS-000046', location: 'STORE-01' },
    { id: 'SLE-000011', ts: '2026-07-10', lot: 'LOT-00000008', item: 'Zari thread — 90 count', qty_g: 3000.000, type: 'purchase_receipt', ref: 'PUR-000013 (demo)', location: 'STORE-01' }
  ],
  wasteEntries: [
    { id: 'WST-000001', ts: '2026-07-04', stage: 'Warping', item: 'Zari waste', qty_g: 20.000, ref: 'JC-000001', location: 'WASTE-01' },
    { id: 'WST-000002', ts: '2026-07-04', stage: 'Warping', item: 'Zari waste', qty_g: 10.000, ref: 'JC-000002', location: 'WASTE-01' },
    { id: 'WST-000003', ts: '2026-07-04', stage: 'Warping', item: 'Zari waste', qty_g: 25.000, ref: 'JC-000003', location: 'WASTE-01' },
    { id: 'WST-000004', ts: '2026-07-05', stage: 'Rewinding', item: 'Zari waste', qty_g: 5.000, ref: 'ISS-000045', location: 'WASTE-01' },
    { id: 'WST-000005', ts: '2026-07-06', stage: 'Pirn winding', item: 'Zari waste', qty_g: 6.000, ref: 'ISS-000046', location: 'WASTE-01' }
  ],
  productionIssues: [
    {
      id: 'ISS-000044', machine: 'WARP-02', operator: 'Ramesh', status: 'issued', date: '2026-07-03',
      lines: [{ lot: 'LOT-00000001', qty_g: 5000.000 }], qty_g: 5000.000, lot: 'LOT-00000001'
    },
    {
      id: 'ISS-000045', machine: 'REW-02', operator: 'Ramesh', status: 'issued', date: '2026-07-05',
      lines: [{ lot: 'LOT-00000005', qty_g: 380.000 }], qty_g: 380.000, lot: 'LOT-00000005'
    },
    {
      id: 'ISS-000046', machine: 'PIRN-03', operator: 'Ramesh', status: 'issued', date: '2026-07-06',
      lines: [{ lot: 'LOT-00000006', qty_g: 373.000 }], qty_g: 373.000, lot: 'LOT-00000006'
    }
  ],
  jobCards: [
    {
      id: 'JC-000001', issue_id: 'ISS-000044', carrier: 'BEAM-07', type: 'BORDER', ends: 250, length_m: 275, width_in: 44, saree_design: 'Tree leaf', loom_no: '2', operator: 'Ramesh',
      empty_g: 12400.000, filled_g: 13690.000, paper_g: 40.000, output_g: 1250.000, waste_g: 20.000, consumed_g: 1270.000, status: 'complete'
    },
    {
      id: 'JC-000002', issue_id: 'ISS-000044', carrier: 'BEAM-11', type: 'BODY', ends: 100, length_m: 100, width_in: 46, saree_design: 'Mango leaf', loom_no: '3', operator: 'Suresh',
      empty_g: 9800.000, filled_g: 11315.000, paper_g: 15.000, output_g: 1500.000, waste_g: 10.000, consumed_g: 1510.000, status: 'complete'
    },
    {
      id: 'JC-000003', issue_id: 'ISS-000044', carrier: 'BEAM-04', type: 'BORDER', ends: 120, length_m: 100, width_in: 44, saree_design: 'Tree leaf', loom_no: '2', operator: 'Ramesh',
      empty_g: 10200.000, filled_g: 12015.000, paper_g: 15.000, output_g: 1800.000, waste_g: 25.000, consumed_g: 1825.000, status: 'complete'
    },
    {
      id: 'JC-000004', issue_id: 'ISS-000044', carrier: null, type: 'BORDER', ends: 150, length_m: 200, width_in: 44, saree_design: 'Tree leaf', loom_no: '2', operator: 'Ramesh',
      empty_g: null, filled_g: null, paper_g: null, output_g: null, waste_g: null, consumed_g: 0, status: 'in_progress'
    },
    {
      id: 'JC-000005', issue_id: 'ISS-000044', carrier: null, type: 'BODY', ends: 100, length_m: 220, width_in: 24, saree_design: 'Mango leaf', loom_no: '3', operator: 'Suresh',
      empty_g: null, filled_g: null, paper_g: null, output_g: null, waste_g: null, consumed_g: 0, status: 'in_progress'
    }
  ],
  warpingLogs: [],
  returns: [
    {
      id: 'RET-000021', status: 'accepted', is_partial: true, lot: 'LOT-00000005', bobbins: 3, gross_g: 515.000, tare_g: 135.000, net_g: 380.000,
      lines: [{ lot: 'LOT-00000005', item: 'Zari thread — partial bobbins', bobbins: 3, gross_g: 515.000, tare_g: 135.000, net_g: 380.000 }]
    },
    {
      id: 'RET-000022', status: 'pending', is_partial: true, bobbins: 2, gross_g: 210.000, tare_g: 90.000, net_g: 120.000,
      lines: [{ lot: null, item: 'Zari thread — 90 count', bobbins: 2, gross_g: 210.000, tare_g: 90.000, net_g: 120.000 }]
    }
  ],
  warpingClose: {
    issued_g: 5000.000, output_g: 4550.000, waste_g: 55.000, returned_g: 380.000, variance_g: 15.000,
    variance_pct: 0.30, tolerance_pct: 0.50, status: 'within_tolerance', reason: null
  },
  stageCompletions: [
    {
      id: 'SC-000001', stage: 'Rewinding', issue_id: 'ISS-000045', from_lot: 'LOT-00000005', to_lot: 'LOT-00000006', machine: 'REW-02',
      issued_g: 380.000, output_g: 373.000, waste_g: 5.000, returned_g: 0, variance_g: 2.000, variance_pct: 0.53, tolerance_pct: 0.50,
      status: 'needs_approval', is_mixed_batch: false, sources: ['LOT-00000005 (380.000 g)']
    },
    {
      id: 'SC-000002', stage: 'Pirn winding', issue_id: 'ISS-000046', from_lot: 'LOT-00000006', to_lot: 'LOT-00000007', machine: 'PIRN-03',
      issued_g: 373.000, output_g: 364.000, waste_g: 6.000, returned_g: 0, variance_g: 3.000, variance_pct: 0.80, tolerance_pct: 0.50,
      status: 'needs_approval', pieces_note: '40 pirns @ ~9.100 g avg'
    }
  ],
  jobCardCompletions: [
    { id: 'JCC-000001', job_card: 'JC-000001', ts: '2026-07-04', operator: 'Ramesh', filled_g: 13690.000, paper_g: 40.000, output_g: 1250.000, waste_g: 20.000 },
    { id: 'JCC-000002', job_card: 'JC-000002', ts: '2026-07-04', operator: 'Ramesh', filled_g: 11315.000, paper_g: 15.000, output_g: 1500.000, waste_g: 10.000 },
    { id: 'JCC-000003', job_card: 'JC-000003', ts: '2026-07-04', operator: 'Ramesh', filled_g: 12015.000, paper_g: 15.000, output_g: 1800.000, waste_g: 25.000 }
  ],
  stocktake: { status: 'not_started', location: null, lines: [], finalizedAt: null, approvedAt: null, approvedBy: null },
  sourceBatches: [
    { id: 'BATCH-2627-00001', purchase: 'PUR-000012', item: 'Zari thread — 90 count', qty_g: 5000.000, created: '2026-07-02' },
    { id: 'BATCH-2627-00002', purchase: 'PUR-000013 (demo)', item: 'Zari thread — 90 count', qty_g: 3000.000, created: '2026-07-10' }
  ],
  tieout: {
    batch: 'BATCH-2627-00001',
    lines: [
      { ref: 'LOT-00000002, 03, 04', label: 'Three beams (terminal)', g: 4550.000 },
      { ref: 'LOT-00000007', label: 'Pirns (terminal)', g: 364.000 },
      { ref: '—', label: 'Waste store (Warping + Rewinding + Pirn)', g: 66.000 },
      { ref: '—', label: 'Recorded variances (closed with a reason at each stage)', g: 20.000 }
    ],
    total_g: 5000.000,
    purchase_g: 5000.000,
    recovery_pct: 98.28,
    waste_pct: 1.32,
    variance_pct: 0.40,
    excludedNote: 'LOT-00000005 (380 g partials) and LOT-00000006 (373 g rewound) are intentionally not in this table — they were intermediate lots and are now fully consumed. Counting them would double-count. This is the most likely bug in the reporting layer.'
  },
  auditLog: [
    { ts: '2026-07-02 11:04', actor: 'Asha Rao · Admin', action: 'Posted purchase', ref: 'PUR-000012' },
    { ts: '2026-07-03 09:20', actor: 'Manoj Iyer · Inv. Supervisor', action: 'Issued material', ref: 'ISS-000044 · 5,000.000 g' },
    { ts: '2026-07-05 16:41', actor: 'Ravi Kumar · Operator', action: 'Completed job card', ref: 'JC-000003' },
    { ts: '2026-07-06 10:02', actor: 'Manoj Iyer · Inv. Supervisor', action: 'Accepted return', ref: 'RET-000021 · 380.000 g' },
    { ts: '2026-07-06 10:15', actor: 'Asha Rao · Admin', action: 'Closed Warping issue', ref: 'ISS-000044 · variance 15.000 g' }
  ]
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
