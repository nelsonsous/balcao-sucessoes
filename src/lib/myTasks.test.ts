import { describe, expect, it } from 'vitest';
import { newCase, newTask } from './db';
import { groupMyTasks, isMine } from './myTasks';

const today = new Date(2026, 8, 17, 12);
const iso = (d: number) => {
  const x = new Date(today);
  x.setDate(x.getDate() + d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

describe('as minhas tarefas', () => {
  const c = newCase({ name: 'A', ref: 'BS-1', responsibleId: 'ana', stage: 'ativo' });
  const other = newCase({ name: 'B', ref: 'BS-2', responsibleId: 'rui', stage: 'ativo' });
  const archived = newCase({ name: 'C', ref: 'BS-3', responsibleId: 'ana', stage: 'arquivado' });

  it('uma tarefa sem responsável conta para o responsável do dossier', () => {
    expect(isMine(newTask(c.id, { assigneeId: '' }), c, 'ana')).toBe(true);
    expect(isMine(newTask(c.id, { assigneeId: 'rui' }), c, 'ana')).toBe(false);
    expect(isMine(newTask(other.id, { assigneeId: 'ana' }), other, 'ana')).toBe(true);
    expect(isMine(newTask(c.id), c, '')).toBe(false);
  });

  it('agrupa por urgência e ignora concluídas, obsoletas e dossiers não ativos', () => {
    const tasks = [
      newTask(c.id, { title: 'atrasada', dueDate: iso(-3), status: 'pendente' }),
      newTask(c.id, { title: 'hoje', dueDate: iso(0), status: 'em_curso' }),
      newTask(c.id, { title: 'semana', dueDate: iso(5), status: 'pendente' }),
      newTask(c.id, { title: 'proxima', dueDate: iso(30), status: 'aguarda' }),
      newTask(c.id, { title: 'sem prazo crítica', status: 'pendente', critical: true, phase: 'fiscal' }),
      newTask(c.id, { title: 'sem prazo', status: 'pendente', phase: 'abertura' }),
      newTask(c.id, { title: 'feita', dueDate: iso(-1), status: 'concluido' }),
      newTask(c.id, { title: 'obsoleta', dueDate: iso(-1), status: 'pendente', obsolete: true }),
      newTask(c.id, { title: 'do rui', dueDate: iso(1), status: 'pendente', assigneeId: 'rui' }),
    ];
    const groups = groupMyTasks(
      [
        { c, tasks },
        { c: other, tasks: [newTask(other.id, { title: 'minha noutro dossier', dueDate: iso(2), assigneeId: 'ana' })] },
        { c: archived, tasks: [newTask(archived.id, { title: 'arquivado', dueDate: iso(-9) })] },
      ],
      'ana',
      today,
    );
    const by = Object.fromEntries(groups.map((g) => [g.id, g.tasks.map((x) => x.t.title)]));
    expect(by.atrasadas).toEqual(['atrasada']);
    expect(by.hoje).toEqual(['hoje']);
    expect(by.semana).toEqual(['minha noutro dossier', 'semana']);
    expect(by.proximas).toEqual(['proxima']);
    expect(by.sem_prazo).toEqual(['sem prazo crítica', 'sem prazo']);
  });
});
