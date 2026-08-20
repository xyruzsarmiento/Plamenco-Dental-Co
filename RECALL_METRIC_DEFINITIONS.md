# Recall Metric Definitions

**Due Recall** — non-terminal recall with a recorded due date equal to the Asia/Manila business date.

**Overdue Recall** — non-terminal recall with a recorded due date before the Asia/Manila business date. This is an operational timing state, not medical urgency.

**Contacted Recall** — recall with a persisted contact attempt/outcome showing actual contact activity. A frontend click alone is not contact.

**Booked Recall** — recall explicitly linked to a relevant existing appointment. An unrelated future appointment does not automatically qualify.

**Completed Recall** — recall explicitly completed through trusted workflow after relevant follow-up has actually been satisfied.

**Recall Booking Rate** — must use one documented denominator. Recommended operational definition when enabled: booked recalls / eligible due recalls within the selected period. Do not mix this with contact-based conversion.

**Open Follow-Up** — follow-up record not in completed, dismissed, or cancelled state.

**Overdue Follow-Up** — open follow-up with a recorded due date before the Asia/Manila business date.

**Reactivation Candidate** — must be based on a clinic-configured inactivity rule. No default six-month or twelve-month definition exists.

Recall metrics are operational. Estimated treatment value must not be labeled as revenue or collections.
