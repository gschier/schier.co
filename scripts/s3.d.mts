// Types for scripts/s3.mjs, for the tests that import it.
export type Store = {
  name: string
  host: string
  list(prefix: string): Promise<{ key: string; size: number }[]>
  head(path: string): Promise<{ size: number; contentType: string | null } | null>
  get(path: string): Promise<{ body: Buffer; contentType: string | null }>
  put(path: string, body: Buffer, contentType?: string | null): Promise<void>
}
export function bucket(options: { endpoint: string; key: string; secret: string; bucket: string; region: string }): Store
