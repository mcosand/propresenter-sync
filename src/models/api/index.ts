export interface ApiSharepointFile {
  name: string;
  path: string;
  kind: 'file'|'folder';
  size: number,
  modified: number,
}