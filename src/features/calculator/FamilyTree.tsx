import type { ReactNode } from 'react';
import { Heart } from 'lucide-react';
import { isCalled, type CalcInput, type CalcPerson, type CalcResult, type HeirShare } from '../../engine/succession';
import { prettyFrac } from '../../engine/fraction';
import { cx } from '../../lib/utils';
import { seriesVar } from './ShareBar';

type ShareMap = Map<string, { share: HeirShare; index: number }>;

function Node({
  relation,
  name,
  share,
  muted,
  deceased,
  status,
  children,
}: {
  relation: string;
  name: string;
  share?: { share: HeirShare; index: number };
  muted?: boolean;
  deceased?: boolean;
  status?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cx('ft-node', deceased && 'deceased', share && 'heir', muted && 'muted')}>
      <span className="ft-rel">{relation}</span>
      <strong className="ft-name">{name}</strong>
      {status && <span className="ft-status">{status}</span>}
      {share && (
        <span className="ft-share">
          <i style={{ background: seriesVar(share.index) }} aria-hidden />
          {prettyFrac(share.share.fraction)}
        </span>
      )}
      {children}
    </div>
  );
}

const STATUS_SHORT: Record<CalcPerson['status'], string> = {
  vivo: '',
  predefunto: '✝ pré-falecido',
  repudiou: 'repudiou',
  indigno: 'indigno',
};

function PersonBranch({ p, shares, relation, childRelation, fallback }: { p: CalcPerson; shares: ShareMap; relation: string; childRelation: string; fallback: string }) {
  const called = isCalled(p);
  return (
    <li>
      <Node
        relation={relation}
        name={p.name || fallback}
        share={shares.get(p.id)}
        status={STATUS_SHORT[p.status] || undefined}
        muted={!called || (p.status !== 'vivo' && !shares.get(p.id))}
      />
      {p.descendants.length > 0 && (
        <ul>
          {p.descendants.map((d, i) => (
            <PersonBranch key={d.id} p={d} shares={shares} relation={childRelation} childRelation="Descendente" fallback={`Descendente ${i + 1}`} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Árvore genealógica: ascendentes → irmãos e de cujus (com cônjuge) → descendentes. */
export function FamilyTree({ input, result }: { input: CalcInput; result: CalcResult }) {
  const shares: ShareMap = new Map();
  result.shares.forEach((s, index) => {
    if (s.personId) shares.set(s.personId, { share: s, index });
  });
  const byKey = new Map(result.shares.map((s, index) => [s.key, { share: s, index }]));
  const spouseShare = byKey.get('conjuge');
  const ascShares = result.shares.map((s, index) => ({ s, index })).filter((x) => x.s.key.startsWith('asc-'));

  const siblings = input.siblings;
  const half = Math.ceil(siblings.length / 2);
  const left = siblings.slice(0, half);
  const right = siblings.slice(half);

  const deceasedNode = (
    <li className="ft-center">
      <div className="ft-couple">
        <Node relation="De cujus" name={input.deceasedName || 'Falecido(a)'} deceased />
        {input.spouse.present && (
          <>
            <span className="ft-link" role="img" aria-label="casado(a) com">
              <Heart size={13} aria-hidden />
            </span>
            <Node relation="Cônjuge" name={input.spouse.name || 'Cônjuge'} share={spouseShare} muted={!spouseShare} />
          </>
        )}
      </div>
      {input.children.length > 0 && (
        <ul>
          {input.children.map((c, i) => (
            <PersonBranch key={c.id} p={c} shares={shares} relation="Filho(a)" childRelation="Neto(a)" fallback={`Filho ${i + 1}`} />
          ))}
        </ul>
      )}
    </li>
  );

  const parentsLabel =
    input.parents > 0 ? `${input.parents} ${input.parents === 1 ? 'progenitor vivo' : 'progenitores vivos'}` : 'Pais pré-falecidos';
  const parentShare = ascShares.length && input.parents > 0 ? ascShares[0] : undefined;

  return (
    <div className="ftree-scroll">
      <div className="ftree">
        <ul>
          <li>
            {input.grandparents > 0 && (
              <div className="ft-gp">
                <Node
                  relation="Avós"
                  name={`${input.grandparents} ${input.grandparents === 1 ? 'avô/avó vivo(a)' : 'avós vivos'}`}
                  share={input.parents === 0 && ascShares.length ? { share: ascShares[0]!.s, index: ascShares[0]!.index } : undefined}
                  muted={input.parents > 0 || !ascShares.length}
                  status={input.parents === 0 && ascShares.length > 1 ? `cada um ${prettyFrac(ascShares[0]!.s.fraction)}` : undefined}
                />
                <span className="ft-vline" aria-hidden />
              </div>
            )}
            <Node
              relation="Ascendentes"
              name={parentsLabel}
              share={parentShare ? { share: parentShare.s, index: parentShare.index } : undefined}
              muted={input.parents === 0 || !parentShare}
              status={parentShare && input.parents > 1 ? `cada um ${prettyFrac(parentShare.s.fraction)}` : undefined}
            />
            <ul>
              {left.map((s, i) => (
                <PersonBranch
                  key={s.id}
                  p={s}
                  shares={shares}
                  relation={s.kind === 'unilateral' ? 'Irmão(ã) unilateral' : 'Irmão(ã)'}
                  childRelation="Sobrinho(a)"
                  fallback={`Irmão ${i + 1}`}
                />
              ))}
              {deceasedNode}
              {right.map((s, i) => (
                <PersonBranch
                  key={s.id}
                  p={s}
                  shares={shares}
                  relation={s.kind === 'unilateral' ? 'Irmão(ã) unilateral' : 'Irmão(ã)'}
                  childRelation="Sobrinho(a)"
                  fallback={`Irmão ${half + i + 1}`}
                />
              ))}
            </ul>
          </li>
        </ul>
      </div>
      {input.collaterals.length > 0 && (
        <div className="ft-collaterals">
          <span className="tiny subtle strong">OUTROS COLATERAIS</span>
          <div className="row wrap" style={{ gap: 8 }}>
            {input.collaterals.map((c, i) => (
              <Node
                key={c.id}
                relation={`${c.degree ?? 4}.º grau`}
                name={c.name || `Colateral ${i + 1}`}
                share={shares.get(c.id)}
                muted={!shares.get(c.id)}
                status={c.status !== 'vivo' ? STATUS_SHORT[c.status] : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
