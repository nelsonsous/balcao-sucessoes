import {
  Banknote,
  Building2,
  Car,
  FileSignature,
  Flag,
  Globe,
  Handshake,
  Home,
  Landmark,
  Package,
  PiggyBank,
  Receipt,
  Rocket,
  ScrollText,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { AssetType, PhaseId } from '../lib/types';

export const PHASE_ICONS: Record<PhaseId, LucideIcon> = {
  abertura: Rocket,
  interessados: Users,
  testamento: ScrollText,
  habilitacao: FileSignature,
  internacional: Globe,
  patrimonio: Landmark,
  passivo: Wallet,
  fiscal: Receipt,
  partilha: Handshake,
  encerramento: Flag,
};

export const ASSET_META: Record<AssetType, { label: string; plural: string; icon: LucideIcon }> = {
  imoveis: { label: 'Imóvel', plural: 'Imóveis', icon: Home },
  contas: { label: 'Conta bancária', plural: 'Contas bancárias', icon: Banknote },
  participacoes: { label: 'Participação social', plural: 'Participações sociais', icon: Building2 },
  veiculos: { label: 'Veículo', plural: 'Veículos', icon: Car },
  aforro: { label: 'Certificados de Aforro/Tesouro', plural: 'Aforro / Tesouro', icon: PiggyBank },
  outro: { label: 'Outro bem', plural: 'Outros bens', icon: Package },
};
