import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  RefreshCw, Search, Copy, ChevronLeft, AlertTriangle, Package,
  Truck, CheckCircle2, Clock, LogOut, MapPin, Check,
} from "lucide-react";

/* ---------- Tema (selaras dengan RuteKirim) ---------- */
const T = {
  bg: "#f7f8fa", surface: "#ffffff", surface2: "#f1f3f7", border: "#e4e8ee",
  text: "#111827", muted: "#667085", primary: "#2563eb",
  ok: "#16a34a", warn: "#d97706", danger: "#e0413e",
};

const STAGES = [
  "PO Masuk", "Diproses", "Barang Disiapkan",
  "Dijadwalkan Kirim", "Dalam Pengiriman", "Diterima Customer",
];

const stageIcon = (k) =>
  k >= 6 ? CheckCircle2 : k === 5 ? Truck : k === 4 ? Clock : k === 3 ? Package : Clock;

const tglPendek = (s) => {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
};
const tglPanjang = (s) => {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
};

const pesanCustomer = (o) => {
  const ref = o.ref || o.po;
  if (o.gagal) return `Halo Bapak/Ibu, mohon maaf pengiriman pesanan PO ${ref} sempat tertunda. Kami segera menjadwalkan ulang pengirimannya. Terima kasih atas pengertiannya \u{1F64F}`;
  if (o.belumReady) return `Halo Bapak/Ibu, update pesanan PO ${ref}: barang sedang kami siapkan. Kami kabari kembali begitu siap dikirim. Terima kasih \u{1F64F}`;
  const inti = {
    2: "pesanan sedang kami proses",
    3: "barang sedang kami siapkan",
    4: o.scheduled ? `barang dijadwalkan dikirim ${tglPendek(o.scheduled)}` : "barang dijadwalkan untuk pengiriman",
    5: o.partial && o.partial.done < o.partial.tot ? "sebagian barang sudah dalam pengiriman" : "barang sedang dalam pengiriman",
    6: "barang sudah diterima",
  }[o.stage] || "pesanan sedang kami proses";
  return `Halo Bapak/Ibu, update pesanan PO ${ref}: ${inti}. Terima kasih 🙏`;
};

/* ---------- Stepper 6 titik ---------- */
function Stepper({ stage }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, margin: "6px 0" }}>
      {STAGES.map((_, i) => {
        const n = i + 1;
        const done = n < stage, cur = n === stage;
        const col = done ? T.ok : cur ? T.primary : "#cfd6e0";
        return (
          <React.Fragment key={i}>
            <div style={{
              width: cur ? 13 : 10, height: cur ? 13 : 10, borderRadius: "50%",
              background: done || cur ? col : T.surface,
              border: `2px solid ${col}`, flex: "0 0 auto",
            }} />
            {i < STAGES.length - 1 && (
              <div style={{ flex: 1, height: 2, background: n < stage ? T.ok : "#e4e8ee" }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ---------- Kartu order ---------- */
function OrderCard({ o, onOpen }) {
  const Icon = stageIcon(o.stage);
  return (
    <button onClick={() => onOpen(o)} style={{
      width: "100%", textAlign: "left", background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 14, padding: "13px 14px", marginBottom: 10, cursor: "pointer",
      display: "block", boxShadow: "0 1px 2px rgba(16,24,40,.04)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: T.text, lineHeight: 1.25 }}>{o.customer || "—"}</div>
        <div style={{ flex: "0 0 auto", display: "flex", gap: 5 }}>
          {o.gagal && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: T.danger, padding: "2px 7px", borderRadius: 20 }}>GAGAL</span>
          )}
          {o.overdue && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: T.danger, padding: "2px 7px", borderRadius: 20 }}>TELAT</span>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: T.muted, marginTop: 1 }}>
        {o.po}{o.ref ? ` · PO: ${o.ref}` : ""}
      </div>
      {o.salesman && (
        <div style={{ display: "inline-block", marginTop: 5, fontSize: 11, fontWeight: 700, color: T.primary, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 20, padding: "2px 9px" }}>
          {o.salesman}
        </div>
      )}

      <Stepper stage={o.stage} />

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700,
          color: o.stage >= 6 ? T.ok : T.primary,
        }}>
          <Icon size={15} /> {o.stageLabel}
        </span>
        <span style={{ fontSize: 12, color: T.muted }}>· {o.aging} hari</span>
        {o.scheduled && o.stage <= 4 && (
          <span style={{ fontSize: 12, color: T.muted }}>· 📅 {tglPendek(o.scheduled)}</span>
        )}
        {o.partial && o.partial.done < o.partial.tot && (
          <span style={{ fontSize: 12, color: T.warn, fontWeight: 600 }}>
            · sebagian {o.partial.done}/{o.partial.tot}
          </span>
        )}
      </div>

      {o.items && o.items.length > 0 && (() => {
        const kirim = o.items.filter((it) => it.terkirim >= it.qty).length;
        const siap = o.items.length - kirim;
        return (
          <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
            📦 {kirim} terkirim · {siap} disiapkan
          </div>
        );
      })()}

      {o.gagal ? (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, background: "#fef2f2", border: "1px solid #fecaca", color: T.danger, borderRadius: 9, padding: "6px 9px", fontSize: 12.5, fontWeight: 700 }}>
          <AlertTriangle size={14} style={{ flex: "0 0 auto" }} /> <span>Gagal kirim{o.gagalAlasan ? ` — ${o.gagalAlasan}` : ""}</span>
        </div>
      ) : o.belumReady ? (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, background: "#fffbeb", border: "1px solid #fde68a", color: T.warn, borderRadius: 9, padding: "6px 9px", fontSize: 12.5, fontWeight: 700 }}>
          <Package size={14} style={{ flex: "0 0 auto" }} /> <span>Barang belum ready</span>
        </div>
      ) : o.stok === "sebagian" ? (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, background: "#fffbeb", border: "1px solid #fde68a", color: T.warn, borderRadius: 9, padding: "6px 9px", fontSize: 12.5, fontWeight: 700 }}>
          <Package size={14} style={{ flex: "0 0 auto" }} /> <span>Sebagian barang ready</span>
        </div>
      ) : null}
    </button>
  );
}

