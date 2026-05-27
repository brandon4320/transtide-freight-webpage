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

const PROMPT = `Extraé información estructurada de este documento de comercio exterior (puede ser una proforma invoice, packing list, commercial invoice, o similar).

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

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'no file' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'file too large (max 10MB)' }, { status: 400 })
  }

  const mimeType = file.type || 'application/pdf'
  const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp']
  if (!allowed.includes(mimeType)) {
    return NextResponse.json({ error: `unsupported file type: ${mimeType}` }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.1,
    },
  })

  try {
    const result = await model.generateContent([
      { inlineData: { data: base64, mimeType } },
      { text: PROMPT },
    ])
    const text = result.response.text()
    const data = JSON.parse(text)
    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    console.error('[gemini extract] error:', e)
    return NextResponse.json(
      { error: e?.message || 'extraction failed' },
      { status: 500 }
    )
  }
}
