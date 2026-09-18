import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import { setSetting, useSettings } from '../../lib/db';
import { formatEur, parseAmount } from '../../lib/utils';
import { Card, CardHead, Field } from '../../components/ui';

const ROUNDING = [
  { value: 0, label: 'Sem arredondamento' },
  { value: 6, label: '6 minutos (décimas de hora)' },
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
];

/** Definições de honorários: taxa horária, IVA, arredondamento do tempo e retenção na fonte. */
export function FeesSettingsCard() {
  const s = useSettings();
  const [rate, setRate] = useState(String(s.hourlyRate).replace('.', ','));
  const [vat, setVat] = useState(String(s.vatRate));
  const [wh, setWh] = useState(String(s.withholdingRate));
  useEffect(() => setRate(String(s.hourlyRate).replace('.', ',')), [s.hourlyRate]);
  useEffect(() => setVat(String(s.vatRate)), [s.vatRate]);
  useEffect(() => setWh(String(s.withholdingRate)), [s.withholdingRate]);
  const commit = (key: 'hourlyRate' | 'vatRate' | 'withholdingRate', raw: string, max: number) => {
    const v = parseAmount(raw);
    if (v !== null && v >= 0 && v <= max) void setSetting(key, v);
  };
  return (
    <Card>
      <CardHead icon={Receipt} title="Honorários" subtitle="Valores por omissão da nota de honorários; cada dossier e cada pessoa podem ter a sua taxa." />
      <div className="card-body">
        <div className="form-grid">
          <Field label="Taxa horária do escritório (€/h, sem IVA)" htmlFor="s-rate" hint={`Atual: ${formatEur(s.hourlyRate)}/h`}>
            <input id="s-rate" className="input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} onBlur={() => commit('hourlyRate', rate, 10_000)} />
          </Field>
          <Field label="IVA sobre honorários (%)" htmlFor="s-vat">
            <input id="s-vat" className="input" inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value)} onBlur={() => commit('vatRate', vat, 100)} />
          </Field>
          <Field label="Arredondamento do tempo faturável" htmlFor="s-round">
            <select id="s-round" className="select" value={s.timeRounding} onChange={(e) => void setSetting('timeRounding', Number(e.target.value))}>
              {ROUNDING.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Retenção na fonte de IRS (%)" htmlFor="s-wh" hint="Aplica-se só nos dossiers em que a ativar (clientes com contabilidade organizada).">
            <input id="s-wh" className="input" inputMode="decimal" value={wh} onChange={(e) => setWh(e.target.value)} onBlur={() => commit('withholdingRate', wh, 100)} />
          </Field>
        </div>
        <p className="tiny subtle" style={{ marginTop: 10 }}>
          A nota de honorários é um documento de apoio; a fatura emite-se no programa de faturação certificado do escritório. Taxas a validar pela equipa.
        </p>
      </div>
    </Card>
  );
}
