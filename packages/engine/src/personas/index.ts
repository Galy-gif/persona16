import type { AgentType, PersonaSpec } from '../types';
import { NT_PERSONAS } from './nt';
import { NF_PERSONAS } from './nf';
import { SJ_PERSONAS } from './sj';
import { SP_PERSONAS } from './sp';

export const PERSONAS: PersonaSpec[] = [
  ...NT_PERSONAS,
  ...NF_PERSONAS,
  ...SJ_PERSONAS,
  ...SP_PERSONAS,
];

const byType = new Map(PERSONAS.map((p) => [p.type, p]));

export function getPersona(type: AgentType): PersonaSpec {
  const p = byType.get(type);
  if (!p) throw new Error(`unknown persona: ${type}`);
  return p;
}
