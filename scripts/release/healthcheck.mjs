// Readiness includes a PostgreSQL ping; no response body or credentials are logged.
try {
  const response = await fetch('http://127.0.0.1:3001/api/health', { signal: AbortSignal.timeout(4000) });
  const body = await response.json();
  if (!response.ok || body.status !== 'ok' || body.dataSource !== 'database' || body.database !== 'ok') process.exitCode = 1;
} catch { process.exitCode = 1; }
