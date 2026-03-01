import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    return new Response('NEXT_PUBLIC_CONVEX_URL not configured', { status: 500 });
  }

  const client = new ConvexHttpClient(url);
  const sessions = await client.query(api.sessions.list, { limit: 1000 });

  const headers = [
    'gameId', 'taskId', 'taskLabel', 'taskDescription', 'taskStartUrl',
    'difficulty', 'mode', 'phase', 'winner', 'winReason',
    'healthFinal', 'durationSeconds', 'attackerModel', 'defenderModel',
    'startedAt', 'endedAt',
  ];

  const csvRows = [headers.join(',')];

  for (const s of sessions) {
    const row = [
      s.gameId,
      s.taskId,
      s.taskLabel,
      csvEscape(s.taskDescription),
      s.taskStartUrl,
      s.difficulty,
      s.mode,
      s.phase,
      s.winner ?? '',
      s.winReason ?? '',
      s.healthFinal?.toString() ?? '',
      s.durationSeconds?.toString() ?? '',
      s.attackerModel,
      s.defenderModel,
      s.startedAt,
      s.endedAt ?? '',
    ];
    csvRows.push(row.join(','));
  }

  return new Response(csvRows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="browser-brawl-sessions.csv"',
    },
  });
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
