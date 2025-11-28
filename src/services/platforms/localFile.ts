import { FileReference, FolderReference, joinPath } from ".";

class LocalFileReference implements FileReference {
  constructor(private fileHandle: FileSystemFileHandle, readonly relativePath: string) {}
  readonly kind = 'file';
  get name(): string {
    return this.fileHandle.name;
  }
  async getModified(): Promise<number> {
    const file = await this.fileHandle.getFile();
    return file.lastModified;
  }

  async getSize(): Promise<number> {
    const file = await this.fileHandle.getFile();
    return file.size;
  }

  async getContents(): Promise<ArrayBuffer> {
    const file = await this.fileHandle.getFile();
    return await file.arrayBuffer()
  }

  async putContents(bytes: ArrayBuffer): Promise<void> {
    const writable = await this.fileHandle.createWritable();
    await writable.write(bytes);
    await writable.close();
  }

  async getStream(): Promise<ReadableStream<Uint8Array>> {
    const file = await this.fileHandle.getFile();
    return file.stream();
  }

  async putStream(stream: ReadableStream<Uint8Array>, progress?: (bytes: number) => void): Promise<void> {
    const writable = await this.fileHandle.createWritable();
    const reader = stream.getReader();
    let bytes = 0;
    while (new Date().getTime() > 1) {
      const { done, value } = await reader.read();
      bytes += value?.length ?? 0;
      if (done) {
        progress?.(bytes);
        break;
      }
      await writable.write(value.slice(value.byteOffset, value.byteOffset + value.byteLength));
      progress?.(bytes);
    }

    await writable.close();
  }
}

export class LocalFolderReference implements FolderReference {
  constructor(private dirHandle: FileSystemDirectoryHandle, readonly relativePath: string) {
  }
  readonly kind = 'folder';
  get name(): string {
    return this.dirHandle.name;
  }

  async getChildren(): Promise<Array<FolderReference | FileReference>> {
    const list: Array<FolderReference|FileReference> = [];
    for await (const [, item] of this.dirHandle.entries()) {
      const path = joinPath(this.relativePath, item.name);
      if (item.kind === 'directory') {
        list.push(new LocalFolderReference(item as FileSystemDirectoryHandle, path));
      } else if (item.kind === 'file') {
        list.push(new LocalFileReference(item as FileSystemFileHandle, path));
      }
    }
    return list;
  }

  async getFile(relativePath: string, opts?: { create?: boolean }): Promise<FileReference> {
    const parts = relativePath.split('/');
    let dHandle = this.dirHandle;
    for (let i=0;i<parts.length-1; i++) {
      dHandle = await dHandle.getDirectoryHandle(parts[i], opts);
    }
    return new LocalFileReference(await dHandle.getFileHandle(parts[parts.length-1], opts), joinPath(this.relativePath, relativePath));
  }

  async getFolder(relativePath: string): Promise<FolderReference> {
    const parts = relativePath.split('/');
    let dHandle = this.dirHandle;
    for (let i=0;i<parts.length; i++) {
      dHandle = await dHandle.getDirectoryHandle(parts[i]);
    }
    return new LocalFolderReference(dHandle, joinPath(this.relativePath, relativePath));
  }
}
