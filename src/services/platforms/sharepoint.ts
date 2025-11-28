import { ApiSharepointFile } from '@/models/api';
import type { FileReference, FolderReference } from '.';

export class SharePointAuth {
  static accessToken: string = '';
}

class SharePointFile implements FileReference {
  readonly kind = 'file' as const;
  readonly name: string;
  readonly relativePath: string;
  private metadata: { size?: number; modified?: number } = {};

  constructor(name: string, relativePath: string, metadata: { size?: number, modified?: number}) {
    this.name = name;
    this.relativePath = relativePath;
    this.metadata = metadata;
  }

  private async fetchMetadata() {
    if (this.metadata.size !== undefined && this.metadata.modified !== undefined) {
      return this.metadata;
    }

    const response = await fetch(
      `/api/sharepoint/file/metadata?path=${encodeURIComponent(this.relativePath)}`, {
      headers: {
        authorization: `Bearer ${SharePointAuth.accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch metadata: ${response.statusText}`);
    }

    const data = await response.json();
    this.metadata = { size: data.size, modified: data.modified };
    return this.metadata;
  }

  async getModified(): Promise<number> {
    const metadata = await this.fetchMetadata();
    return metadata.modified!;
  }

  async getSize(): Promise<number> {
    const metadata = await this.fetchMetadata();
    return metadata.size!;
  }

  async getContents(): Promise<ArrayBuffer> {
    const response = await fetch(
      `/api/sharepoint/file/content?path=${encodeURIComponent(this.relativePath)}`, {
      headers: {
        authorization: `Bearer ${SharePointAuth.accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch contents: ${response.statusText}`);
    }

    return await response.arrayBuffer();
  }

  async putContents(bytes: ArrayBuffer): Promise<void> {
    const formData = new FormData();
    const blob = new Blob([bytes]);
    formData.append('file', blob);
    formData.append('path', this.relativePath);

    const response = await fetch('/api/sharepoint/file/upload', {
      method: 'POST',
      body: formData,
      headers: {
        authorization: `Bearer ${SharePointAuth.accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to put contents: ${response.statusText}`);
    }
  }

  async getStream(): Promise<ReadableStream<Uint8Array>> {
    const response = await fetch(
      `/api/sharepoint/file/content?path=${encodeURIComponent(this.relativePath)}`, {
      headers: {
        authorization: `Bearer ${SharePointAuth.accessToken}`
      }
    });

    if (!response.ok || !response.body) {
      throw new Error(`Failed to get stream: ${response.statusText}`);
    }

    return response.body;
  }

  async putStream(
    stream: ReadableStream<Uint8Array>,
    progress?: (bytes: number) => void
  ): Promise<void> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        totalBytes += value.length;
        
        if (progress) {
          progress(totalBytes);
        }
      }

      const combined = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      await this.putContents(combined.buffer);
    } finally {
      reader.releaseLock();
    }
  }
}

class SharePointFolder implements FolderReference {
  readonly kind = 'folder' as const;
  readonly name: string;
  readonly relativePath: string;

  constructor(name: string, relativePath: string) {
    this.name = name;
    this.relativePath = relativePath;
  }

  async getChildren(): Promise<Array<FolderReference | FileReference>> {
    const response = await fetch(
      `/api/sharepoint/folder?path=${encodeURIComponent(this.relativePath)}`, {
      headers: {
        authorization: `Bearer ${SharePointAuth.accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get children: ${response.statusText}`);
    }

    const data: { children: ApiSharepointFile[] } = await response.json();
    return data.children.map(child => {
      if (child.kind === 'folder') {
        return new SharePointFolder(child.name, child.path);
      } else {
        return new SharePointFile(child.name, child.path, { size: child.size, modified: child.modified });
      }
    });
  }

  async getFile(
    relativePath: string,
    opts?: { create?: boolean }
  ): Promise<FileReference> {
    const fullPath = this.relativePath
      ? `${this.relativePath}/${relativePath}`
      : relativePath;

    const fileName = relativePath.split('/').pop()!;

    if (opts?.create) {
      try {
        const response = await fetch('/api/sharepoint/file/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', authorization: `Bearer ${SharePointAuth.accessToken}` },
          body: JSON.stringify({ path: fullPath }),
        });

        if (!response.ok) {
          throw new Error(`Failed to create file: ${response.statusText}`);
        }
      } catch (error) {
        // File might already exist, continue
      }
    }

    console.log('creating file reference without metadata');
    return new SharePointFile(fileName, fullPath, { });
  }

  async getFolder(relativePath: string): Promise<FolderReference> {
    const fullPath = this.relativePath
      ? `${this.relativePath}/${relativePath}`
      : relativePath;

    const folderName = relativePath.split('/').pop()!;

    return new SharePointFolder(folderName, fullPath);
  }
}

export function getSharePointRoot(libraryName: string = 'ProPresenter Repository'): FolderReference {
  return new SharePointFolder(libraryName, libraryName);
}