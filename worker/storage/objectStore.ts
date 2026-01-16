export interface ObjectStore {
  putObject: (key: string, data: ArrayBuffer, contentType?: string) => Promise<{ key: string; url?: string }>;
  getObject: (key: string) => Promise<ArrayBuffer | null>;
}
