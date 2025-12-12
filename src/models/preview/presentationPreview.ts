import { NULL_ARRANGEMENT_ID } from ".";
import { ProPresenterRepository } from "@/services/propresenterRepository";
import * as proto from '@/models/propresenter-proto';
import { parseRtf } from "@/lib/rtf";
import { UrlResolver } from "@/lib/visitor";

export class SlidePreview {
  readonly uuid: string;
  text: string[] = [];
  notes: string = '';

  resolveFiles(): { files: string[], unresolved: Array<proto.rv.data.IURL> } {
    const resolver = new UrlResolver();
    resolver.walk(this.cue);
    return resolver.results;
  }

  constructor(private readonly cue: proto.rv.data.ICue) {
    this.uuid = cue.uuid!.string!;
    const presentationSlide = cue.actions?.find(f => f.type === proto.rv.data.Action.ActionType.ACTION_TYPE_PRESENTATION_SLIDE);
    if (presentationSlide) {
      for (const element of presentationSlide.slide?.presentation?.baseSlide?.elements ?? []) {
        const rtf = element.element?.text?.rtfData;
        if (rtf) {
          this.text.push(...parseRtf(rtf) ?? []);
        }
      }
      this.notes = parseRtf(presentationSlide.slide?.presentation?.notes?.rtfData)?.join('\n') ?? '';
    }
  }

  async loadFromRepository(repo: ProPresenterRepository): Promise<SlidePreview> {
    return this;
  }
}

const DEFAULT_GROUP_COLORS: Record<string, string> = {
  Chorus: '#CB024E',
  'Chorus 1': '#CB024E',
  'Chorus 2': '#CC044F',
  'Chorus 3': '#660126',
  Bridge: '#7600CC',
  'Verse 2': '#015899',
  Outro: '#7F7618',
  Interlude: '#26B34B',
  Ending: '#998F1E',
}

export class SlideGroupPreview {
  readonly uuid: string;
  readonly name: string;
  readonly slides: SlidePreview[];

  constructor(readonly original: proto.rv.data.Presentation.ICueGroup, allSlides: Record<string, SlidePreview>) {
    this.uuid = original.group!.uuid!.string!;
    this.name = original.group!.name!;
    this.slides = original.cueIdentifiers?.map(id => allSlides[id.string ?? '']) ?? [];
  }

  get color() {
    const c = this.original.group?.color;
    return c ? parseColor(c) : (DEFAULT_GROUP_COLORS[this.original.group?.name ?? ''] ?? 'transparent');
  }

  get requiredFiles(): proto.rv.data.IURL[] {
    return [];
  }
}

function parseColor(color: proto.rv.data.IColor | null | undefined): string | undefined {
  function stoc(s: number | null | undefined): number {
    return Math.round((s ?? 0) * 255);
  }
  return `rgba(${stoc(color?.red)}, ${stoc(color?.green)}, ${stoc(color?.blue)}, ${stoc(color?.alpha)})`;
}

export class PresentationPreview {
  readonly arrangements: Record<string, string[]> = {};
  readonly slideGroups: Record<string, SlideGroupPreview> = {};
  private readonly allSlides: Record<string, SlidePreview> = {};
  isFound: boolean = false;
  original?: proto.rv.data.IPresentation;
  path?: string;

  constructor(readonly uuid: string, readonly name: string, private readonly url: proto.rv.data.IURL | null | undefined) {
  }

  get isValid() {
    return this.isFound;
  }

  resolveFiles(): { files: string[], unresolved: Array<proto.rv.data.IURL> } {
    const resolver = new UrlResolver();
    resolver.walk(this.allSlides);
    resolver.results.files.unshift(this.path!);
    return resolver.results;
  }

  async loadFromRepository(repo: ProPresenterRepository): Promise<PresentationPreview> {
    this.path = await repo.resolvePath(this.url);
    if (!this.path) {
      return this;
    }

    this.isFound = true;
    try {
      this.original = await repo.loadPresentation(this.path);
    } catch (err: unknown) {
      console.log('error reading presentation:' + err);
      this.isFound = false;
      return this;
    }

    this.arrangements[NULL_ARRANGEMENT_ID] = this.original.cueGroups?.map(g => g.group?.uuid?.string ?? '') ?? [];
    if (this.original.arrangements) {
      for (const arrangement of this.original.arrangements) {
        const arrange = arrangement.groupIdentifiers?.map(g => g.string ?? '') ?? [];
        this.arrangements[arrangement.name ?? ''] = arrange;
      }
    }

    for (const cue of this.original.cues ?? []) {
      const slide = new SlidePreview(cue);
      this.allSlides[cue.uuid?.string ?? ''] = await slide.loadFromRepository(repo);
    }

    for (const group of this.original.cueGroups ?? []) {
      const groupPreview: SlideGroupPreview = new SlideGroupPreview(group, this.allSlides);
      this.slideGroups[groupPreview.uuid] = groupPreview;
    }

    return this;
  }
}