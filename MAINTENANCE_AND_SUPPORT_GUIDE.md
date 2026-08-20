# Maintenance and Support Guide

## Severity
Critical: patient-data exposure/cross-access, payment duplication, corrupted financial/inventory data, authentication outage, or equivalent integrity/security failure.

High: a major clinic workflow is unavailable with no safe workaround.

Medium: noncritical workflow defect with a safe workaround.

Low: visual/copy/usability polish that does not affect integrity or access control.

## Reporting a bug
Record the role, branch, route, time, expected result, actual result, reproducible steps, screenshots with sensitive data removed, and related record identifiers only when needed for authorized troubleshooting. Never send passwords, tokens or provider secrets.

## Response workflow
1. Confirm scope and severity.
2. Protect data first; disable an unsafe workflow if necessary.
3. Reproduce in a controlled environment where possible.
4. Fix on the repository with reviewable changes.
5. For database defects, prefer a forward repair migration.
6. Re-run relevant tests and deployment checks.
7. Record release/fix notes.

## Provider issues
Payment, email, SMS, Messenger and scheduled-report failures must preserve provider truth. A queued request is not automatically Paid, Sent or Delivered.

## Data corrections
Use audited application/database procedures. Never silently rewrite historical financial, clinical, consent, inventory or audit history.

## Support boundary
Production credentials, provider accounts, billing relationships, backup ownership, retention and clinic policy remain the responsibility of the designated clinic/technical owners.
