interface FileSystemDirectoryHandle extends AsyncIterable<[string, FileSystemHandle]> {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  keys(): AsyncIterableIterator<string>;
  values(): AsyncIterableIterator<FileSystemHandle>;
}
