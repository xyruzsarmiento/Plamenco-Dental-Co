# Management Automation Guide

Part 43 adds scheduling and delivery-history infrastructure around the existing reports architecture. It does not create a second financial calculation engine.

## Principles

- Existing report definitions and trusted report RPCs/views remain the source of business metrics.
- Schedules are created disabled until recipients and timing are explicitly configured.
- All clinic scheduling semantics use `Asia/Manila`.
- A queued run is not a generated report.
- A generated report is not a delivered report.
- Email `Sent` and `Delivered` states must come from provider-backed delivery processing.
- Generated management files must remain private.

## Schedule lifecycle

1. Create a disabled schedule.
2. Configure explicit recipients and schedule timing.
3. Revalidate permissions/scope.
4. Enable the schedule.
5. Trusted server-side scheduler creates an idempotent run for the exact period.
6. Trusted report worker uses the existing report definitions to generate the selected format.
7. Delivery worker creates per-recipient delivery attempts through the existing communication/email infrastructure.
8. Provider callbacks/status updates move individual deliveries to Sent/Delivered/Failed/Bounced.
9. Historical runs and attempts are preserved.

## Current foundation

The repository now includes `management_report_schedules`, `management_report_runs`, and `management_report_deliveries`, plus an internal Management Automation workspace. No cron provider, PDF worker, Excel worker, or email provider is claimed active by this foundation alone.

## Financial language

Keep Billed, Collections, Refunds, Receivables, Expenses, and Net Cash Movement distinct. Accepted treatment estimates are not revenue or receivables. Collections less recorded expenses must not be labeled Net Profit.
