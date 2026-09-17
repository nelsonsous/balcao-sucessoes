// Validação do NIF português (algoritmo do dígito de controlo, módulo 11).

const VALID_PREFIXES = [
  '1', '2', '3', // pessoas singulares
  '45', // singular não residente
  '5', // pessoas coletivas
  '6', // administração pública
  '70', '74', '75', // heranças indivisas
  '71', '72', '77', '78', '79', // não residentes, fundos, etc.
  '8', // empresário em nome individual (antigo)
  '90', '91', '98', '99', // condomínios, sociedades irregulares, etc.
];

export type NifCheck = { valid: true; kind: string } | { valid: false; reason: string };

export function checkNif(raw: string): NifCheck {
  const nif = (raw ?? '').replace(/\s+/g, '');
  if (!nif) return { valid: false, reason: 'Vazio' };
  if (!/^\d{9}$/.test(nif)) return { valid: false, reason: 'O NIF tem 9 dígitos' };
  if (!VALID_PREFIXES.some((p) => nif.startsWith(p))) {
    return { valid: false, reason: 'Prefixo inválido' };
  }
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(nif[i]) * (9 - i);
  const mod = sum % 11;
  const check = mod < 2 ? 0 : 11 - mod;
  if (check !== Number(nif[8])) return { valid: false, reason: 'Dígito de controlo errado' };
  return { valid: true, kind: nifKind(nif) };
}

function nifKind(nif: string): string {
  if (/^(70|74|75)/.test(nif)) return 'Herança indivisa';
  if (/^[123]/.test(nif) || nif.startsWith('45')) return 'Pessoa singular';
  if (nif.startsWith('5')) return 'Pessoa coletiva';
  if (nif.startsWith('6')) return 'Administração pública';
  return 'Outra entidade';
}
