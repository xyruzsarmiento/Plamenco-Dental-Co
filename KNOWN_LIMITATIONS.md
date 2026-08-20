# Known Limitations

This file records known/unverified production limitations. It is not a failure list and must not be used to imply features are production verified.

- Full live RBAC/RLS matrix has not yet been executed against dedicated test accounts for every role.
- Cross-patient and cross-branch direct Supabase access still requires live verification.
- Payment gateway production credentials, signature verification and webhook replay behavior require provider-backed testing.
- SMS/email/Messenger delivery requires configured production providers; UI must not imply delivery without provider evidence.
- Backup existence and restore capability require evidence/rehearsal; repository configuration alone is not proof.
- Financial reconciliation against real clinic data has not yet been completed.
- Inventory ledger reconciliation against real opening balances and physical counts has not yet been completed.
- Treatment-plan scheduling/performed-treatment/billing handoff requires full end-to-end QA.
- Recall automation cadence, cooldown, quiet hours, reactivation rules and clinic intervals remain clinic decisions unless explicitly configured.
- Consent/legal wording, signature acceptance policy, guardian/minor workflow and retention requirements remain clinic decisions.
- No formal general ledger, tax filing engine, statutory payroll, insurance claim engine, KYC/biometric verification, AI diagnosis or automated treatment recommendation is provided.
- Odontogram/dental chart is intentionally not surfaced.
- Production domain ownership, Auth redirect configuration and final environment values require deployment verification.
