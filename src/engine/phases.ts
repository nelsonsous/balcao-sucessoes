import type { PhaseId, Status } from '../lib/types';

export interface PhaseDef {
  id: PhaseId;
  label: string;
  description: string;
}

/** As 10 fases do processo sucessório, pela ordem natural de trabalho. */
export const PHASES: PhaseDef[] = [
  { id: 'abertura', label: 'Abertura', description: 'Óbito, procuração, cabeça-de-casal e arranque do dossier.' },
  { id: 'interessados', label: 'Interessados', description: 'Quem são os sucessíveis e demais interessados, e em que qualidade.' },
  { id: 'testamento', label: 'Testamento', description: 'Testamento, doações em vida e outras liberalidades.' },
  { id: 'habilitacao', label: 'Habilitação', description: 'Habilitação de herdeiros e prova da qualidade sucessória.' },
  { id: 'internacional', label: 'Internacional', description: 'Elementos de estraneidade: lei aplicável, CSE e entidades estrangeiras.' },
  { id: 'patrimonio', label: 'Património', description: 'Identificação, documentação e avaliação dos bens.' },
  { id: 'passivo', label: 'Passivo', description: 'Dívidas, encargos da herança e credores.' },
  { id: 'fiscal', label: 'Fiscal', description: 'Imposto do Selo, relação de bens, IRS e demais obrigações.' },
  { id: 'partilha', label: 'Partilha', description: 'Via da partilha, quinhões, tornas e autorizações.' },
  { id: 'encerramento', label: 'Encerramento', description: 'Registos, entrega de bens, relatório final e arquivo.' },
];

export const PHASE_INDEX: Record<PhaseId, number> = Object.fromEntries(
  PHASES.map((p, i) => [p.id, i]),
) as Record<PhaseId, number>;

export const phaseLabel = (id: PhaseId): string => PHASES[PHASE_INDEX[id]]?.label ?? id;

export interface StatusDef {
  id: Status;
  label: string;
  short: string;
  description: string;
}

export const STATUSES: StatusDef[] = [
  { id: 'pendente', label: 'Pendente', short: 'Pendente', description: 'Ainda não iniciada.' },
  { id: 'em_curso', label: 'Em curso', short: 'Em curso', description: 'Em tratamento pela equipa.' },
  { id: 'aguarda', label: 'A aguardar terceiros', short: 'A aguardar', description: 'Depende de banco, notário, cliente ou entidade externa.' },
  { id: 'concluido', label: 'Concluída', short: 'Concluída', description: 'Tratada e verificada.' },
  { id: 'na', label: 'Não aplicável', short: 'N/A', description: 'Não se aplica a este dossier.' },
];

export const statusLabel = (s: Status): string => STATUSES.find((x) => x.id === s)?.label ?? s;

export const OPEN_STATUSES: Status[] = ['pendente', 'em_curso', 'aguarda'];
export const isOpen = (s: Status): boolean => OPEN_STATUSES.includes(s);
