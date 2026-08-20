import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(join(root, path), 'utf8'));
  } catch (error) {
    fail(`${path} is missing or invalid JSON: ${error.message}`);
    return null;
  }
}

function walkFiles(relativeDir) {
  const start = join(root, relativeDir);
  if (!existsSync(start)) return [];
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      if (entry.isFile()) files.push(fullPath);
    }
  };
  visit(start);
  return files;
}

const packageJson = readJson('package.json');
if (packageJson) {
  for (const script of ['build', 'lint', 'verify:schema']) {
    if (!packageJson.scripts?.[script]) fail(`missing npm script: ${script}`);
  }
}

for (const doc of ['DEPLOYMENT_GUIDE.md', 'ENVIRONMENT_STRATEGY.md', 'STAGING_CHECKLIST.md', 'ROLLBACK_GUIDE.md', 'PRODUCTION_RELEASE_CHECKLIST.md', 'CHANGELOG.md']) {
  if (!existsSync(join(root, doc))) fail(`missing deployment document: ${doc}`);
}

const indexHtml = existsSync(join(root, 'index.html')) ? readFileSync(join(root, 'index.html'), 'utf8') : '';
if (/rel=["']canonical["']/.test(indexHtml)) {
  warn('index.html contains a canonical URL; confirm the production domain before release');
}

const vercel = readJson('vercel.json');
if (vercel) {
  const hasSpaRewrite = Array.isArray(vercel.rewrites)
    && vercel.rewrites.some((rewrite) => rewrite.source === '/(.*)' && rewrite.destination === '/');
  if (!hasSpaRewrite) fail('vercel.json is missing the SPA rewrite to /');

  const headerKeys = new Set((vercel.headers ?? []).flatMap((entry) => (entry.headers ?? []).map((header) => header.key)));
  for (const key of ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Permissions-Policy']) {
    if (!headerKeys.has(key)) warn(`vercel.json does not set ${key}`);
  }
}

const envExample = existsSync(join(root, '.env.example')) ? readFileSync(join(root, '.env.example'), 'utf8') : '';
for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_DEPLOYMENT_ENV', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET']) {
  if (!new RegExp(`^${name}=`, 'm').test(envExample)) fail(`.env.example is missing ${name}`);
}

const gitignore = existsSync(join(root, '.gitignore')) ? readFileSync(join(root, '.gitignore'), 'utf8') : '';
for (const marker of ['.env', '.env.*', '*.xlsx', '*.csv', 'database-dumps/', 'backups/', 'credentials/', '*.pem', '*.key']) {
  if (!gitignore.includes(marker)) fail(`.gitignore is missing ${marker}`);
}

try {
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  const forbidden = /(^|\/)(\.env|.*\.pem|.*\.key|.*\.p12|.*\.pfx|.*\.dump|.*\.backup|.*\.xlsx|.*\.xls|.*\.csv)$/i;
  for (const file of tracked) {
    if (forbidden.test(file)) fail(`tracked sensitive/local-data file pattern: ${file}`);
  }
} catch (error) {
  warn(`unable to inspect tracked files: ${error.message}`);
}

const publicFiles = new Set(walkFiles('public').map((file) => normalize(file).toLowerCase()));
const assetReferences = [];
for (const file of [...walkFiles('src'), join(root, 'index.html')].filter(existsSync)) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/["'(]((?:\/assets\/|\/favicon\.svg|\/icons\.svg)[^"'() ]+)/g)) {
    assetReferences.push({ file, reference: match[1] });
  }
}

for (const { file, reference } of assetReferences) {
  const withoutQuery = reference.split('?')[0];
  const expected = normalize(join(root, 'public', withoutQuery.replace(/^\//, ''))).toLowerCase();
  if (!publicFiles.has(expected)) {
    fail(`missing public asset ${reference} referenced from ${file}`);
  }
}

const edgeFunctions = ['invite-internal-account', 'meta-messenger-webhook', 'payment-gateway-webhook', 'process-communication-outbox', 'queue-appointment-reminders'];
for (const name of edgeFunctions) {
  if (!existsSync(join(root, 'supabase', 'functions', name, 'index.ts'))) fail(`missing Edge Function: ${name}`);
}

const cronFunctions = ['process-communication-outbox', 'queue-appointment-reminders'];
for (const name of cronFunctions) {
  const path = join(root, 'supabase', 'functions', name, 'index.ts');
  if (existsSync(path) && !readFileSync(path, 'utf8').includes('CRON_SECRET')) {
    fail(`${name} is missing CRON_SECRET protection`);
  }
}

if (!existsSync(join(root, '.github', 'workflows'))) {
  warn('no GitHub Actions workflow directory found');
}

for (const message of warnings) console.warn(`deployment readiness warning: ${message}`);
if (failures.length) {
  for (const message of failures) console.error(`deployment readiness failed: ${message}`);
  process.exit(1);
}

console.log('deployment readiness verification passed');
