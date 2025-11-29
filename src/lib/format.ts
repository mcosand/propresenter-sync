const BYTE_FORMAT = new Intl.NumberFormat(undefined, { style: 'unit', unit: 'byte', notation: 'compact', unitDisplay: 'narrow'});
const DATETIME_FORMAT = new Intl.DateTimeFormat(undefined, { });

export function formatBytes(size: number|null|undefined) {
  if (size === null || size === undefined) {
    return '';
  }
  return BYTE_FORMAT.format(size);
}

export function formatDateTime(when: number|null|undefined) {
  if (!when) {
    return '';
  }
  return DATETIME_FORMAT.format(when);
}