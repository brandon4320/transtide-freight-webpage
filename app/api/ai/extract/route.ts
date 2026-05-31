import { NextResponse } from 'next/server'
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import { auth } from '@/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

// Gemini's responseSchema does not support nullable via array of types.
// Use `nullable: true` per field instead.
const schema: any = {
  type: SchemaType.OBJECT,
  properties: {
    documento_tipo: {
      type: SchemaType.STRING,
      enum: ['proforma', 'packing_list', 'invoice', 'other'],
    },
    proveedor: { type: SchemaType.STRING, nullable: true },
    proveedor_pais: { type: SchemaType.STRING, nullable: true },
    numero: { type: SchemaType.STRING, nullable: true },
    fecha: { type: SchemaType.STRING, nullable: true },
    terminos: { type: SchemaType.STRING, nullable: true },
    moneda: { type: SchemaType.STRING, nullable: true },
    total_m3: { type: SchemaType.NUMBER, nullable: true },
    total_kg: { type: SchemaType.NUMBER, nullable: true },
    total_bultos: { type: SchemaType.NUMBER, nullable: true },
    total_fob: { type: SchemaType.NUMBER, nullable: true },
    items: {
      type: SchemaType.ARRAY,
      nullable: true,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          descripcion: { type: SchemaType.STRING },
          cantidad: { type: SchemaType.NUMBER, nullable: true },
          precio_unitario: { type: SchemaType.NUMBER, nullable: true },
          subtotal: { type: SchemaType.NUMBER, nullable: true },
          ncm: { type: SchemaType.STRING, nullable: true },
        },
        required: ['descripcion'],
      },
    },
    notas: { type: SchemaType.STRING, nullable: true },
  },
  required: ['documento_tipo'],
}

const PROMPT_SINGLE = `Extraé información estructurada de este documento de comercio exterior (puede ser una proforma invoice, packing list, commercial invoice, o similar).

Devolvé un JSON que cumpla exactamente con el schema indicado.

Notas importantes:
- Si el documento muestra dimensiones (L×W×H cm) por bulto, calculá el m³ total: (L*W*H)/1000000 * cantidad_bultos.
- Si solo tenés peso volumétrico, devolvelo en m³ aplicando 167 kg/m³.
- "total_kg" es el peso BRUTO (gross weight). Si solo está el neto, usalo igual.
- "total_fob" debe ser el valor monetario del documento. Si hay descuentos, usá el total después de descuentos.
- Si un campo no se puede determinar con certeza razonable, devolvé null en vez de inventar.
- Para "items", incluí hasta 20 líneas. Si hay más, agregá una nota.
- "notas" puede contener observaciones como "Incluye flete CIF $X", "Pago 50% anticipo", etc.

Devolvé SOLO el JSON, sin texto adicional.`

