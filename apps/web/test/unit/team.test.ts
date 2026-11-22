import { describe, expect, it } from 'vitest';
import { teamMemberIds, teamTaskIds } from '@/utils/team';
import type { TeamRecord } from '@/api/client';

const team: TeamRecord = {
  id: 'team_1',
  name: 'core',
  lead_agent_id: 'agt_lead',
  members: [
    { agent_id: 'agt_lead', role: 'lead', joined_at: '2026-01-01T00:00:00Z' },
    { agent_id: 'agt_a', role: 'member', joined_at: '2026-01-01T00:00:00Z' },
    { agent_id: 'agt_b', role: 'member', joined_at: '2026-01-01T00:00:00Z' },
  ],
  task_pool: ['tsk_1', 'tsk_2'],
};

describe('teamMemberIds', () => {
  it('excludes the lead by default (the lead is shown separately)', () => {
    expect(teamMemberIds(team)).toEqual(['agt_a', 'agt_b']);
  });

  it('can include the lead (used to hide already-joined agents)', () => {
    expect(teamMemberIds(team, { includeLead: true })).toEqual(['agt_lead', 'agt_a', 'agt_b']);
  });

  it('returns an empty list when members are missing', () => {
    expect(teamMemberIds({ id: 't', name: 'n', lead_agent_id: 'x' })).toEqual([]);
  });
});

describe('teamTaskIds', () => {
  it('reads the ORCH task_pool', () => {
    expect(teamTaskIds(team)).toEqual(['tsk_1', 'tsk_2']);
  });

  it('returns an empty list when the pool is missing', () => {
    expect(teamTaskIds({ id: 't', name: 'n', lead_agent_id: 'x' })).toEqual([]);
  });
});