/* ---------- Detail (timeline) ---------- */
function Detail({ o, onClose, onToast }) {
  const salin = async () => {
    const teks = pesanCustomer(o);
    try {
      await navigator.clipboard.writeText(teks);
      onToast("Pesan disalin — tinggal paste ke WhatsApp");
    } catch {
      onToast("Gagal menyalin. Salin manual: " + teks);
    }
  };
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(17,24,39,.35)", zIndex: 50,
      display: "flex", flexDirection: "column", justifyContent: "flex-end",
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: T.bg, borderRadius: "18px 18px 0 0", maxHeight: "88vh", overflowY: "auto",
        padding: "14px 16px 22px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: T.text }}>
            <ChevronLeft size={22} />
          </button>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{o.customer}</div>
            <div style={{ fontSize: 12, color: T.muted }}>{o.po}{o.ref ? ` · PO: ${o.ref}` : ""}</div>
            {o.salesman && <div style={{ fontSize: 12, color: T.primary, fontWeight: 700, marginTop: 1 }}>Sales: {o.salesman}</div>}
          </div>
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 10, background: T.surface,
          border: `1px solid ${T.border}`, borderRadius: 12, padding: "9px 12px", marginBottom: 14,
        }}>
          <Clock size={16} color={o.overdue ? T.danger : T.muted} />
          <span style={{ fontSize: 13, color: T.text }}>{o.aging} hari sejak PO</span>
          {o.overdue && (
            <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: T.danger }}>
              <AlertTriangle size={13} style={{ verticalAlign: -2 }} /> TELAT
            </span>
          )}
        </div>

        {o.gagal ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fef2f2", border: "1px solid #fecaca", color: T.danger, borderRadius: 12, padding: "10px 12px", marginBottom: 14, fontSize: 13, fontWeight: 700 }}>
            <AlertTriangle size={16} style={{ flex: "0 0 auto" }} /> <span>Pengiriman gagal{o.gagalAlasan ? ` — ${o.gagalAlasan}` : ""}. Akan dijadwalkan ulang.</span>
          </div>
        ) : o.belumReady ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fffbeb", border: "1px solid #fde68a", color: T.warn, borderRadius: 12, padding: "10px 12px", marginBottom: 14, fontSize: 13, fontWeight: 700 }}>
            <Package size={16} style={{ flex: "0 0 auto" }} /> <span>Barang belum ready — stok masih disiapkan / menunggu.</span>
          </div>
        ) : o.stok === "sebagian" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fffbeb", border: "1px solid #fde68a", color: T.warn, borderRadius: 12, padding: "10px 12px", marginBottom: 14, fontSize: 13, fontWeight: 700 }}>
            <Package size={16} style={{ flex: "0 0 auto" }} /> <span>Sebagian barang sudah ready, sisanya menunggu stok.</span>
          </div>
        ) : null}

        {/* Timeline vertikal */}
        <div style={{ position: "relative", paddingLeft: 6 }}>
          {STAGES.map((label, i) => {
            const n = i + 1;
            const done = n < o.stage, cur = n === o.stage;
            const col = done ? T.ok : cur ? T.primary : "#cfd6e0";
            const last = i === STAGES.length - 1;
            let sub = "";
            if (n === 3 && o.partial && o.partial.done < o.partial.tot && o.stage >= 3) sub = `Sebagian: ${o.partial.done} dari ${o.partial.tot} item`;
            if (n === 4 && o.scheduled) sub = `Rencana kirim: ${tglPanjang(o.scheduled)}`;
            return (
              <div key={i} style={{ display: "flex", gap: 12, minHeight: last ? 24 : 46 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{
                    width: 15, height: 15, borderRadius: "50%",
                    background: done || cur ? col : T.surface, border: `2px solid ${col}`,
                    display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto",
                  }}>
                    {done && <Check size={9} color="#fff" strokeWidth={4} />}
                  </div>
                  {!last && <div style={{ width: 2, flex: 1, background: n < o.stage ? T.ok : "#e4e8ee" }} />}
                </div>
                <div style={{ paddingBottom: 8 }}>
                  <div style={{
                    fontSize: 14, fontWeight: cur ? 800 : done ? 600 : 500,
                    color: cur ? T.primary : done ? T.text : T.muted,
                  }}>{label}</div>
                  {sub && <div style={{ fontSize: 12, color: T.muted, marginTop: 1 }}>{sub}</div>}
                </div>
              </div>
            );
          })}
        </div>

        {o.items && o.items.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.text, marginBottom: 8 }}>Rincian Barang</div>
            {o.items.map((it, i) => {
              const penuh = it.terkirim >= it.qty;
              const sebagian = it.terkirim > 0 && it.terkirim < it.qty;
              const stCol = penuh ? T.ok : sebagian ? T.warn : T.primary;
              const stLbl = penuh ? "Terkirim" : sebagian ? `Sebagian ${it.terkirim}/${it.qty}` : "Disiapkan";
              const StIco = penuh ? CheckCircle2 : sebagian ? Truck : Package;
              const bg = penuh ? "#f0fdf4" : sebagian ? "#fffbeb" : "#eff6ff";
              const bd = penuh ? "#bbf7d0" : sebagian ? "#fde68a" : "#bfdbfe";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 11px", marginBottom: 7 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.3 }}>{it.nama || "\u2014"}</div>
                    <div style={{ fontSize: 11.5, color: T.muted, marginTop: 1 }}>{it.qty}{it.sat ? " " + it.sat : ""}{it.terkirim > 0 && it.terkirim < it.qty ? ` \u00b7 terkirim ${it.terkirim}` : ""}</div>
                  </div>
                  <span style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: stCol, background: bg, border: `1px solid ${bd}`, borderRadius: 20, padding: "4px 9px" }}>
                    <StIco size={13} /> {stLbl}
                  </span>
                </div>
              );
            })}
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>
              Terkirim = sudah dikirim ke customer · Disiapkan = sedang diproses gudang
            </div>
          </div>
        )}

        <button onClick={salin} style={{
          width: "100%", marginTop: 16, background: T.primary, color: "#fff", border: "none",
          borderRadius: 12, padding: "13px 14px", fontSize: 14.5, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>
          <Copy size={17} /> Salin update untuk customer
        </button>
        <div style={{ fontSize: 11.5, color: T.muted, textAlign: "center", marginTop: 8, lineHeight: 1.4 }}>
          Pesan aman untuk dikirim ke customer — tidak memuat data internal.
        </div>
      </div>
    </div>
  );
}