const PROMPT_DUAL = `Te paso DOS documentos de comercio exterior del mismo embarque:
1. Una FACTURA / PROFORMA INVOICE (con los precios y términos comerciales)
2. Un PACKING LIST (con dimensiones, peso y cantidad de bultos)

Extraé un ÚNICO JSON estructurado combinando la información de ambos:
- De la factura: proveedor, número, fecha, términos, moneda, total_fob, items con precios, NCM.
- Del packing list: total_m3, total_kg, total_bultos, dimensiones.
- Si hay datos contradictorios entre los dos, priorizá la factura para precios y el packing list para medidas/peso.
- Si solo un dato aparece en uno de los dos, usalo igual.

Notas importantes:
- Si el packing list muestra dimensiones (L×W×H cm) por bulto, calculá el m³ total: (L*W*H)/1000000 * cantidad_bultos.
- Si solo tenés peso volumétrico, devolvelo en m³ aplicando 167 kg/m³.
- "total_kg" es el peso BRUTO (gross weight). Si solo está el neto, usalo igual.
- "total_fob" debe ser el valor monetario de la factura. Si hay descuentos, usá el total después de descuentos.
- Si un campo no se puede determinar con certeza razonable, devolvé null en vez de inventar.
- Para "items", combiná descripciones de la factura con cantidades/bultos del packing list cuando aplique. Hasta 20 líneas.
- "documento_tipo" devolvé "invoice" porque hay factura + packing.
- "notas" puede mencionar discrepancias entre los dos documentos si las hay.

Devolvé SOLO el JSON, sin texto adicional.`

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid form data' }, { status: 400 })
  }

  // Soportamos uploads single ("file") o dual ("factura" + "packing").
  // Al menos uno debe existir.
  const fileSingle  = formData.get('file')    as File | null
  const fileFactura = formData.get('factura') as File | null
  const filePacking = formData.get('packing') as File | null

  const filesRaw: { label: string, f: File }[] = []
  if (fileFactura) filesRaw.push({ label: 'FACTURA / PROFORMA', f: fileFactura })
  if (filePacking) filesRaw.push({ label: 'PACKING LIST',       f: filePacking })
  if (filesRaw.length === 0 && fileSingle) filesRaw.push({ label: 'DOCUMENTO', f: fileSingle })

  if (filesRaw.length === 0) {
    return NextResponse.json({ error: 'no file' }, { status: 400 })
  }

  const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp']
  const fileParts: { inlineData: { data: string, mimeType: string }, label: string }[] = []
  for (const { f, label } of filesRaw) {
    if (f.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: `archivo "${label}" supera 10MB` }, { status: 400 })
    }
    const mt = f.type || 'application/pdf'
    if (!allowed.includes(mt)) {
      return NextResponse.json({ error: `tipo no soportado en "${label}": ${mt}` }, { status: 400 })
    }
    const buf = await f.arrayBuffer()
    fileParts.push({ inlineData: { data: Buffer.from(buf).toString('base64'), mimeType: mt }, label })
  }

  const isDual = fileParts.length === 2
  const PROMPT = isDual ? PROMPT_DUAL : PROMPT_SINGLE

  // Lista de modelos en orden de preferencia. Si uno está sobrecargado (503)
  // o sin cuota (429), pasamos al siguiente.
  const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-1.5-flash']
  const genConfig = {
    responseMimeType: 'application/json',
    responseSchema: schema,
    temperature: 0.1,
  }

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
  const isRetryable = (err: any) => {
    const msg = String(err?.message || '')
    return /\b503\b|\b429\b|\b500\b|overloaded|unavailable|rate.limit|temporar/i.test(msg)
  }

  let lastErr: any = null

  // Construir las partes del request: cada archivo precedido por una etiqueta de texto
  // para que el modelo sepa cuál es factura y cuál packing list cuando son 2.
  const contentParts: any[] = []
  for (const fp of fileParts) {
    if (isDual) contentParts.push({ text: `=== ${fp.label} ===` })
    contentParts.push({ inlineData: fp.inlineData })
  }
  contentParts.push({ text: PROMPT })

  for (const modelName of MODELS) {
    // por cada modelo: hasta 2 intentos con backoff
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName, generationConfig: genConfig })
        const result = await model.generateContent(contentParts)
        const text = result.response.text()
        const data = JSON.parse(text)
        return NextResponse.json({ ok: true, data, model: modelName, sources: filesRaw.map(f => f.label) })
      } catch (e: any) {
        lastErr = e
        console.warn(`[gemini extract] ${modelName} attempt ${attempt + 1} failed:`, e?.message)
        if (!isRetryable(e)) break // error no recuperable → probar próximo modelo
        await sleep(800 * (attempt + 1)) // 800ms, 1600ms
      }
    }
  }

  console.error('[gemini extract] all models failed:', lastErr?.message)
  const userMsg = /quota|limit: 0/i.test(String(lastErr?.message || ''))
    ? 'Se agotó la cuota de la API. Probá de nuevo en unos minutos.'
    : /503|overloaded|unavailable/i.test(String(lastErr?.message || ''))
    ? 'El servicio de IA está saturado. Probá de nuevo en 1-2 minutos.'
    : (lastErr?.message || 'No pudimos extraer los datos')
  return NextResponse.json({ error: userMsg }, { status: 500 })
}
