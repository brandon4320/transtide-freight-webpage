import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const ENDPOINT = process.env.R2_ENDPOINT || ''
const BUCKET = process.env.R2_BUCKET || 'transtide-docs'

let _client: S3Client | null = null
function client(): S3Client {
  if (_client) return _client
  _client = new S3Client({
    region: 'auto',
    endpoint: ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
  })
  return _client
}

export function r2Configured(): boolean {
  return !!(ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY)
}

export async function r2Put(key: string, body: Buffer | Uint8Array, contentType: string) {
  await client().send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }))
}

export async function r2Delete(key: string) {
  await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

/** URL firmada para descargar/ver el archivo (válida 1 hora). */
export async function r2SignedGetUrl(key: string, filename?: string): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ...(filename ? { ResponseContentDisposition: `inline; filename="${filename.replace(/"/g, '')}"` } : {}),
  })
  return getSignedUrl(client(), cmd, { expiresIn: 3600 })
}
