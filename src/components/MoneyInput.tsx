import { useEffect, useState } from 'react';
import { parseAmount } from '../lib/utils';

const fmt = (v: number | null) => (v === null ? '' : String(v).replace('.', ','));

/** Campo monetário em euros (aceita "1 234,56" ou "1234.56"); grava ao sair do campo. */
export function MoneyInput({
  id,
  value,
  onChange,
  placeholder = '0,00',
  ariaLabel,
}: {
  id?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [raw, setRaw] = useState(fmt(value));
  useEffect(() => setRaw(fmt(value)), [value]);
  return (
    <div className="input-group">
      <input
        id={id}
        className="input"
        inputMode="decimal"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => onChange(parseAmount(raw))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onChange(parseAmount(raw));
        }}
        style={{ paddingRight: 30 }}
      />
      <span style={{ position: 'absolute', right: 12, color: 'var(--text-3)' }} aria-hidden>
        €
      </span>
    </div>
  );
}
