import type { TeamRecord } from '@/api/client';

/**
 * Agent IDs of a team's members, in join order.
 *
 * ORCH stores the lead as a member with role `lead`; it is shown separately in the UI, so it is
 * excluded unless `includeLead` is set (e.g. to avoid offering the lead as a new member).
 */
export function teamMemberIds(team: TeamRecord, options: { includeLead?: boolean } = {}): string[] {
  const members = team.members ?? [];
  return members
    .filter((member) => options.includeLead || member.role !== 'lead')
    .map((member) => member.agent_id);
}

/** Task IDs in the team's shared task pool. */
export function teamTaskIds(team: TeamRecord): string[] {
  return team.task_pool ?? [];
}
