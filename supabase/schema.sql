-- Zari Tracker v2 Database Schema (Supabase PostgreSQL)

-- 1. PROFILES & ROLES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'inv_sup', 'operator')),
    role_label TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for all users" ON public.profiles
    FOR ALL USING (true) WITH CHECK (true);

-- 2. MASTER DATA
CREATE TABLE IF NOT EXISTS public.legal_entities (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    gstin TEXT NOT NULL,
    state_code TEXT NOT NULL,
    state_name TEXT NOT NULL,
    address TEXT
);

CREATE TABLE IF NOT EXISTS public.suppliers (
    name TEXT PRIMARY KEY,
    state_code TEXT NOT NULL,
    state_name TEXT NOT NULL,
    gstin TEXT,
    address TEXT NOT NULL,
    payment_terms TEXT NOT NULL,
    pan_no TEXT,
    email TEXT,
    phone_no TEXT
);

CREATE TABLE IF NOT EXISTS public.items (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('Raw zari', 'Beam', 'Rewound bobbin', 'Pirn', 'Waste')),
    uom TEXT NOT NULL,
    hsn TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.item_gst_rates (
    id SERIAL PRIMARY KEY,
    item TEXT NOT NULL REFERENCES public.items(name) ON UPDATE CASCADE,
    rate_pct NUMERIC(5,2) NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    CONSTRAINT check_dates CHECK (effective_to IS NULL OR effective_from <= effective_to)
);

CREATE TABLE IF NOT EXISTS public.stage_output_maps (
    id SERIAL PRIMARY KEY,
    stage TEXT NOT NULL CHECK (stage IN ('Warping', 'Rewinding', 'Pirn winding')),
    input_item TEXT NOT NULL REFERENCES public.items(name) ON UPDATE CASCADE,
    output_item TEXT NOT NULL REFERENCES public.items(name) ON UPDATE CASCADE,
    waste_item TEXT NOT NULL REFERENCES public.items(name) ON UPDATE CASCADE,
    UNIQUE (stage, input_item)
);

CREATE TABLE IF NOT EXISTS public.locations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.production_spaces (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.carriers (
    code TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('Beam', 'Pirn tube', 'Pagadi')),
    empty_g NUMERIC(12,3) NOT NULL
);

-- 3. PURCHASES & INVENTORY
CREATE TABLE IF NOT EXISTS public.purchases (
    id TEXT PRIMARY KEY, -- e.g. PUR-000012
    batch TEXT NOT NULL UNIQUE,
    supplier TEXT NOT NULL REFERENCES public.suppliers(name) ON UPDATE CASCADE,
    invoice_no TEXT NOT NULL,
    invoice_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'posted')),
    uom TEXT NOT NULL,
    qty INTEGER NOT NULL,
    empty_per_unit_g NUMERIC(12,3),
    gross_per_unit_g NUMERIC(12,3),
    net_per_unit_g NUMERIC(12,3),
    net_g NUMERIC(12,3) NOT NULL,
    rate_per_unit NUMERIC(12,2) NOT NULL,
    goods_value NUMERIC(12,2) NOT NULL,
    freight NUMERIC(12,2) DEFAULT 0,
    taxable NUMERIC(12,2) NOT NULL,
    cgst NUMERIC(12,2) DEFAULT 0,
    sgst NUMERIC(12,2) DEFAULT 0,
    igst NUMERIC(12,2) DEFAULT 0,
    gst_type TEXT NOT NULL,
    total NUMERIC(12,2) NOT NULL,
    cost_per_gram NUMERIC(12,4) NOT NULL,
    remarks TEXT,
    invoice_file TEXT,
    reversal JSONB
);

CREATE TABLE IF NOT EXISTS public.lots (
    id TEXT PRIMARY KEY, -- e.g. LOT-00000001
    item TEXT NOT NULL REFERENCES public.items(name) ON UPDATE CASCADE,
    location TEXT REFERENCES public.locations(code) ON UPDATE CASCADE,
    parent TEXT REFERENCES public.lots(id),
    source TEXT NOT NULL, -- purchase_id, stage_completion_id, etc.
    batch TEXT NOT NULL,
    qty_pieces INTEGER,
    piece_uom TEXT,
    is_mixed_batch BOOLEAN DEFAULT FALSE,
    carrier_code TEXT REFERENCES public.carriers(code) ON UPDATE CASCADE,
    landed_cost_per_gram NUMERIC(12,4),
    status TEXT NOT NULL CHECK (status IN ('available', 'consumed', 'issued')),
    is_partial BOOLEAN DEFAULT FALSE
);