/* ---------- App ---------- */
export default function SalesTracker() {
  const urlToken = (() => { try { return new URLSearchParams(window.location.search).get("k") || ""; } catch { return ""; } })();
  const [token, setToken] = useState(() => urlToken || localStorage.getItem("salestracker_k") || "");
  const [inp, setInp] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("semua");
  const [salesFilter, setSalesFilter] = useState("semua");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (urlToken) {
      localStorage.setItem("salestracker_k", urlToken);
      try { window.history.replaceState({}, "", window.location.pathname); } catch {}
    }
  }, [urlToken]);

  const showToast = useCallback((m) => { setToast(m); setTimeout(() => setToast(""), 2600); }, []);

  const load = useCallback(async (tk) => {
    if (!tk) return;
    setLoading(true); setErr("");
    try {
      const r = await fetch(`/api/sales?k=${encodeURIComponent(tk)}`);
      const j = await r.json();
      if (!r.ok || j.error) { setErr(j.error || "Gagal memuat."); setData(null); }
      else { setData(j); }
    } catch (e) { setErr("Tidak bisa terhubung ke server."); }
    setLoading(false);
  }, []);

  useEffect(() => { if (token) load(token); }, [token, load]);

  const masuk = () => {
    const t = inp.trim();
    if (!t) return;
    localStorage.setItem("salestracker_k", t);
    setToken(t);
  };
  const keluar = () => {
    localStorage.removeItem("salestracker_k");
    setToken(""); setData(null); setInp("");
  };

  const orders = data?.orders || [];
  const kpi = useMemo(() => ({
    aktif: orders.filter((o) => o.stage < 6).length,
    kendala: orders.filter((o) => o.gagal || o.belumReady).length,
    telat: orders.filter((o) => o.overdue).length,
    kirim: orders.filter((o) => o.stage === 5).length,
  }), [orders]);

  const salesmen = useMemo(() => {
    if (!data?.manager) return [];
    return [...new Set(orders.map((o) => o.salesman).filter(Boolean))].sort();
  }, [orders, data]);

  const terfilter = useMemo(() => {
    let list = orders;
    if (data?.manager && salesFilter !== "semua") list = list.filter((o) => o.salesman === salesFilter);
    if (filter === "telat") list = list.filter((o) => o.overdue);
    else if (filter === "gagal") list = list.filter((o) => o.gagal);
    else if (filter === "belum") list = list.filter((o) => o.belumReady);
    else if (filter === "proses") list = list.filter((o) => o.stage >= 2 && o.stage <= 3);
    else if (filter === "kirim") list = list.filter((o) => o.stage === 4 || o.stage === 5);
    else if (filter === "selesai") list = list.filter((o) => o.stage >= 6);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((o) => (o.customer + " " + o.po + " " + o.ref).toLowerCase().includes(s));
    }
    return [...list].sort((a, b) => (Number(!!b.gagal) - Number(!!a.gagal)) || (Number(!!b.belumReady) - Number(!!a.belumReady)) || (b.overdue - a.overdue) || (a.stage - b.stage) || (b.aging - a.aging));
  }, [orders, filter, q, salesFilter, data]);

  /* ---- Layar login ---- */
  if (!token) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: T.bg }}>
        <div style={{ width: "100%", maxWidth: 380, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, padding: 24 }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 30, letterSpacing: .5, color: T.text }}>
            SALES TRACKER
          </div>
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 20, marginTop: 2 }}>
            PT Kalingga Tataraya · pantau status pesanan Anda
          </div>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>Kode akses</label>
          <input
            value={inp} onChange={(e) => setInp(e.target.value)} onKeyDown={(e) => e.key === "Enter" && masuk()}
            placeholder="mis. pebri-9x2f"
            style={{ width: "100%", marginTop: 6, padding: "12px 13px", fontSize: 15, borderRadius: 11, border: `1px solid ${T.border}`, outline: "none", fontFamily: "inherit" }}
          />
          <button onClick={masuk} style={{
            width: "100%", marginTop: 14, background: T.primary, color: "#fff", border: "none",
            borderRadius: 11, padding: "12px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>Masuk</button>
          <div style={{ fontSize: 11.5, color: T.muted, marginTop: 14, lineHeight: 1.5 }}>
            Kode akses pribadi dikirim oleh admin. Anda hanya melihat pesanan milik Anda sendiri.
          </div>
          {err && <div style={{ color: T.danger, fontSize: 12.5, marginTop: 10 }}>{err}</div>}
        </div>
      </div>
    );
  }

  /* ---- Layar utama ---- */
  return (
    <div style={{ minHeight: "100vh", background: T.bg, maxWidth: 520, margin: "0 auto" }}>
      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20, background: T.surface, borderBottom: `1px solid ${T.border}`,
        padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 22, lineHeight: 1, letterSpacing: .5 }}>
            SALES TRACKER
          </div>
          <div style={{ fontSize: 12, color: T.muted }}>
            {data?.manager ? "Manajerial · semua sales" : data?.rep ? `Hai, ${data.rep}` : "Pesanan Saya"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => load(token)} title="Muat ulang" style={iconBtn}>
            <RefreshCw size={18} className={loading ? "spin" : ""} />
          </button>
          <button onClick={keluar} title="Keluar" style={iconBtn}><LogOut size={18} /></button>
        </div>
      </div>

      <div style={{ padding: "14px 16px 40px" }}>
        {err && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: T.danger, borderRadius: 12, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>
            {err}
          </div>
        )}

        {/* KPI */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
          {[
            { n: kpi.aktif, l: "Aktif", c: T.text },
            { n: kpi.kendala, l: "Kendala", c: kpi.kendala ? T.danger : T.muted },
            { n: kpi.telat, l: "Telat", c: kpi.telat ? T.danger : T.muted },
            { n: kpi.kirim, l: "Dikirim", c: T.primary },
          ].map((k, i) => (
            <div key={i} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 6px", textAlign: "center" }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 26, lineHeight: 1, color: k.c }}>{k.n}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{k.l}</div>
            </div>
          ))}
        </div>

        {/* Filter sales (manajerial) */}
        {data?.manager && salesmen.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <select value={salesFilter} onChange={(e) => setSalesFilter(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 11, border: `1px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", fontFamily: "inherit", fontWeight: 600 }}>
              <option value="semua">Semua sales ({orders.length})</option>
              {salesmen.map((sm) => <option key={sm} value={sm}>{sm}</option>)}
            </select>
          </div>
        )}

        {/* Cari */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <Search size={16} color={T.muted} style={{ position: "absolute", left: 11, top: 11 }} />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari customer / no. PO"
            style={{ width: "100%", padding: "9px 12px 9px 34px", fontSize: 14, borderRadius: 11, border: `1px solid ${T.border}`, outline: "none", background: T.surface, fontFamily: "inherit" }}
          />
        </div>

        {/* Filter */}
        <div style={{ display: "flex", gap: 7, marginBottom: 14, overflowX: "auto", paddingBottom: 2 }}>
          {[["semua", "Semua"], ["gagal", "Gagal"], ["belum", "Belum ready"], ["telat", "Telat"], ["proses", "Proses"], ["kirim", "Dikirim"], ["selesai", "Selesai"]].map(([id, l]) => (
            <button key={id} onClick={() => setFilter(id)} style={{
              flex: "0 0 auto", padding: "7px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${filter === id ? T.primary : T.border}`,
              background: filter === id ? T.primary : T.surface,
              color: filter === id ? "#fff" : T.muted, fontFamily: "inherit",
            }}>{l}</button>
          ))}
        </div>

        {/* List */}
        {loading && !data && <div style={{ textAlign: "center", color: T.muted, padding: 30 }}>Memuat…</div>}
        {data && terfilter.length === 0 && (
          <div style={{ textAlign: "center", color: T.muted, padding: 30, fontSize: 14 }}>
            Tidak ada pesanan pada filter ini.
          </div>
        )}
        {terfilter.map((o) => <OrderCard key={o.po} o={o} onOpen={setDetail} />)}
      </div>

      {detail && <Detail o={detail} onClose={() => setDetail(null)} onToast={showToast} />}

      {toast && (
        <div style={{
          position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 60,
          background: T.text, color: "#fff", padding: "10px 16px", borderRadius: 24, fontSize: 13.5,
          maxWidth: "90%", textAlign: "center", boxShadow: "0 4px 14px rgba(0,0,0,.2)",
        }}>{toast}</div>
      )}

      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const iconBtn = {
  width: 38, height: 38, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface,
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: T.text,
};
