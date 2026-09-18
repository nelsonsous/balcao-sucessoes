import { ChevronDown } from 'lucide-react';
import type { Status } from '../lib/types';
import { cx } from '../lib/utils';
import { STATUSES } from '../engine/phases';
import { Menu } from './ui';

/** Semáforo clicável: mostra o estado e permite mudá-lo num gesto. */
export function StatusMenu({ status, onChange, compact }: { status: Status; onChange: (s: Status) => void; compact?: boolean }) {
  const def = STATUSES.find((s) => s.id === status)!;
  return (
    <Menu
      ariaLabel={`Estado: ${def.label}. Alterar estado`}
      align="left"
      items={STATUSES.map((s) => ({
        label: s.label,
        description: s.description,
        checked: s.id === status,
        onSelect: () => onChange(s.id),
        icon: undefined,
      }))}
      button={(p) => (
        <button type="button" className={cx('status-pill', status)} {...p}>
          <span className={cx('dot', status)} aria-hidden />
          {compact ? def.short : def.label}
          <ChevronDown size={14} aria-hidden />
        </button>
      )}
    />
  );
}
