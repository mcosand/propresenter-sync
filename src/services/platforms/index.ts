export interface FileReference {
  readonly kind: 'file';
  readonly name: string;
  readonly relativePath: string;
  getModified(): Promise<number>;
  getSize(): Promise<number>;
  getContents(): Promise<ArrayBuffer>;
  putContents(bytes: ArrayBuffer): Promise<void>;
  getStream(): Promise<ReadableStream<Uint8Array>>;
  putStream(stream: ReadableStream<Uint8Array>, progress?: (bytes: number) => void): Promise<void>;
}

export interface FolderReference {
  readonly kind: 'folder';
  readonly name: string;
  readonly relativePath: string;
  getChildren(): Promise<Array<FolderReference|FileReference>>;
  getFile(relativePath: string, opts?: { create?: boolean }): Promise<FileReference>;
  getFolder(relativePath: string): Promise<FolderReference>;
}

export function joinPath(before: string, after: string): string {
  return `${before}${before ? '/' : ''}${after}`;
}