import { Constructor } from 'protobufjs';
import * as proto from '@/models/propresenter-proto';

type Primitive = string | number | boolean | null | undefined | symbol | bigint;

export class Visitor {
  /**
   * Override this to skip certain properties or branches.
   * Returning false means: "don’t descend into this value."
   */
  protected visitNode(_key: string, _value: unknown, _parent: unknown): boolean {
    return true;
  }

  /**
   * Called for every leaf node (primitives, arrays with no children, etc.).
   */
  protected visitLeaf(_key: string, _value: Primitive, _parent: unknown): void {
    // Default: do nothing
  }

  /**
 * Recursively walk an object.
 */
  protected visit(obj: unknown, parent: unknown = null, key: string = ''): void {
    if (obj === null || typeof obj !== 'object') {
      // Primitive leaf
      this.visitLeaf(key, obj as Primitive, parent);
      return;
    }

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const value = obj[i];
        if (this.visitNode(String(i), value, obj)) {
          this.visit(value, obj, String(i));
        }
      }
    } else {
      for (const [prop, value] of Object.entries(obj)) {
        if (this.visitNode(prop, value, obj)) {
          this.visit(value, obj, prop);
        }
      }
    }
  }

  /**
   * Recursively walk an object.
   */
  walk(obj: unknown, parent: unknown = null, key: string = ''): void {
    this.visit(obj, parent, key);
  }
}

export class UrlResolver extends Visitor {
  private fileSet: Set<string> = new Set();
  readonly allFiles: string[] = [];
  private unresolved: proto.rv.data.IURL[] = [];

  results: { files: string[], unresolved: Array<proto.rv.data.IURL> } = { files: [], unresolved: [] };

  override visitNode(_key: string, value: unknown, _parent: unknown): boolean {
    if (value instanceof proto.rv.data.URL) {
      if (value.local?.root === proto.rv.data.URL.LocalRelativePath.Root.ROOT_SHOW) {
        this.fileSet.add(value.local.path!);
        this.allFiles.push(value.local.path!);
      } else if (!(value.absoluteString || value.local || value.relativePath)) {
        // skip empty urls
      } else {
        this.unresolved.push(value);
      }
      
      return false;
    }
    return true;
  }

  override walk(obj: unknown, parent?: unknown, key?: string): void {
    this.fileSet = new Set();
    this.unresolved = [];
    super.walk(obj, parent, key);
    this.results = {
      files: [...this.fileSet],
      unresolved: this.unresolved,
    };
  }
}

export class RemoveAbsoluteUrls extends Visitor {
  protected override visitNode(_key: string, value: unknown, _parent: unknown): boolean {
    if (value instanceof proto.rv.data.URL && value.local?.root === proto.rv.data.URL.LocalRelativePath.Root.ROOT_SHOW) {
      delete value.absoluteString;
      return false;
    }
    return true;
  }

  static clean(doc: unknown) {
    const vistor = new RemoveAbsoluteUrls();
    vistor.walk(doc);
  }
}

export class FinderVisitor<T> extends Visitor {
  private found: T|undefined;
  constructor(private readonly id: string, private readonly mode: 'id'|'name') {
    super();
  }

  protected override visitNode(key: string, value: unknown, parent: unknown): boolean {
    if (this.mode === 'id' && key === 'uuid') {
      const uuid = value as proto.rv.data.UUID;
      if (uuid.string === this.id && parent) {
        this.found = parent as T;
      }
    }
    return !this.found;
  }

  static findById<T>(id: string, doc: unknown): T|undefined {
    const visitor = new FinderVisitor<T>(id, 'id');
    visitor.visit(doc);
    return visitor.found;
  }
}

export class TreeUpserter<T extends { uuid?: { string?: string|null}|null }> extends Visitor {
  private found: boolean = false;

  constructor(
    private readonly type: Constructor<T>,
    private readonly item: T
  ) {
    super();
  }

  protected override visitNode(_key: string, value: unknown, parent: unknown): boolean {
    if (value instanceof this.type && value.uuid?.string && (value.uuid?.string === this.item.uuid?.string) && Array.isArray(parent)) {
      const list = parent as Array<T>;
      list[list.indexOf(value)] = value;
      this.found = true;
    }
    return !this.found;   
  }

  static upsert<TI extends { uuid?: { string?: string|null}|null}>(doc: unknown, ctor: Constructor<TI>, item: TI, insertList: TI[]) {
    const visitor = new TreeUpserter<TI>(ctor, item);
    visitor.walk(doc);
    if (!visitor.found) {
      insertList.unshift(item);
    }
    return visitor.found;
  }
}

export class MediaFinder extends Visitor {
  current: proto.rv.data.PlaylistItem|undefined;
  found: proto.rv.data.PlaylistItem|undefined;

  constructor(private readonly path: string) {
    super();
  }

  protected override visit(obj: unknown, parent?: unknown, key?: string): void {
    if (obj instanceof proto.rv.data.PlaylistItem) {
      this.current = obj;
      super.visit(obj, parent, key);
      this.current = undefined;
    } else if (obj instanceof proto.rv.data.URL
      && obj.local?.root === proto.rv.data.URL.LocalRelativePath.Root.ROOT_SHOW 
      && obj.local?.path === this.path) {
        this.found = this.current;
      } else {
      super.visit(obj, parent, key);
    }
  }

  static find(path: string, doc: unknown) {
    const visitor = new MediaFinder(path);
    visitor.visit(doc);
    return visitor.found;
  }
}

export class MediaReferenceResolver extends Visitor {
  private found: Record<string, { id: string, name: string }> = {};
  
  protected override visitNode(_key: string, value: unknown, _parent: unknown): boolean {
    //console.log('visiting', _key, typeof value, value);
    if (value instanceof proto.rv.data.Media) {
      //console.log('looking for media references in', value, _parent);
      this.found[value.uuid!.string!] = { id: value.uuid!.string!, name: value.url?.local?.path ?? '' }
      return false;
    }
    return true;   
  }

  get results() {
    return Object.values(this.found);
  }
}

export class UuidResolver extends Visitor {
  private path: string[] = [];
  readonly results: Record<string, string> = {};

  protected override visit(obj: unknown, parent?: unknown, key?: string): void {
    if (obj instanceof proto.rv.data.UUID) {
      this.results[obj.string] = this.path.join('.');
    } else {
      this.path.push(key ?? '_');
      super.visit(obj, parent, key);
      this.path.pop();
    }
  }

  static search(doc: unknown) {
    const visitor = new UuidResolver();
    visitor.walk(doc);
    return visitor.results;
  }
}