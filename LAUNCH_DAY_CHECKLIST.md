# Launch Day Checklist

Do not mark an item complete without evidence.

## Release and deployment
- [ ] Approved commit identified
- [ ] `npm run build` passed
- [ ] `npm run lint` passed
- [ ] `npm run verify:schema` passed if required
- [ ] `npm run verify:deployment` passed if required
- [ ] Vercel production deployment succeeded
- [ ] Production domain resolves over HTTPS
- [ ] Direct route refresh works
- [ ] Auth redirect URLs verified

## Database and security
- [ ] Required migrations applied in order
- [ ] No migration errors left unresolved
- [ ] RLS/live cross-patient and cross-role access checks completed
- [ ] Sensitive storage buckets are private
- [ ] No service-role/provider secret exposed to frontend
- [ ] Backup existence verified
- [ ] Restore responsibility and incident contacts confirmed

## Clinic configuration
- [ ] Branches confirmed
- [ ] Services/prices/durations confirmed
- [ ] Providers/branch assignments/schedules confirmed
- [ ] Staff/admin accounts and permissions confirmed
- [ ] Appointment policies confirmed
- [ ] Forms/templates confirmed
- [ ] Recall rules confirmed if enabled
- [ ] Operational task automation confirmed if enabled
- [ ] Management report schedules confirmed if enabled

## Providers
- [ ] Payment provider configured and live verification tested if enabled
- [ ] Email configured and real provider state tested if enabled
- [ ] SMS configured and real provider state tested if enabled
- [ ] Messenger configured and real provider state tested if enabled

## Smoke test
- [ ] Landing
- [ ] Login
- [ ] Patient Portal
- [ ] Admin / Super Admin
- [ ] Front Desk
- [ ] Dentist
- [ ] Appointments
- [ ] Patients
- [ ] Clinical
- [ ] Billing
- [ ] Inventory
- [ ] Expenses
- [ ] Reports
- [ ] Recall
- [ ] Tasks
- [ ] Management Automation

## Release decision
- [ ] No unresolved Critical blocker
- [ ] Client acceptance recorded
- [ ] Release status approved for `v1.0.0`
