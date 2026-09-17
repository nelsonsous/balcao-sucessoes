// Exportação iCalendar (RFC 5545) — importável no Outlook, Google Calendar e Apple Calendar.

export interface IcsEvent {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  /** AAAA-MM-DD */
  date: string;
  /** HH:MM — ausente = dia inteiro */
  time?: string;
  endTime?: string;
  /** Alarme N dias antes (eventos de dia inteiro). */
  alarmDaysBefore?: number;
  /** Alarme N minutos antes (eventos com hora). */
  alarmMinutesBefore?: number;
  categories?: string[];
}

const TZ = 'Europe/Lisbon';

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZ}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0000',
  'TZOFFSETTO:+0100',
  'TZNAME:WEST',
  'DTSTART:19700329T010000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0000',
  'TZNAME:WET',
  'DTSTART:19701025T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

export function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

const encoder = new TextEncoder();

/** Dobra linhas com mais de 75 octetos (UTF-8), sem partir caracteres. */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = encoder.encode(ch).length;
    if (bytes + b > limit) {
      parts.push(cur);
      cur = '';
      bytes = 0;
      limit = 74; // as linhas de continuação começam com um espaço
    }
    cur += ch;
    bytes += b;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const compactDate = (iso: string) => iso.replace(/-/g, '');

function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

function utcStamp(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function localDateTime(iso: string, hhmm: string): string {
  return `${compactDate(iso)}T${hhmm.replace(':', '')}00`;
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Alarme às 09:00, N dias antes de um evento de dia inteiro (que começa às 00:00). */
function allDayTrigger(daysBefore: number): string {
  if (daysBefore <= 0) return 'PT9H';
  return daysBefore === 1 ? '-PT15H' : `-P${daysBefore - 1}DT15H`;
}

export function buildIcs(events: IcsEvent[], calendarName: string, now = new Date()): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Balcao das Sucessoes//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    `X-WR-TIMEZONE:${TZ}`,
    ...VTIMEZONE,
  ];
  const stamp = utcStamp(now);
  for (const e of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`);
    if (e.time) {
      const end = e.endTime && e.endTime > e.time ? e.endTime : addMinutes(e.time, 60);
      lines.push(`DTSTART;TZID=${TZ}:${localDateTime(e.date, e.time)}`, `DTEND;TZID=${TZ}:${localDateTime(e.date, end)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(e.date)}`, `DTEND;VALUE=DATE:${compactDate(nextDay(e.date))}`, 'TRANSP:TRANSPARENT');
    }
    lines.push(`SUMMARY:${escapeText(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.categories?.length) lines.push(`CATEGORIES:${e.categories.map(escapeText).join(',')}`);
    const alarm = e.time
      ? e.alarmMinutesBefore !== undefined
        ? `-PT${e.alarmMinutesBefore}M`
        : null
      : e.alarmDaysBefore !== undefined
        ? allDayTrigger(e.alarmDaysBefore)
        : null;
    if (alarm) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(e.title)}`, `TRIGGER:${alarm}`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
