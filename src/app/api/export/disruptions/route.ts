import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    return new Response('NEXT_PUBLIC_CONVEX_URL not configured', { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const gameIdsParam = searchParams.get('gameIds');
  const gameIdFilter = gameIdsParam
    ? new Set(gameIdsParam.split(',').filter(Boolean))
    : null;

  const client = new ConvexHttpClient(url);
  let actions = await client.query(api.steps.listAllActions, { limit: 5000 });

  if (gameIdFilter) {
    actions = actions.filter((a: any) => gameIdFilter.has(a.gameId));
  }

  const headers = [
    'gameId', 'actionNumber', 'disruptionId', 'disruptionName',
    'description', 'healthDamage', 'success', 'reasoning',
    'timestamp', 'attackerStepAtTime',
  ];

  const csvRows = [headers.join(',')];

  for (const a of actions) {
    const row = [
      a.gameId,
      a.actionNumber.toString(),
      a.disruptionId,
      csvEscape(a.disruptionName),
      csvEscape(a.description),
      a.healthDamage.toString(),
      a.success.toString(),
      csvEscape(a.reasoning),
      a.timestamp,
      a.attackerStepAtTime?.toString() ?? '',
    ];
    csvRows.push(row.join(','));
  }

  return new Response(csvRows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="browser-brawl-disruptions.csv"',
    },
  });
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
