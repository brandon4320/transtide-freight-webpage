"use client"

import { useState, useRef } from "react"
import { Calculator, ChevronDown, ChevronUp, Info } from "lucide-react"

// ─── Types ───────────────────────────────────────────────────────────────────
interface Toggles {
  iva: boolean
  iva2: boolean
  gan: boolean
  iibb: boolean
}

interface Results {
  // prorrateados
  fl_r: number; de_r: number; na_r: number; lo_r: number; term_r: number; term_c: number
  ratio: number
  // seguro
  seg_c: number; seg_r: number
  // CIF
  cif_c: number; cif_r: number
  // aranceles
  di_c: number; di_r: number; te_c: number; te_r: number
  biva_c: number; biva_r: number
  iva_c: number; iva_r: number; iva2_c: number; iva2_r: number
  gan_c: number; gan_r: number; iibb_c: number; iibb_r: number
  aranc_c: number; aranc_r: number; aranc_solo_r: number
  // gastos locales
  gl_c: number; gl_r: number
  // totales
  base_c: number; base_r: number
  totsin_c: number; totsin_r: number
  // escenarios
  p_cf: number; p_sf: number; hon_cf: number; fact_cf: number; hon_sf: number
  // iva análisis
  iva_cob: number; iva_pag: number; iva_dif: number
  // rentabilidad
  rn_fob: number; rn_ah: number; rn_fl: number; rn_ar: number; rn_gl: number; rn_ho: number; gan_tot: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (v: number) =>
  v === 0 ? "—" : "$" + Math.round(v).toLocaleString("es-AR")

const fmtPct = (v: number) => (v * 100).toFixed(1) + "%"

const rpct = (v: number, base: number) =>
  base > 0 ? ` (${((v / base) * 100).toFixed(1)}%)` : ""

function MargenCell({ val }: { val: number }) {
  if (val === 0) return <span className="text-gray-400">—</span>
  return (
    <span className={val > 0 ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
      {fmt(val)}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Cotizador() {
  // Refs para detectar si el user tocó los cobros
  const touched = useRef<Record<string, boolean>>({})

  // ── State ─────────────────────────────────────────────────────────────────
  const [cont, setCont] = useState<"40" | "20">("40")
  const [m3, setM3] = useState("")
  const [nombre, setNombre] = useState("")

  // Referencia contenedor completo
  const [refFlete, setRefFlete] = useState("")
  const [refDesp, setRefDesp] = useState("")
  const [refTerm, setRefTerm] = useState("")
  const [refNav, setRefNav] = useState("")
  const [refLog, setRefLog] = useState("")

  // Cobro al cliente (gastos)
  const [cliFlete, setCliFlete] = useState("")
  const [cliDesp, setCliDesp] = useState("")
  const [cliTerm, setCliTerm] = useState("")
  const [cliNav, setCliNav] = useState("")
  const [cliLog, setCliLog] = useState("")

  // FOB
  const [fobCli, setFobCli] = useState("")
  const [fobCliDec, setFobCliDec] = useState("")
  const [fobReal, setFobReal] = useState("")
  const [fobDec, setFobDec] = useState("")

  // Seguro y aranceles
  const [segPct, setSegPct] = useState("1")
  const [diPct, setDiPct] = useState("16")
  const [tePct, setTePct] = useState("3")
  const [ivaPct, setIvaPct] = useState("21")
  const [iva2Pct, setIva2Pct] = useState("0")
  const [ganPct, setGanPct] = useState("6")
  const [iibbPct, setIibbPct] = useState("2.5")
  const [toggles, setToggles] = useState<Toggles>({ iva: true, iva2: true, gan: true, iibb: true })

  // Honorarios
  const [honPct, setHonPct] = useState("4")
  const [factPct, setFactPct] = useState("8")

  // UI
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [historial, setHistorial] = useState<Array<{ nombre: string; cf: string; sf: string; gan: string; fecha: string }>>([])

  // ── Compute ───────────────────────────────────────────────────────────────
  const n = (v: string) => parseFloat(v) || 0

  const m3_cont = cont === "40" ? 60 : 30
  const ratio = m3_cont > 0 && n(m3) > 0 ? n(m3) / m3_cont : 0

  const fl_r = n(refFlete) * ratio
  const de_r = n(refDesp) * ratio
  const term_r = n(refTerm) * ratio
  const na_r = n(refNav) * ratio
  const lo_r = n(refLog) * ratio

  // Auto-fill cobro cliente si no fue tocado
  const autofill = (setter: (v: string) => void, key: string, val: number) => {
    if (!touched.current[key] && ratio > 0) setter(String(Math.round(val)))
  }
  if (ratio > 0) {
    autofill(setCliFlete, "cliFlete", fl_r)
    autofill(setCliDesp, "cliDesp", de_r)
    autofill(setCliTerm, "cliTerm", term_r)
    autofill(setCliNav, "cliNav", na_r)
    autofill(setCliLog, "cliLog", lo_r)
  }

  const fl_c = n(cliFlete), de_c = n(cliDesp), term_c = n(cliTerm), na_c = n(cliNav), lo_c = n(cliLog)
  const fob_cli = n(fobCli)
  const fob_real = n(fobReal) || fob_cli
  const fob_dec = n(fobDec) || fob_real
  const fob_cli_dec = fobCliDec === "" ? fob_cli : (n(fobCliDec) || fob_cli)

  const seg_pct = n(segPct) / 100
  const seg_c = seg_pct * fob_cli_dec
  const seg_r = seg_pct * fob_dec

  const cif_c = fob_cli_dec + fl_c + seg_c
  const cif_r = fob_dec + fl_r + seg_r

  const di_pct = n(diPct) / 100, te_pct = n(tePct) / 100
  const iva_pct = n(ivaPct) / 100, iva2_pct = n(iva2Pct) / 100
  const gan_pct = n(ganPct) / 100, iibb_pct = n(iibbPct) / 100

  const di_c = di_pct * cif_c, di_r = di_pct * cif_r
  const te_c = te_pct * cif_c, te_r = te_pct * cif_r
  const biva_c = cif_c + di_c + te_c, biva_r = cif_r + di_r + te_r

  const iva_c = iva_pct * biva_c
  const iva_r = toggles.iva ? iva_pct * biva_r : 0
  const iva2_c = iva2_pct * biva_c
  const iva2_r = toggles.iva2 ? iva2_pct * biva_r : 0
  const gan_c = gan_pct * biva_c
  const gan_r = toggles.gan ? gan_pct * biva_r : 0
  const iibb_c = iibb_pct * biva_c
  const iibb_r = toggles.iibb ? iibb_pct * biva_r : 0

  const aranc_c = fl_c + seg_c + di_c + te_c + iva_c + iva2_c + gan_c + iibb_c
  const aranc_solo_r = di_r + te_r + iva_r + iva2_r + gan_r + iibb_r
  const aranc_r = fl_r + seg_r + aranc_solo_r

  const gl_c = de_c + term_c + na_c + lo_c
  const gl_r = de_r + term_r + na_r + lo_r

  const base_c = fob_cli + aranc_c + gl_c
  const base_r = fob_real + fl_r + seg_r + aranc_solo_r + gl_r
  const totsin_c = fob_cli + fl_c + seg_c + di_c + te_c + gan_c + iibb_c + gl_c
  const totsin_r = fob_real + fl_r + seg_r + di_r + te_r + gan_r + iibb_r + gl_r

  // Escenarios — sin circular: precio = base / (1 - hon% - fact%)
  const h = n(honPct) / 100, f = n(factPct) / 100
  const denom_cf = 1 - h - f, denom_sf = 1 - h
  const p_cf = denom_cf > 0 ? base_c / denom_cf : base_c
  const p_sf = denom_sf > 0 ? base_c / denom_sf : base_c
  const hon_cf = p_cf * h, fact_cf = p_cf * f, hon_sf = p_sf * h

  // IVA — dinámico usando el % ingresado
  const iva_cob = iva_pct > 0 ? base_c / (1 + iva_pct) * iva_pct : 0
  const iva_pag = iva_r
  const iva_dif = iva_cob - iva_pag

  // Rentabilidad
  const rfob = fob_real || 1
  const rn_fob = fob_cli - fob_real
  const rn_ah = fob_dec < fob_real ? (fob_real - fob_dec) * (di_pct + te_pct) : 0
  const rn_fl = fl_c - fl_r
  const aranc_cli_solo = di_c + te_c + iva_c + iva2_c + gan_c + iibb_c
  const rn_ar = aranc_cli_solo - aranc_solo_r
  const rn_gl = gl_c - gl_r
  const rn_ho = hon_cf
  const gan_tot = rn_fob + rn_ah + rn_fl + rn_ar + rn_gl + rn_ho

  const hasResult = fob_cli > 0

  // ── Handlers ──────────────────────────────────────────────────────────────
  const markTouched = (key: string, setter: (v: string) => void) => (val: string) => {
    touched.current[key] = true
    setter(val)
  }

  const guardar = () => {
    if (!fob_cli) return
    setHistorial(prev => [{
      nombre: nombre || "Sin nombre",
      cf: fmt(p_cf),
      sf: fmt(p_sf),
      gan: fmt(gan_tot),
      fecha: new Date().toLocaleDateString("es-AR"),
    }, ...prev])
  }

  // ── Toggle helper ─────────────────────────────────────────────────────────
  const Toggle = ({ label, id }: { label: string; id: keyof Toggles }) => (
    <button
      type="button"
      onClick={() => setToggles(t => ({ ...t, [id]: !t[id] }))}
      className={`text-xs px-2 py-1 rounded-full border font-medium transition-all duration-200 ${
        toggles[id]
          ? "bg-primary-800 text-white border-primary-800"
          : "bg-white text-gray-400 border-gray-300"
      }`}
    >
      {toggles[id] ? "Lo pago" : "No pago"}
    </button>
  )

  // ── Input helpers ─────────────────────────────────────────────────────────
  const Field = ({
    label, value, onChange, placeholder = "0", optional = false, hint = "",
    type = "number", step = "any",
  }: {
    label: string; value: string; onChange: (v: string) => void
    placeholder?: string; optional?: boolean; hint?: string
    type?: string; step?: string
  }) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
        {label}
        {optional && <span className="ml-1 text-[10px] normal-case font-normal text-primary-500 bg-primary-50 px-1.5 py-0.5 rounded-full">opcional</span>}
      </label>
      <input
        type={type}
        step={step}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all ${
          optional ? "border-dashed border-gray-300" : "border-gray-200"
        }`}
      />
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
    </div>
  )

  const AranField = ({
    label, value, onChange, togId,
  }: {
    label: string; value: string; onChange: (v: string) => void; togId: keyof Toggles
  }) => (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</label>
        <Toggle label={label} id={togId} />
      </div>
      <input
        type="number"
        step="any"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
      />
    </div>
  )

  // ── Step header ───────────────────────────────────────────────────────────
  const Step = ({ n, label }: { n: number; label: string }) => (
    <div className="flex items-center gap-3 mb-3">
      <div className="w-6 h-6 rounded-full bg-primary-800 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
        {n}
      </div>
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{label}</span>
    </div>
  )

  const SectionBox = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
    <div className={`bg-white rounded-2xl border border-gray-100 p-5 shadow-sm ${className}`}>
      {children}
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <section id="cotizador" className="w-full py-16 md:py-20 bg-gray-50">
      <div className="container px-4 md:px-6 max-w-5xl mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-primary-800/10 text-primary-800 text-xs font-semibold px-4 py-2 rounded-full mb-4">
            <Calculator className="w-3.5 h-3.5" />
            HERRAMIENTA INTERNA
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-primary-900 mb-3">
            Cotizador de Importación
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto text-sm">
            Calculá el costo real y el precio al cliente en segundos. Todos los valores en USD.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">

          {/* ── Columna izquierda: inputs ─────────────────────────────────── */}
          <div className="flex flex-col gap-5">

            {/* PASO 1 — Referencia */}
            <SectionBox>
              <Step n={1} label="Costos de referencia — contenedor completo" />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                <Field label="Flete marítimo" value={refFlete} onChange={setRefFlete} />
                <Field label="Despachante" value={refDesp} onChange={setRefDesp} />
                <Field label="Terminal" value={refTerm} onChange={setRefTerm} />
                <Field label="Naviera" value={refNav} onChange={setRefNav} />
                <Field label="Logística interna" value={refLog} onChange={setRefLog} />
              </div>
            </SectionBox>

            {/* PASO 2 — Embarque */}
            <SectionBox>
              <Step n={2} label="Datos del embarque" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Nombre / cliente" value={nombre} onChange={setNombre} placeholder="Ej: XCMG Hidro 33T" type="text" />
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Contenedor</label>
                  <select
                    value={cont}
                    onChange={e => setCont(e.target.value as "40" | "20")}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="40">40 pies (60 m³)</option>
                    <option value="20">20 pies (30 m³)</option>
                  </select>
                </div>
                <Field label="M³ de la mercadería" value={m3} onChange={setM3} placeholder="0" step="0.5" />
              </div>
              {ratio > 0 && (
                <div className="mt-3 text-xs text-primary-700 bg-primary-50 rounded-lg px-3 py-2">
                  M³ {n(m3)} / {m3_cont} → <strong>{(ratio * 100).toFixed(1)}%</strong> del contenedor
                </div>
              )}
            </SectionBox>

            {/* PASO 3 — Costo real calculado */}
            {ratio > 0 && (
              <div className="bg-primary-900 rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-6 h-6 rounded-full bg-white/20 text-white text-xs font-bold flex items-center justify-center">3</div>
                  <span className="text-xs font-semibold text-white/70 uppercase tracking-widest">Tu costo real prorrateado</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    ["Flete", fl_r], ["Despachante", de_r], ["Terminal", term_r],
                    ["Naviera", na_r], ["Logística", lo_r],
                  ].map(([label, val]) => (
                    <div key={label as string} className="bg-white/10 rounded-xl p-3">
                      <p className="text-[10px] text-white/60 uppercase tracking-wider mb-1">{label as string}</p>
                      <p className="text-white font-semibold text-sm">{fmt(val as number)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PASO 4 — Cobro al cliente */}
            <SectionBox className="border-blue-100 bg-blue-50/30">
              <Step n={4} label="Lo que cobrás al cliente — flete y gastos locales" />
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  ["Flete", cliFlete, markTouched("cliFlete", setCliFlete), fl_r],
                  ["Despachante", cliDesp, markTouched("cliDesp", setCliDesp), de_r],
                  ["Terminal", cliTerm, markTouched("cliTerm", setCliTerm), term_r],
                  ["Naviera", cliNav, markTouched("cliNav", setCliNav), na_r],
                  ["Logística", cliLog, markTouched("cliLog", setCliLog), lo_r],
                ].map(([label, val, setter, costo]) => (
                  <div key={label as string} className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-blue-600 uppercase tracking-wider">{label as string}</label>
                    <input
                      type="number"
                      value={val as string}
                      onChange={e => (setter as (v: string) => void)(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    {ratio > 0 && (
                      <p className="text-[10px] text-gray-400">costo: {fmt(costo as number)}</p>
                    )}
                  </div>
                ))}
              </div>
            </SectionBox>

            {/* PASO 5 — FOB */}
            <SectionBox>
              <Step n={5} label="FOB" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-3 pb-2 border-b border-blue-100">Lado cliente</p>
                  <div className="flex flex-col gap-3">
                    <Field label="FOB facturado al cliente" value={fobCli} onChange={setFobCli} />
                    <Field
                      label="FOB subfacturado al cliente en aduana"
                      value={fobCliDec}
                      onChange={setFobCliDec}
                      optional
                      hint="Si lo completás, los aranceles al cliente se calculan sobre este valor menor"
                    />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-green-700 uppercase tracking-widest mb-3 pb-2 border-b border-green-100">Lado real (interno)</p>
                  <div className="flex flex-col gap-3">
                    <Field label="FOB real — lo que pagaste" value={fobReal} onChange={setFobReal} placeholder="= FOB cliente si igual" />
                    <Field label="FOB declarado en aduana" value={fobDec} onChange={setFobDec} placeholder="= FOB real si no subfacturás" />
                  </div>
                </div>
              </div>
            </SectionBox>

            {/* PASO 6 — Seguro y aranceles */}
            <SectionBox>
              <Step n={6} label="Seguro y aranceles" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                <Field label="% Seguro" value={segPct} onChange={setSegPct} step="0.1" />
                <Field label="% DI (Derechos import.)" value={diPct} onChange={setDiPct} step="0.5" />
                <Field label="% Tasa estadística" value={tePct} onChange={setTePct} step="0.5" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <AranField label="% IVA" value={ivaPct} onChange={setIvaPct} togId="iva" />
                <AranField label="% IVA adicional" value={iva2Pct} onChange={setIva2Pct} togId="iva2" />
                <AranField label="% Perc. Ganancias" value={ganPct} onChange={setGanPct} togId="gan" />
                <AranField label="% Perc. IIBB" value={iibbPct} onChange={setIibbPct} togId="iibb" />
              </div>
            </SectionBox>

            {/* PASO 7 — Honorarios */}
            <SectionBox>
              <Step n={7} label="Honorarios y facturación" />
              <div className="grid grid-cols-2 gap-3 mb-2">
                <Field label="% Honorarios" value={honPct} onChange={setHonPct} step="0.5" />
                <Field label="% Gastos de facturación (solo con factura)" value={factPct} onChange={setFactPct} step="0.5" />
              </div>
              <p className="text-[10px] text-gray-400">Se calculan sobre el precio final total: precio = base ÷ (1 − hon% − fact%)</p>
            </SectionBox>

          </div>

          {/* ── Columna derecha: resultado ────────────────────────────────── */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">

            {/* Precios finales */}
            <div className="bg-primary-900 rounded-2xl p-5 text-white">
              <p className="text-xs text-white/60 uppercase tracking-widest mb-4">Precio final al cliente</p>
              <div className="space-y-3">
                <div className="bg-white/10 rounded-xl p-4">
                  <p className="text-[10px] text-white/60 mb-1">✅ Con factura</p>
                  <p className="text-2xl font-bold">{hasResult ? fmt(p_cf) : "—"}</p>
                  {hasResult && (
                    <div className="mt-2 text-xs text-white/60 space-y-0.5">
                      <p>Base: {fmt(base_c)}</p>
                      <p>+ Honorarios ({n(honPct)}%): {fmt(hon_cf)}</p>
                      <p>+ Gs. facturación ({n(factPct)}%): {fmt(fact_cf)}</p>
                    </div>
                  )}
                </div>
                <div className="bg-white/10 rounded-xl p-4">
                  <p className="text-[10px] text-white/60 mb-1">🚫 Sin factura</p>
                  <p className="text-2xl font-bold">{hasResult ? fmt(p_sf) : "—"}</p>
                  {hasResult && (
                    <div className="mt-2 text-xs text-white/60 space-y-0.5">
                      <p>Base: {fmt(base_c)}</p>
                      <p>+ Honorarios ({n(honPct)}%): {fmt(hon_sf)}</p>
                    </div>
                  )}
                </div>
                {hasResult && (
                  <div className="bg-accent/20 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-white/70">Ahorro cliente sin factura</p>
                    <p className="text-accent-300 font-bold text-lg">{fmt(Math.abs(p_cf - p_sf))}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Ganancia */}
            <div className="bg-emerald-800 rounded-2xl p-5 text-white">
              <p className="text-xs text-white/60 uppercase tracking-widest mb-2">Tu ganancia total</p>
              <p className="text-3xl font-bold">{hasResult ? fmt(gan_tot) : "—"}</p>
              {hasResult && fob_real > 0 && (
                <p className="text-sm text-white/60 mt-1">{((gan_tot / fob_real) * 100).toFixed(1)}% sobre FOB real</p>
              )}
            </div>

            {/* Análisis IVA */}
            {hasResult && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Análisis IVA</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Cobrado al cliente (implícito)</span>
                    <span className="font-medium">{fmt(iva_cob)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pagado en aduana</span>
                    <span className="font-medium">{fmt(iva_pag)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="font-semibold">Diferencia a tu favor</span>
                    <span className={`font-bold ${iva_dif >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmt(iva_dif)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Costo sin IVA */}
            {hasResult && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Costo sin IVA</p>
                  <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">IVA recuperable</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tu costo real</span>
                    <span className="font-medium">{fmt(totsin_r)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Cobro al cliente</span>
                    <span className="font-medium">{fmt(totsin_c)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Guardar */}
            <button
              onClick={guardar}
              disabled={!hasResult}
              className="w-full py-3 bg-accent hover:bg-accent-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors text-sm"
            >
              Guardar cotización
            </button>

            {/* Historial */}
            {historial.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Historial</p>
                <div className="space-y-2">
                  {historial.map((h, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-3">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-sm font-medium text-gray-800 truncate">{h.nombre}</span>
                        <span className="text-[10px] text-gray-400 ml-2 flex-shrink-0">{h.fecha}</span>
                      </div>
                      <div className="flex gap-3 text-xs text-gray-500">
                        <span>c/f: <b className="text-gray-700">{h.cf}</b></span>
                        <span>s/f: <b className="text-gray-700">{h.sf}</b></span>
                        <span>gan: <b className="text-emerald-600">{h.gan}</b></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Desglose completo */}
        {hasResult && (
          <div className="mt-6">
            <button
              onClick={() => setShowBreakdown(b => !b)}
              className="flex items-center gap-2 text-sm font-medium text-primary-700 hover:text-primary-900 transition-colors mb-4"
            >
              {showBreakdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showBreakdown ? "Ocultar" : "Ver"} desglose completo
            </button>

            {showBreakdown && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[35%]">Concepto</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">%</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Mi costo real</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Cobro cliente</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Margen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {[
                      ["FOB", null, fob_real, fob_cli, fob_cli - fob_real],
                      ["Flete marítimo", fmtPct(ratio), fl_r, fl_c, fl_c - fl_r],
                      ["Seguro", fmtPct(seg_pct), seg_r, seg_c, seg_c - seg_r],
                    ].map(([label, p, r, c, m]) => (
                      <tr key={label as string} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 text-gray-600">{label as string}</td>
                        <td className="px-4 py-2.5 text-right text-gray-400 text-xs">{p as string || "—"}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700">{fmt(r as number)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700">{fmt(c as number)}</td>
                        <td className="px-4 py-2.5 text-right"><MargenCell val={m as number} /></td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-4 py-2.5 text-gray-700">CIF</td>
                      <td className="px-4 py-2.5 text-right text-gray-400 text-xs">—</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmt(cif_r)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmt(cif_c)}</td>
                      <td className="px-4 py-2.5 text-right">—</td>
                    </tr>
                    {[
                      ["Derechos de importación", fmtPct(di_pct), di_r, di_c, di_c - di_r],
                      ["Tasa estadística", fmtPct(te_pct), te_r, te_c, te_c - te_r],
                    ].map(([label, p, r, c, m]) => (
                      <tr key={label as string} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 text-gray-600">{label as string}</td>
                        <td className="px-4 py-2.5 text-right text-gray-400 text-xs">{p as string}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700">{fmt(r as number)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700">{fmt(c as number)}</td>
                        <td className="px-4 py-2.5 text-right"><MargenCell val={m as number} /></td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-4 py-2.5 text-gray-700">Base imponible IVA</td>
                      <td className="px-4 py-2.5 text-right">—</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmt(biva_r)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmt(biva_c)}</td>
                      <td className="px-4 py-2.5 text-right">—</td>
                    </tr>
                    {[
                      [`IVA ${toggles.iva ? "" : "(no pago)"}`, fmtPct(iva_pct), iva_r, iva_c, iva_c - iva_r],
                      [`IVA adicional ${toggles.iva2 ? "" : "(no pago)"}`, fmtPct(iva2_pct), iva2_r, iva2_c, iva2_c - iva2_r],
                      [`Perc. Ganancias ${toggles.gan ? "" : "(no pago)"}`, fmtPct(gan_pct), gan_r, gan_c, gan_c - gan_r],
                      [`Perc. IIBB ${toggles.iibb ? "" : "(no pago)"}`, fmtPct(iibb_pct), iibb_r, iibb_c, iibb_c - iibb_r],
                    ].map(([label, p, r, c, m]) => (
                      <tr key={label as string} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 text-gray-600">{label as string}</td>
                        <td className="px-4 py-2.5 text-right text-gray-400 text-xs">{p as string}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700">{fmt(r as number)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700">{fmt(c as number)}</td>
                        <td className="px-4 py-2.5 text-right"><MargenCell val={m as number} /></td>
                      </tr>
                    ))}
                    <tr className="bg-primary-50 font-semibold">
                      <td className="px-4 py-2.5 text-primary-800">Total arancelario + flete</td>
                      <td className="px-4 py-2.5 text-right">—</td>
                      <td className="px-4 py-2.5 text-right font-mono text-primary-800">{fmt(aranc_r)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-primary-800">{fmt(aranc_c)}</td>
                      <td className="px-4 py-2.5 text-right"><MargenCell val={aranc_c - aranc_r} /></td>
                    </tr>
                    {[
                      ["Despachante", null, de_r, de_c, de_c - de_r],
                      ["Terminal", null, term_r, term_c, term_c - term_r],
                      ["Naviera", null, na_r, na_c, na_c - na_r],
                      ["Logística interna", null, lo_r, lo_c, lo_c - lo_r],
                    ].map(([label, p, r, c, m]) => (
                      <tr key={label as string} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 text-gray-600">{label as string}</td>
                        <td className="px-4 py-2.5 text-right text-gray-400 text-xs">—</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700">{fmt(r as number)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700">{fmt(c as number)}</td>
                        <td className="px-4 py-2.5 text-right"><MargenCell val={m as number} /></td>
                      </tr>
                    ))}
                    <tr className="bg-gray-800 font-bold text-white">
                      <td className="px-4 py-3">COSTO TOTAL CON IVA</td>
                      <td className="px-4 py-3 text-right">—</td>
                      <td className="px-4 py-3 text-right font-mono">{fmt(base_r)}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmt(base_c)}</td>
                      <td className="px-4 py-3 text-right"><span className={base_c - base_r >= 0 ? "text-emerald-400" : "text-red-400"}>{fmt(base_c - base_r)}</span></td>
                    </tr>
                  </tbody>
                </table>

                {/* Rentabilidad */}
                <div className="p-5 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Rentabilidad (% sobre FOB real)</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      ["Margen FOB", rn_fob],
                      ["Ahorro aranceles (subfact.)", rn_ah],
                      ["Margen flete", rn_fl],
                      ["Margen aranceles", rn_ar],
                      ["Margen gastos locales", rn_gl],
                      ["Honorarios", rn_ho],
                    ].map(([label, val]) => (
                      <div key={label as string} className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label as string}</p>
                        <p className={`font-semibold text-sm ${(val as number) >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                          {fmt(val as number)}
                          <span className="text-xs font-normal text-gray-400">{rpct(val as number, rfob)}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex justify-between items-center">
                    <span className="font-semibold text-emerald-800">GANANCIA TOTAL</span>
                    <span className="text-xl font-bold text-emerald-700">
                      {fmt(gan_tot)} <span className="text-sm font-normal">{rpct(gan_tot, rfob)}</span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
