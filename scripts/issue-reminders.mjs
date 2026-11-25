const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const dryRun = process.env.DRY_RUN === 'true';

if (!token || !repository) {
  throw new Error('Faltan GITHUB_TOKEN o GITHUB_REPOSITORY');
}

const [owner, repo] = repository.split('/');
const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
const timezone = 'America/Hermosillo';

async function api(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API: ${response.status} ${options.method ?? 'GET'} ${path}`);
  }

  return response.json();
}

async function getAllPages(path) {
  const results = [];

  for (let page = 1; ; page++) {
    const separator = path.includes('?') ? '&' : '?';
    const batch = await api(`${path}${separator}per_page=100&page=${page}`);

    results.push(...batch);

    if (batch.length < 100) break;
  }

  return results;
}

function getToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const value = (type) => Number(parts.find((part) => part.type === type).value);

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
  };
}

function dayNumber(year, month, day) {
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function getDueDate(title) {
  const match = title.match(/(\d{2})\/(\d{2})\/(\d{4})\)?\s*$/);

  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    day,
    month,
    year,
    iso: [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-'),
    display: match[0].replace(/[()]/g, '').trim(),
  };
}

const today = getToday();
const todayNumber = dayNumber(today.year, today.month, today.day);

const messages = {
  3: 'Faltan 3 días para la fecha de entrega.',
  1: 'La fecha de entrega es mañana.',
  0: 'Hoy es la fecha límite de entrega.',
};

console.log(`SIMBO | Fecha local: ${today.day}/${today.month}/${today.year}`);
console.log(`Modo simulación: ${dryRun}`);

const issues = await getAllPages('/issues?state=open&labels=unidad-3');

let reviewed = 0;
let eligible = 0;
let sent = 0;
let duplicates = 0;
let omitted = 0;

for (const issue of issues) {
  if (issue.pull_request) continue;

  reviewed++;

  const due = getDueDate(issue.title);

  if (!due) {
    console.log(`#${issue.number}: sin fecha válida en el título`);
    omitted++;
    continue;
  }

  if (!issue.assignees?.length) {
    console.log(`#${issue.number}: sin responsables`);
    omitted++;
    continue;
  }

  const remaining = dayNumber(due.year, due.month, due.day) - todayNumber;

  console.log(`#${issue.number}: vence ${due.display}; faltan ${remaining} días`);

  const daysLate = -remaining;

  const isUpcomingReminder = Object.hasOwn(messages, remaining);

  const isOverdueReminder = remaining < 0 && (daysLate - 1) % 3 === 0;

  if (!isUpcomingReminder && !isOverdueReminder) {
    continue;
  }

  const reminderText = isOverdueReminder
    ? `⚠️ La fecha límite se superó hace ${daysLate} día${daysLate === 1 ? '' : 's'}. Por favor, actualicen el avance de la tarea y creen la Pull Request si aún no lo han hecho.`
    : messages[remaining];
  eligible++;

  // Identificador único por issue, plazo y tipo de aviso.
  const marker = `<!-- simbo-reminder:v1:${remaining}:${due.iso} -->`;

  const comments = await getAllPages(`/issues/${issue.number}/comments`);

  if (comments.some((comment) => comment.body?.includes(marker))) {
    console.log(`#${issue.number}: recordatorio ya enviado`);
    duplicates++;
    continue;
  }

  const mentions = issue.assignees.map((person) => `@${person.login}`).join(' ');

  const body = [
    `📅 **Recordatorio de SIMBO**`,
    '',
    mentions,
    '',
    reminderText,
    `**Fecha límite:** ${due.display}`,
    '',
    'Recuerden actualizar el avance de la issue y preparar',
    'la PR con sus pruebas y evidencias correspondientes.',
    '',
    marker,
  ].join('\n');

  if (dryRun) {
    console.log(`[SIMULACIÓN] Comentario para #${issue.number}:\n${body}`);
    continue;
  }

  await api(`/issues/${issue.number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });

  console.log(`#${issue.number}: recordatorio publicado`);
  sent++;
}

console.log('\nResumen:');
console.log(`Issues revisadas: ${reviewed}`);
console.log(`Recordatorios aplicables: ${eligible}`);
console.log(`Comentarios publicados: ${sent}`);
console.log(`Duplicados evitados: ${duplicates}`);
console.log(`Issues omitidas: ${omitted}`);
console.log(`Simulación: ${dryRun}`);
