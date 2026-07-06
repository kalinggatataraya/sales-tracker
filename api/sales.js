// api/sales.js — Jembatan read-only untuk SALES TRACKER.
// Prinsip keamanan (WAJIB): SCOPE + PROJECTION di sisi server.
//   SCOPE      : hanya mengambil sale.order milik SATU sales (berdasar kolom "Salesman").
//   PROJECTION : hanya mengembalikan field STATUS yang di-allowlist.
// TIDAK PERNAH mengembalikan: nilai penjualan, biaya/modal, rute, order sales lain.
//
// Sales TIDAK perlu akun Odoo. Pemisahan dibaca dari kolom "Salesman" di sale.order
// (field khusus, sama yang dipakai RuteKirim — dideteksi otomatis dari label "Salesman").
//
// ENV VARS di Vercel (project SalesTracker):
//   ODOO_URL, ODOO_DB, ODOO_USER, ODOO_KEY   -> sama seperti RuteKirim (user read-only cukup)
//   SALES_REPS = JSON daftar sales. Petakan tiap sales ke nilai kolom "Salesman" Odoo:
//     [{"token":"novan-4k2p","nama":"Novan","salesman":"NOVAN"},
//      {"token":"wawan-8m3x","nama":"Wawan","salesman":"WAWAN"}]
//     (Alternatif kalau sales KEBETULAN user Odoo: pakai "uid":15 atau "email":"...".)
//   SALES_SLA_DAYS = target hari PO -> Diterima (default 7). Lewat itu = TELAT.

const ODOO_URL  = process.env.ODOO_URL;
const ODOO_DB   = process.env.ODOO_DB;
const ODOO_USER = process.env.ODOO_USER || process.env.ODOO_LOGIN;
const ODOO_KEY  = process.env.ODOO_KEY  || process.env.ODOO_API_KEY;
const SLA_DAYS  = Number(process.env.SALES_SLA_DAYS || 7);

function reps() {
  try { return JSON.parse(process.env.SALES_REPS || "[]"); } catch { return []; }
}
const norm = (x) => String(x || "").trim().toLowerCase();
const namaField = (v) => (Array.isArray(v) ? (v[1] || "") : (v || "")); // many2one [id,nama] atau scalar

