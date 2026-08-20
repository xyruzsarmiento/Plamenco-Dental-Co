# Plamenco Dental Co. Super Admin Guide

Super Admin controls affect security, finances, reports, and clinic operations.

## Responsibilities

- Maintain branch details for Pulilan and Plaridel.
- Invite and manage clinic accounts through Supabase Auth flow.
- Assign least-privilege roles and permissions.
- Configure dentists, associate dentists, staff, schedules, services, and prices.
- Review inventory, suppliers, opening balances, and reconciliation status.
- Configure expenses, payment methods, communications, and integrations.
- Review reports, audit logs, system health, backups, and launch blockers.
- Protect the final active Super Admin account from accidental deactivation.

## Production Bootstrap

Do not hardcode credentials or create shared default admin users. Create the first Super Admin through a secure Supabase Auth invitation/bootstrap process, verify email ownership, then remove temporary bootstrap access.
