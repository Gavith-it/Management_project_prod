export const MARK_TO_BOBBIN = 4;
export const BOBBIN_TARE_REF_G = 16.0;

export function estimatedConsumptionG(ends, length_m) {
  if (!ends || !length_m) return 0;
  return ((ends * 2) * length_m) / 68;
}

export function currentGstRatePct(itemName, onDateISO, itemGstRates) {
  const onDate = onDateISO || new Date().toISOString().slice(0, 10);
  const rows = itemGstRates.filter((r) => r.item === itemName);
  const match = rows.find(
    (r) =>
      r.effective_from <= onDate &&
      (!r.effective_to || r.effective_to >= onDate)
  );
  if (match) return Number(match.rate_pct);
  const latest = rows
    .slice()
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
  return latest ? Number(latest.rate_pct) : 5.00;
}

export function gstTypeFor(supplier, ourStateCode) {
  if (!supplier) return { label: 'CGST + SGST', note: 'No supplier specified.' };
  if (!supplier.gstin) {
    return {
      label: 'Reverse charge',
      note: 'Supplier has no GSTIN — we pay the tax to the government directly.'
    };
  }
  if (supplier.state_code === ourStateCode) {
    return {
      label: 'CGST + SGST',
      note: `Supplier is in our state (${supplier.state_name}) — split half each.`
    };
  }
  return {
    label: 'IGST',
    note: `Supplier is out of state (${supplier.state_name}) — full rate, one line.`
  };
}

export function computePurchaseTotals(form, suppliers, itemGstRates, ourStateCode) {
  const uom = form.uom || 'Bobbin';
  const supplierName = form.supplier || (suppliers[0] && suppliers[0].name) || "";
  const s = suppliers.find((x) => x.name === supplierName) || suppliers[0] || {};
  const gst = gstTypeFor(s, ourStateCode);
  const itemName = form.item || "";
  const gstPct = currentGstRatePct(itemName, form.invoice_date, itemGstRates);
  const freight = Number(form.freight || 0);

  let qty = 0,
    ratePerUnit = 0,
    empty = 0,
    gross = 0,
    netPerUnit = 0,
    totalNet = 0,
    taxableItem = 0;

  if (uom === 'Grams') {
    qty = Number(form.qty_g || 0);
    ratePerUnit = Number(form.rate || 0);
    totalNet = qty;
    taxableItem = qty * ratePerUnit;
  } else {
    const isMark = uom === 'Mark';
    const mult = isMark ? 4 : 1;
    empty = Number(form.empty_g || 0) * mult;
    gross = Number(form.gross_g || 0) * mult;
    qty = Number(form.bobbins || 0);
    ratePerUnit = Number(form.rate || 0);
    netPerUnit = Math.max(0, gross - empty);
    totalNet = netPerUnit * qty;
    taxableItem = ratePerUnit * qty;
  }

  const taxableBase = taxableItem + freight;
  const costPerGram = totalNet > 0 ? taxableBase / totalNet : 0;
  let cgst = 0,
    sgst = 0,
    igst = 0;

  if (gst.label === 'CGST + SGST') {
    cgst = taxableBase * (gstPct / 200);
    sgst = taxableBase * (gstPct / 200);
  } else if (gst.label === 'IGST') {
    igst = taxableBase * (gstPct / 100);
  }

  const total = taxableBase + cgst + sgst + igst;

  return {
    uom,
    qty,
    ratePerUnit,
    empty,
    gross,
    netPerUnit,
    totalNet,
    taxableItem,
    freight,
    taxableBase,
    supplierName,
    gst,
    gstPct,
    costPerGram,
    cgst,
    sgst,
    igst,
    total
  };
}

export function issueLineComputedNet(lot, f, prefix = 'il_') {
  if (!lot) return { uom: null, net_g: 0 };
  const uom = lot.piece_uom;
  if (uom === 'Mark') {
    const marks = Number(f[prefix + 'marks'] || 0);
    const bobbins = marks * MARK_TO_BOBBIN;
    const gross = Number(f[prefix + 'gross'] || 0);
    const crate = Number(f[prefix + 'crate'] || 0);
    const bw = f[prefix + 'bw'] !== undefined && f[prefix + 'bw'] !== "" ? Number(f[prefix + 'bw']) : BOBBIN_TARE_REF_G;
    return {
      uom: 'Mark',
      marks,
      bobbins,
      gross_g: gross,
      crate_g: crate,
      bobbin_weight_g: bw,
      net_g: gross - crate - bobbins * bw
    };
  }
  if (uom === 'Bobbin') {
    const bobbins = Number(f[prefix + 'bobbins'] || 0);
    const gross = Number(f[prefix + 'gross'] || 0);
    const crate = Number(f[prefix + 'crate'] || 0);
    const bw = f[prefix + 'bw'] !== undefined && f[prefix + 'bw'] !== "" ? Number(f[prefix + 'bw']) : BOBBIN_TARE_REF_G;
    return {
      uom: 'Bobbin',
      bobbins,
      gross_g: gross,
      crate_g: crate,
      bobbin_weight_g: bw,
      net_g: gross - crate - bobbins * bw
    };
  }
  return { uom: uom || 'Grams', net_g: Number(f[prefix + 'qty_g'] || 0) };
}

// Formatting helpers
export function fmtG(x) {
  if (x === null || x === undefined || isNaN(x)) return "—";
  return Number(x).toFixed(3);
}

export function fmtPct(x) {
  if (x === null || x === undefined || isNaN(x)) return "—";
  return Number(x).toFixed(2) + "%";
}

export function fmtMoney(x) {
  if (x === null || x === undefined || isNaN(x)) return "—";
  return "₹" + Number(x).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function fmtSignedG(x) {
  if (x === null || x === undefined || isNaN(x)) return "—";
  return (x > 0 ? "+" : "") + fmtG(x) + " g";
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
