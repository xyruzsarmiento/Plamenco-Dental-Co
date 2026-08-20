# Staff Scheduling, Attendance, and Dentist Compensation

Part 24 preserves the existing separation between:

- staff accounts for login and internal access,
- provider profiles for dentists and associate dentists,
- provider branch assignments and schedules for appointment availability,
- attendance records for actual time in and time out,
- treatments for completed clinical work,
- provider payouts for compensation calculations,
- payroll compensation expenses for processed payouts.

## Attendance

Staff shifts are planned per staff member, branch, date, and time. Attendance records capture time in, time out, late minutes, absence, leave, reason, and recorder.

The current late grace period is 10 minutes. This is a clinic decision before production use.

## Provider Availability

Dentist availability continues to come from existing provider schedule blocks, branch assignments, and availability overrides. Attendance does not replace appointment availability; it only records actual workforce presence.

## Compensation

Provider workload is derived from completed treatments within a period. Draft payouts can use either:

- percentage of completed treatment value, or
- fixed amount per completed treatment.

Processed payouts create one linked `payroll_compensation` expense. The payout record stores the generated expense id so the clinic can see whether professional fees have already been processed.

Do not manually duplicate provider payout expenses.
