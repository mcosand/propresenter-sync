import * as proto from '@/models/propresenter-proto';

export const NULL_ARRANGEMENT_ID = 'Master';

export class PlaceholderPreview {
  readonly isValid = true;

  constructor(readonly uuid: string, readonly name: string) {}

  resolveFiles(): { files: string[], unresolved: Array<proto.rv.data.IURL> } {
    return { files: [], unresolved: [] };
  }
}