-- 4. STOCK LEDGER (APPEND ONLY)
CREATE TABLE IF NOT EXISTS public.stock_ledger (
    id TEXT PRIMARY KEY, -- e.g. SLE-000001
    ts TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    lot TEXT NOT NULL REFERENCES public.lots(id),
    item TEXT NOT NULL,
    qty_g NUMERIC(12,3) NOT NULL,
    type TEXT NOT NULL, -- e.g. purchase_receipt, issue, stage_output, return_receipt, reversal
    ref TEXT NOT NULL, -- Reference ID (e.g. PUR-000012, ISS-000044)
    location TEXT REFERENCES public.locations(code) ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS public.waste_entries (
    id TEXT PRIMARY KEY, -- e.g. WST-000001
    ts TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    stage TEXT NOT NULL,
    item TEXT NOT NULL REFERENCES public.items(name) ON UPDATE CASCADE,
    qty_g NUMERIC(12,3) NOT NULL,
    ref TEXT NOT NULL,
    location TEXT REFERENCES public.locations(code) ON UPDATE CASCADE
);

-- 5. PRODUCTION PROCESSES
CREATE TABLE IF NOT EXISTS public.production_issues (
    id TEXT PRIMARY KEY, -- e.g. ISS-000044
    machine TEXT NOT NULL, -- References production_spaces code
    operator TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('issued', 'closed')),
    date TEXT NOT NULL,
    qty_g NUMERIC(12,3) NOT NULL,
    lot TEXT NOT NULL, -- Primary lot code(s)
    remarks TEXT
);

CREATE TABLE IF NOT EXISTS public.production_issue_lines (
    id SERIAL PRIMARY KEY,
    issue_id TEXT NOT NULL REFERENCES public.production_issues(id) ON DELETE CASCADE,
    lot TEXT NOT NULL REFERENCES public.lots(id),
    qty_g NUMERIC(12,3) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.job_cards (
    id TEXT PRIMARY KEY, -- e.g. JC-000001
    issue_id TEXT NOT NULL REFERENCES public.production_issues(id) ON DELETE CASCADE,
    carrier TEXT REFERENCES public.carriers(code) ON UPDATE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('BORDER', 'BODY')),
    ends INTEGER NOT NULL,
    length_m NUMERIC(12,2) NOT NULL,
    width_in NUMERIC(12,2) NOT NULL,
    saree_design TEXT NOT NULL,
    loom_no TEXT NOT NULL, -- references production_spaces
    operator TEXT NOT NULL,
    empty_g NUMERIC(12,3),
    filled_g NUMERIC(12,3),
    paper_g NUMERIC(12,3),
    output_g NUMERIC(12,3),
    waste_g NUMERIC(12,3),
    consumed_g NUMERIC(12,3) DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('draft', 'pending', 'in_progress', 'complete'))
);

CREATE TABLE IF NOT EXISTS public.warping_logs (
    id TEXT PRIMARY KEY, -- e.g. WL-000001
    job_card TEXT NOT NULL REFERENCES public.job_cards(id) ON DELETE CASCADE,
    operator TEXT NOT NULL,
    bobbins INTEGER NOT NULL,
    ns_a NUMERIC(12,3) NOT NULL,
    fp_a NUMERIC(12,3) NOT NULL,
    eb_a NUMERIC(12,3) NOT NULL,
    gross_a NUMERIC(12,3) NOT NULL,
    ns_b NUMERIC(12,3) NOT NULL,
    fp_b NUMERIC(12,3) NOT NULL,
    eb_b NUMERIC(12,3) NOT NULL,
    gross_b NUMERIC(12,3) NOT NULL,
    net_a NUMERIC(12,3) NOT NULL,
    net_b NUMERIC(12,3) NOT NULL,
    total_net_g NUMERIC(12,3) NOT NULL,
    waste_g NUMERIC(12,3),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.returns (
    id TEXT PRIMARY KEY, -- e.g. RET-000021
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
    is_partial BOOLEAN DEFAULT TRUE NOT NULL,
    lot TEXT, -- references created lot once accepted
    bobbins INTEGER NOT NULL,
    gross_g NUMERIC(12,3) NOT NULL,
    tare_g NUMERIC(12,3) NOT NULL,
    net_g NUMERIC(12,3) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.return_lines (
    id SERIAL PRIMARY KEY,
    return_id TEXT NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
    lot TEXT,
    item TEXT NOT NULL,
    bobbins INTEGER NOT NULL,
    gross_g NUMERIC(12,3) NOT NULL,
    tare_g NUMERIC(12,3) NOT NULL,
    net_g NUMERIC(12,3) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.warping_close (
    id TEXT PRIMARY KEY, -- References production_issue_id
    issued_g NUMERIC(12,3) NOT NULL,
    output_g NUMERIC(12,3) NOT NULL,
    waste_g NUMERIC(12,3) NOT NULL,
    returned_g NUMERIC(12,3) NOT NULL,
    variance_g NUMERIC(12,3) NOT NULL,
    variance_pct NUMERIC(5,2) NOT NULL,
    tolerance_pct NUMERIC(5,2) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('within_tolerance', 'needs_approval', 'closed', 'flagged')),
    reason TEXT
);

CREATE TABLE IF NOT EXISTS public.stage_completions (
    id TEXT PRIMARY KEY, -- e.g. SC-000001
    stage TEXT NOT NULL CHECK (stage IN ('Rewinding', 'Pirn winding')),
    issue_id TEXT NOT NULL REFERENCES public.production_issues(id) ON DELETE CASCADE,
    from_lot TEXT NOT NULL REFERENCES public.lots(id),
    to_lot TEXT NOT NULL REFERENCES public.lots(id),
    machine TEXT NOT NULL,
    issued_g NUMERIC(12,3) NOT NULL,
    output_g NUMERIC(12,3) NOT NULL,
    waste_g NUMERIC(12,3) NOT NULL,
    returned_g NUMERIC(12,3) DEFAULT 0 NOT NULL,
    variance_g NUMERIC(12,3) NOT NULL,
    variance_pct NUMERIC(5,2) NOT NULL,
    tolerance_pct NUMERIC(5,2) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('needs_approval', 'closed', 'flagged')),
    is_mixed_batch BOOLEAN DEFAULT FALSE,
    sources JSONB,
    pieces_note TEXT,
    reason TEXT
);

-- 6. STOCK TAKES
CREATE TABLE IF NOT EXISTS public.stocktakes (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'finalized', 'approved')),
    location TEXT NOT NULL,
    finalized_at TEXT,
    approved_at TEXT,
    approved_by TEXT
);

