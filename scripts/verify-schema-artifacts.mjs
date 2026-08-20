import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const migrationsDir = join(root, 'supabase', 'migrations');

const requiredFiles = [
  'DATABASE_ARCHITECTURE.md',
  'DATABASE_SOURCE_OF_TRUTH.md',
  'RLS_POLICY_MATRIX.md',
  'DATABASE_MIGRATION_GUIDE.md',
  'DATABASE_INTEGRITY_CHECKS.md',
  'supabase/migrations/20260818_023_database_integrity_schema_consolidation.sql',
];

const requiredSqlMarkers = [
  'create or replace function public.has_profile_permission(permission_key text)',
  'create or replace function public.profile_has_active_branch(p_branch_id text)',
  'create or replace function public.run_database_integrity_checks()',
  'appointments_time_order_check',
  'invoices_balance_consistency_check',
  'payments_amount_consistency_check',
  'communication_preferences_read_self_or_manage',
  'clinical_amendments_write_clinical_authorized',
  'prescriptions_write_clinical_authorized',
  'audit_logs_read_authorized',
  'grant execute on function public.run_database_integrity_checks() to authenticated',
];

const requiredMigrationNames = [
  '20260818_001_roles_branches_providers_foundation.sql',
  '20260818_002_patient_management_import_foundation.sql',
  '20260818_003_advanced_appointment_management.sql',
  '20260818_007_billing_payments_patient_accounts.sql',
  '20260818_008_branch_inventory_management.sql',
  '20260818_010_enterprise_reports_analytics.sql',
  '20260818_020_communications_hub_v2.sql',
  '20260818_022_backup_restore_system_health.sql',
  '20260818_023_database_integrity_schema_consolidation.sql',
];

function fail(message) {
  console.error(`schema verification failed: ${message}`);
  process.exitCode = 1;
}

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    fail(`missing required file ${file}`);
  }
}

if (!existsSync(migrationsDir)) {
  fail('missing supabase/migrations directory');
} else {
  const migrationNames = new Set(readdirSync(migrationsDir));
  for (const name of requiredMigrationNames) {
    if (!migrationNames.has(name)) {
      fail(`missing migration ${name}`);
    }
  }

  const consolidationPath = join(migrationsDir, '20260818_023_database_integrity_schema_consolidation.sql');
  if (existsSync(consolidationPath)) {
    const sql = readFileSync(consolidationPath, 'utf8').toLowerCase();
    for (const marker of requiredSqlMarkers) {
      if (!sql.includes(marker.toLowerCase())) {
        fail(`missing SQL marker: ${marker}`);
      }
    }
    if (/\bdrop\s+table\b|\btruncate\s+table\b|\balter\s+table\s+\S+\s+drop\s+column\b/.test(sql)) {
      fail('consolidation migration contains destructive DDL');
    }
  }
}

if (!process.exitCode) {
  console.log('schema verification passed');
}
