  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle|undefined>;
  }