CREATE TABLE IF NOT EXISTS public.stocktake_lines (
    id SERIAL PRIMARY KEY,
    stocktake_id TEXT NOT NULL REFERENCES public.stocktakes(id) ON DELETE CASCADE,
    lot TEXT NOT NULL REFERENCES public.lots(id),
    system_g NUMERIC(12,3) NOT NULL,
    counted_g NUMERIC(12,3) NOT NULL,
    variance_g NUMERIC(12,3) NOT NULL
);

-- 7. AUDIT TRAIL
CREATE TABLE IF NOT EXISTS public.audit_log (
    id SERIAL PRIMARY KEY,
    ts TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    ref TEXT NOT NULL
);

-- RLS CONFIGURATION ON TRANSACTION TABLES
-- For this prototype layout, we set basic RLS rules:
ALTER TABLE public.legal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_gst_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_output_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_issue_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warping_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warping_close ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktake_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Dynamic Policy: Allow all operations (select, insert, update, delete) for all users
CREATE POLICY "Allow all operations for all users" ON public.legal_entities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.item_gst_rates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.stage_output_maps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.locations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.production_spaces FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.carriers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.purchases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.lots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.stock_ledger FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.waste_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.production_issues FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.production_issue_lines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.job_cards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.warping_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.returns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.return_lines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.warping_close FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.stage_completions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.stocktakes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.stocktake_lines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for all users" ON public.audit_log FOR ALL USING (true) WITH CHECK (true);

-- Mutations policies based on permissions matrix will be gated by role mapping
-- Example: Admin & Inv_Sup can write/edit purchases
-- To simplify execution, standard app permissions check JWT profile roles in Server Actions,
-- backed by profile verification before writing.

-- 8. DOCUMENT COUNTERS & AUTOMATION
CREATE TABLE IF NOT EXISTS public.doc_counters (
    prefix TEXT PRIMARY KEY,
    current_val INTEGER NOT NULL DEFAULT 0
);

-- Initialize default counters matching INITIAL_SEED volumes to prevent overlaps
INSERT INTO public.doc_counters (prefix, current_val) VALUES ('PUR', 12) ON CONFLICT DO NOTHING;
INSERT INTO public.doc_counters (prefix, current_val) VALUES ('LOT', 8) ON CONFLICT DO NOTHING;
INSERT INTO public.doc_counters (prefix, current_val) VALUES ('SLE', 11) ON CONFLICT DO NOTHING;
INSERT INTO public.doc_counters (prefix, current_val) VALUES ('WST', 5) ON CONFLICT DO NOTHING;
INSERT INTO public.doc_counters (prefix, current_val) VALUES ('ISS', 46) ON CONFLICT DO NOTHING;
INSERT INTO public.doc_counters (prefix, current_val) VALUES ('JC', 5) ON CONFLICT DO NOTHING;
INSERT INTO public.doc_counters (prefix, current_val) VALUES ('RET', 22) ON CONFLICT DO NOTHING;
INSERT INTO public.doc_counters (prefix, current_val) VALUES ('STG', 2) ON CONFLICT DO NOTHING;

-- Atomic, Gap-free Document Numbering Function
CREATE OR REPLACE FUNCTION public.get_next_doc_number(doc_prefix TEXT, padding_size INTEGER)
RETURNS TEXT AS $$
DECLARE
    next_val INTEGER;
BEGIN
    INSERT INTO public.doc_counters (prefix, current_val)
    VALUES (doc_prefix, 1)
    ON CONFLICT (prefix) DO UPDATE
    SET current_val = public.doc_counters.current_val + 1
    RETURNING current_val INTO next_val;

    RETURN doc_prefix || '-' || LPAD(next_val::TEXT, padding_size, '0');
END;
$$ LANGUAGE plpgsql;

-- Append-Only Stock Ledger Enforcer Trigger
CREATE OR REPLACE FUNCTION public.prevent_ledger_modifications()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Updates and deletions are not allowed on the stock ledger table.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER block_ledger_update
BEFORE UPDATE OR DELETE ON public.stock_ledger
FOR EACH ROW EXECUTE FUNCTION public.prevent_ledger_modifications();

