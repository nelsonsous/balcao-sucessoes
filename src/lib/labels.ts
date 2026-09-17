import type { AssetRecord, Channel, DebtRecord, Kinship, PartyRecord, PartyRole } from './types';

export const ROLE_LABELS: Record<PartyRole, string> = {
  herdeiro: 'Herdeiro',
  legatario: 'Legatário',
  conjuge: 'Cônjuge',
  unido_facto: 'Unido de facto',
  credor: 'Credor',
  beneficiario: 'Beneficiário',
  representante: 'Representante legal',
  outro: 'Outro interessado',
  a_confirmar: 'A confirmar',
};

export const KINSHIP_LABELS: Record<Exclude<Kinship, ''>, string> = {
  conjuge: 'Cônjuge',
  unido_facto: 'Unido(a) de facto',
  filho: 'Filho(a)',
  neto: 'Neto(a)',
  progenitor: 'Pai / Mãe',
  avo: 'Avô / Avó',
  irmao: 'Irmão / Irmã',
  sobrinho: 'Sobrinho(a)',
  outro_parente: 'Outro parente',
  sem_parentesco: 'Sem parentesco',
};

export const POA_LABELS: Record<PartyRecord['poa'], string> = {
  na: 'Não aplicável',
  a_pedir: 'A pedir',
  pedida: 'Pedida',
  recebida: 'Recebida',
};

export const ACCEPTANCE_LABELS: Record<PartyRecord['acceptance'], string> = {
  por_definir: 'Por definir',
  aceitou: 'Aceitou',
  repudiou: 'Repudiou',
  beneficio_inventario: 'Aceitou a benefício de inventário',
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  email: 'Email',
  telefone: 'Telefone',
  reuniao: 'Reunião',
  carta: 'Carta',
  videochamada: 'Videochamada',
  outro: 'Outro',
};

export const OWNERSHIP_LABELS: Record<AssetRecord['ownership'], string> = {
  proprio: 'Bem próprio',
  comum: 'Bem comum do casal',
  desconhecido: 'Por classificar',
};

export const VALUE_BASIS_LABELS: Record<AssetRecord['valueBasis'], string> = {
  '': '—',
  vpt: 'VPT',
  saldo: 'Saldo à data do óbito',
  mercado: 'Valor de mercado',
  nominal: 'Valor nominal',
  estimado: 'Estimativa',
};

export const ASSET_STATUS_LABELS: Record<AssetRecord['status'], string> = {
  identificado: 'Identificado',
  documentado: 'Documentado',
  avaliado: 'Avaliado',
  partilhado: 'Partilhado',
};

export const DEBT_STATUS_LABELS: Record<DebtRecord['status'], string> = {
  por_confirmar: 'Por confirmar',
  confirmado: 'Confirmado',
  pago: 'Pago',
  contestado: 'Contestado',
};
