import type { ModerationAppeal, ModerationReport } from "../../../src/lib/moderationTypes.js";
import { getUserById } from "../db/engine.js";

async function usernameFor(userId: string, cache: Map<string, string>): Promise<string> {
  const hit = cache.get(userId);
  if (hit) return hit;
  const u = await getUserById(userId);
  const name = u?.username?.trim() || "—";
  cache.set(userId, name);
  return name;
}

export type AdminReportRow = ModerationReport & {
  reportedUsername: string;
  reporterUsername: string;
};

export type AdminAppealRow = ModerationAppeal & {
  username: string;
};

export async function enrichReportsForAdmin(reports: ModerationReport[]): Promise<AdminReportRow[]> {
  const cache = new Map<string, string>();
  return Promise.all(
    reports.map(async r => ({
      ...r,
      reportedUsername: await usernameFor(r.reportedUserId, cache),
      reporterUsername: await usernameFor(r.reporterId, cache),
    })),
  );
}

export async function enrichAppealsForAdmin(appeals: ModerationAppeal[]): Promise<AdminAppealRow[]> {
  const cache = new Map<string, string>();
  return Promise.all(
    appeals.map(async a => ({
      ...a,
      username: await usernameFor(a.userId, cache),
    })),
  );
}

export function filterReportsByQuery(rows: AdminReportRow[], q: string): AdminReportRow[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    r =>
      r.id.toLowerCase().includes(needle) ||
      r.reporterId.toLowerCase().includes(needle) ||
      r.reportedUserId.toLowerCase().includes(needle) ||
      r.reportedUsername.toLowerCase().includes(needle) ||
      r.reporterUsername.toLowerCase().includes(needle),
  );
}
