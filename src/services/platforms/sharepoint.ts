import { ApiSharepointFile } from '@/models/api';
import type { FileReference, FolderReference } from '.';
import { CHUNK_SIZE } from '@/app/api/sharepoint/upload/route';

export class SharePointAuth {
  static accessToken: string = '';
}
class SharePointFile implements FileReference {
  readonly kind = 'file' as const;
  readonly name: string;
  readonly relativePath: string;
  private metadata: { size?: number; modified?: number } = {};

  constructor(name: string, relativePath: string, metadata: { size?: number, modified?: number }) {
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
    const blob = new Blob([bytes]);

    if (bytes.byteLength > CHUNK_SIZE) {
      throw new Error('contents are too large: ' + bytes.byteLength);
    }

    const response = await fetch('/api/sharepoint/upload', {
      method: 'POST',
      headers: {
        'x-filename': encodeURIComponent(this.relativePath),
        'x-filesize': `${bytes.byteLength}`,
        'Content-Type': 'application/octet-stream',
      },
      body: blob,
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
    size: number,
    progress?: (bytes: number) => void
  ): Promise<void> {
    const reader = stream.getReader();

    let offset: number = 0;
    let uploadUrl: string | undefined = undefined;
    let done = false;
    while (!done) {
      const buffers: Uint8Array[] = []; //Uint8Array<ArrayBuffer> = new Uint8Array(Math.min(CHUNK_SIZE, size));
      let bufferSize = 0;
      // Read chunks until we have CHUNK_SIZE or stream ends
      while ((bufferSize < CHUNK_SIZE) && !done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) {
          done = true;
          break;
        }
        if (value.byteLength) {
          buffers.push(value);
          bufferSize += value.length;
        }
      }
      if (bufferSize === 0) break;

      const chunk = new Uint8Array(bufferSize);
      let position = 0;
      for (const arr of buffers) {
        chunk.set(arr, position);
        position += arr.length;
      }

      const headers: Record<string, string> = {
        'X-Filename': encodeURIComponent(this.relativePath),
        'X-Filesize': `${size}`,
        'X-Fileoffset': `${offset}`,
        'Content-Type': 'application/octet-stream',
      }
      if (uploadUrl) headers['x-upload-url'] = uploadUrl;

      const response = await fetch('/api/sharepoint/upload', {
        method: 'POST',
        headers,
        body: chunk,
      });

      if (!response.ok && response.status !== 202) {
        console.log(await response.text())
        throw new Error(`Upload chunk failed: ${response.statusText}`);
      }
      const responseJson = await response.json();
      if (responseJson.complete) {
        done = true;
        break;
      }

      uploadUrl = responseJson.uploadUrl;
      if (responseJson.offset !== offset + bufferSize) {
        throw new Error(`unexpected offset ${offset} + ${bufferSize} vs ${responseJson.offset}`);
      }
      offset = responseJson.offset;
      progress?.(offset ?? 0);
    }
    // // Create a new ReadableStream that tracks progress
    // const progressStream = new ReadableStream({
    //   async start(controller) {
    //     try {
    //       while (true) {
    //         const { done, value } = await reader.read();

    //         if (done) {
    //           controller.close();
    //           break;
    //         }

    //         totalBytes += value.length;
    //         if (progress) {
    //           progress(totalBytes);
    //         }

    //         controller.enqueue(value);
    //       }
    //     } catch (error) {
    //       controller.error(error);
    //       throw error;
    //     }
    //   }
    // });



    // const response = await fetch('/api/sharepoint/file/upload', {
    //   method: 'POST',
    //   headers: {
    //     'x-filename': encodeURIComponent(this.relativePath),
    //     'x-filesize': `${size}`,
    //     'Content-Type': 'application/octet-stream',
    //   },
    //   body: progressStream,
    //   // @ts-ignore - duplex is needed for streaming but not in types yet
    //   duplex: 'half',
    // });

    // if (!response.ok) {
    //   const error = await response.json();
    //   throw new Error(error.message || 'Upload failed');
    // }
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
    return new SharePointFile(fileName, fullPath, {});
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