async function rpc(service, method, args) {
  const r = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args } }),
  });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 400));
  return j.result;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    // 1) Token -> rep
    const token = String((req.query && req.query.k) || (req.body && req.body.k) || "").trim();
    if (!token) return res.status(401).json({ error: "Kode akses kosong." });
    const rep = reps().find((x) => String(x.token) === token);
    if (!rep) return res.status(403).json({ error: "Kode akses tidak dikenal." });

    if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !ODOO_KEY)
      return res.status(500).json({ error: "Konfigurasi Odoo (ODOO_URL/DB/USER/KEY) belum lengkap di Vercel." });

    // 2) Auth Odoo (satu integration user)
    const uid = await rpc("common", "authenticate", [ODOO_DB, ODOO_USER, ODOO_KEY, {}]);
    if (!uid) return res.status(401).json({ error: "Login Odoo ditolak. Cek ODOO_USER / ODOO_KEY di Vercel." });
    const exec = (model, method, params, kwargs = {}) =>
      rpc("object", "execute_kw", [ODOO_DB, uid, ODOO_KEY, model, method, params, kwargs]);

    // 3) Deteksi kolom "Salesman" otomatis (sama seperti RuteKirim)
    let salesmanKey = "";
    try {
      const fg = await exec("sale.order", "fields_get", [[], ["string", "type"]]);
      salesmanKey = Object.keys(fg).find((k) => norm(fg[k].string) === "salesman")
                 || Object.keys(fg).find((k) => norm(fg[k].string).includes("salesman")) || "";
    } catch {}

    // 4) Tentukan MODE scoping
    //    (a) mode "salesman": rep punya nilai salesman -> filter kolom Salesman.
    //    (b) mode "user": rep punya uid/email -> filter user_id (kalau sales kebetulan user Odoo).
    const baseState = ["state", "in", ["sale", "done"]];
    let dom, mode = "";
    if (rep.salesman) {
      if (!salesmanKey)
        return res.status(500).json({ error: "Kolom 'Salesman' tidak ditemukan di Odoo. Pastikan field bernama/berlabel 'Salesman' ada di sale.order." });
      mode = "salesman";
      dom = [[salesmanKey, "ilike", rep.salesman], baseState];
    } else {
      let spUid = rep.uid || null;
      if (!spUid && (rep.email || rep.login)) {
        const u = await exec("res.users", "search_read", [[["login", "=", rep.email || rep.login]]], { fields: ["id"], limit: 1 });
        spUid = u.length ? u[0].id : null;
      }
      if (!spUid && rep.nama) {
        const u = await exec("res.users", "search_read", [[["name", "=", rep.nama]]], { fields: ["id"], limit: 1 });
        spUid = u.length ? u[0].id : null;
      }
      if (!spUid)
        return res.status(500).json({ error: "Sales belum bisa dipetakan. Isi 'salesman' (nilai kolom Salesman di Odoo), atau 'uid'/'email' jika sales adalah user Odoo." });
      mode = "user";
      dom = [["user_id", "=", spUid], baseState];
    }

    // 5) Ambil order (SCOPE)
    const flds = ["id", "name", "client_order_ref", "partner_id", "date_order", "delivery_status", "state"];
    if (mode === "salesman") flds.push(salesmanKey);
    let orders = await exec("sale.order", "search_read", [dom], { fields: flds, order: "date_order desc", limit: 400 });

    // mode salesman: 'ilike' bisa kepanggil mirip -> saring EXACT (case-insensitive)
    if (mode === "salesman") {
      const target = norm(rep.salesman);
      orders = orders.filter((o) => norm(namaField(o[salesmanKey])) === target);
    }

    if (!orders.length) return res.status(200).json({ ok: true, rep: rep.nama || "", sla: SLA_DAYS, orders: [] });
    const ids = orders.map((o) => o.id);

    // 6) (opsional) field jadwal custom dari writeback RuteKirim (Fase 2)
    let hasSched = false;
    try {
      const fg = await exec("sale.order", "fields_get", [[], ["type"]]);
      hasSched = !!fg["x_scheduled_delivery"];
    } catch {}
    let schedMap = {};
    if (hasSched) {
      try {
        const s = await exec("sale.order", "read", [ids], { fields: ["id", "x_scheduled_delivery"] });
        schedMap = Object.fromEntries(s.map((o) => [o.id, o.x_scheduled_delivery || ""]));
      } catch {}
    }

    // 7) Rasio item terkirim
    const lineMap = {};
    try {
      const lines = await exec("sale.order.line", "search_read", [[["order_id", "in", ids]]], {
        fields: ["order_id", "product_uom_qty", "qty_delivered"],
      });
      lines.forEach((l) => {
        const oid = (l.order_id || [])[0];
        if (!oid) return;
        const m = lineMap[oid] || (lineMap[oid] = { tot: 0, done: 0 });
        const qty = l.product_uom_qty || 0;
        if (qty <= 0) return;
        m.tot++;
        if ((l.qty_delivered || 0) >= qty) m.done++;
      });
    } catch {}

    // 8) Reservasi stok -> "Barang Disiapkan"
    const siapMap = {};
    try {
      const picks = await exec("stock.picking", "search_read", [[
        ["sale_id", "in", ids],
        ["state", "not in", ["done", "cancel"]],
        ["picking_type_code", "=", "outgoing"],
      ]], { fields: ["id", "sale_id"] });
      const pickToOrder = {};
      const pickIds = [];
      picks.forEach((p) => {
        const oid = (p.sale_id || [])[0];
        if (oid) { pickToOrder[p.id] = oid; pickIds.push(p.id); }
      });
      if (pickIds.length) {
        const moves = await exec("stock.move", "search_read", [[
          ["picking_id", "in", pickIds],
          ["state", "not in", ["done", "cancel"]],
        ]], { fields: ["picking_id", "state"] });
        moves.forEach((m) => {
          const pid = (m.picking_id || [])[0];
          const oid = pickToOrder[pid];
          if (!oid) return;
          const s = siapMap[oid] || (siapMap[oid] = { any: false });
          if (m.state === "assigned" || m.state === "partially_available") s.any = true;
        });
      }
    } catch {}

    // 9) Tahap
    const now = Date.now();
    const hari = (d) => (d ? Math.max(0, Math.floor((now - new Date(d).getTime()) / 86400000)) : 0);
    const stageOf = (o) => {
      const ds = o.delivery_status;
      if (ds === "full") return { key: 6, label: "Diterima Customer" };
      const lm = lineMap[o.id];
      const partial = ds === "partial" || (lm && lm.done > 0 && lm.done < lm.tot);
      if (ds === "partial" || ds === "started") return { key: 5, label: partial ? "Sebagian Terkirim" : "Dalam Pengiriman" };
      if (hasSched && schedMap[o.id]) return { key: 4, label: "Dijadwalkan Kirim" };
      if (siapMap[o.id] && siapMap[o.id].any) return { key: 3, label: "Barang Disiapkan" };
      return { key: 2, label: "Diproses" };
    };

    // 10) PROJECTION: hanya field aman
    const out = orders.map((o) => {
      const st = stageOf(o);
      const lm = lineMap[o.id];
      const aging = hari(o.date_order);
      const delivered = st.key >= 6;
      return {
        po: o.name,
        ref: o.client_order_ref || "",
        customer: (o.partner_id || [])[1] || "",
        stage: st.key,
        stageLabel: st.label,
        aging,
        overdue: !delivered && aging > SLA_DAYS,
        scheduled: hasSched ? (schedMap[o.id] || "") : "",
        delivered,
        tanggalPO: o.date_order || "",
        partial: lm && lm.tot ? { done: lm.done, tot: lm.tot } : null,
      };
    });

    const bersih = out.filter((o) => !(o.stage >= 6 && o.aging > 21));
    return res.status(200).json({ ok: true, rep: rep.nama || "", sla: SLA_DAYS, orders: bersih });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
