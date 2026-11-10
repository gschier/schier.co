// Types for scripts/widget-publish.mjs, for the server and the tests that
// import it.
import type { Manifest, ManifestVersion } from '../src/lib/widgets'
import type { WidgetJson } from '../src/lib/widgetContract'

export class PublishError extends Error {
  readonly refusal: true
}

export type WidgetFile = { path: string; body: Buffer; type: string }

export type WidgetStorage = {
  kind: 'bucket' | 'disk'
  where: string
  keys(prefix: string): Promise<string[]>
  /// Claims [prefix] for a new version: false when it is taken.
  reserve(prefix: string): Promise<boolean>
  put(key: string, body: Buffer, type: string): Promise<void>
}

export function widgetStorage(env?: Record<string, string | undefined>): WidgetStorage
export function storedVersions(store: WidgetStorage, name: string): Promise<number[]>
export function putVersion(store: WidgetStorage, name: string, version: number, files: WidgetFile[]): Promise<void>
export function readManifest(path: string): Promise<Manifest>
export function writeManifest(path: string, manifest: Manifest): Promise<void>
export function contentHash(files: WidgetFile[]): string
export function readWidget(dir: string, name: string): Promise<WidgetJson>
export function buildWidget(dir: string, widget: WidgetJson, log?: (line: string) => void): Promise<WidgetFile[]>
export function publishWidget(
  name: string,
  options?: { widgetsDir?: string; manifest?: string; env?: Record<string, string | undefined>; log?: (line: string) => void },
): Promise<ManifestVersion>
