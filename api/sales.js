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
    const flds = ["id", "name", "client_order_ref", "partner_id", "date_order", "delivery_status", "state", "tag_ids"];
    if (mode === "salesman") flds.push(salesmanKey);
    let orders = await exec("sale.order", "search_read", [dom], { fields: flds, order: "date_order desc", limit: 400 });

    // mode salesman: 'ilike' bisa kepanggil mirip -> saring EXACT (case-insensitive)
    if (mode === "salesman") {
      const target = norm(rep.salesman);
      orders = orders.filter((o) => norm(namaField(o[salesmanKey])) === target);
    }

    if (!orders.length) return res.status(200).json({ ok: true, rep: rep.nama || "", sla: SLA_DAYS, orders: [] });
    const ids = orders.map((o) => o.id);

    // 6) Field "Jadwal Kirim" (x_studio_jadwal_kirim) - diisi routing staff via RuteKirim (Fase 2)
    let schedKey = "";
    try {
      const fg = await exec("sale.order", "fields_get", [[], ["string", "type"]]);
      const nz = (x) => String(x || "").trim().toLowerCase();
      schedKey = fg["x_studio_jadwal_kirim"] ? "x_studio_jadwal_kirim"
               : (Object.keys(fg).find((k) => nz(fg[k].string) === "jadwal kirim")
               || Object.keys(fg).find((k) => k.startsWith("x_studio_jadwal"))
               || (fg["x_scheduled_delivery"] ? "x_scheduled_delivery" : "")) || "";
    } catch {}
    const hasSched = !!schedKey;
    let schedMap = {};
    if (hasSched) {
      try {
        const s = await exec("sale.order", "read", [ids], { fields: ["id", schedKey] });
        schedMap = Object.fromEntries(s.map((o) => [o.id, o[schedKey] || ""]));
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
          const s = siapMap[oid] || (siapMap[oid] = { tot: 0, asg: 0, part: 0 });
          s.tot++;
          if (m.state === "assigned") s.asg++;
          else if (m.state === "partially_available") s.part++;
        });
      }
    } catch {}

    // 8b) Tag "GAGAL KIRIM" (ditulis RuteKirim saat pengiriman gagal) -> alasan utk sales
    const gagalMap = {};
    try {
      const tset = new Set();
      orders.forEach((o) => (o.tag_ids || []).forEach((t) => tset.add(t)));
      if (tset.size) {
        const tags = await exec("crm.tag", "read", [[...tset]], { fields: ["id", "name"] });
        const tmap = Object.fromEntries(tags.map((t) => [t.id, t.name || ""]));
        orders.forEach((o) => {
          const nm = (o.tag_ids || []).map((id) => tmap[id] || "").find((x) => /^gagal kirim/i.test(x));
          if (nm) gagalMap[o.id] = { alasan: nm.replace(/^gagal kirim\s*-?\s*/i, "").trim() };
        });
      }
    } catch {}

    // Kesiapan stok: "ada" (ter-reserve penuh) / "sebagian" / "belum" (belum ada reservasi) / "" (sedang/sudah dikirim -> tak relevan)
    const stokState = (o, stageKey) => {
      if (stageKey >= 5 || o.delivery_status === "full") return "";
      const s = siapMap[o.id];
      if (!s || s.tot === 0) return "belum";
      if (s.asg >= s.tot) return "ada";
      if (s.asg + s.part > 0) return "sebagian";
      return "belum";
    };

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
      if (siapMap[o.id] && (siapMap[o.id].asg + siapMap[o.id].part) > 0) return { key: 3, label: "Barang Disiapkan" };
      return { key: 2, label: "Diproses" };
    };

    // 10) PROJECTION: hanya field aman
    const out = orders.map((o) => {
      const st = stageOf(o);
      const lm = lineMap[o.id];
      const aging = hari(o.date_order);
      const delivered = st.key >= 6;
      const g = gagalMap[o.id];
      const gagal = !!g && st.key <= 4;          // tampilkan hanya bila belum dikirim/selesai
      const stok = stokState(o, st.key);          // "ada" | "sebagian" | "belum" | ""
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
        gagal,
        gagalAlasan: gagal ? (g.alasan || "") : "",
        stok,
        belumReady: stok === "belum" && !gagal,
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
