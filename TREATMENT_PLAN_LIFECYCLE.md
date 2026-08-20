# Treatment Plan Lifecycle

## Plan statuses

- `draft` — editable working plan; not patient-approved.
- `presented` — plan has been presented and may receive a patient decision.
- `accepted` — all active decision items are accepted.
- `partially_accepted` — accepted and declined items coexist.
- `declined` — all decision items are declined.
- `superseded` — preserved historical version replaced by a materially changed version.
- `cancelled` — administrative end state where clinic policy permits it; history remains preserved.

## Item statuses

- `pending` — no patient decision recorded.
- `accepted` — patient accepted the recommended item; not yet performed.
- `declined` — patient declined the item; item remains historical.
- `scheduled` — accepted item linked to an appointment.
- `completed` — actual performed-treatment linkage has been recorded.
- `cancelled` — scheduling/plan workflow ended without treating the item as completed.

## Integrity rules

Acceptance does not create an invoice, receivable, payment, collection, revenue event, or completed treatment. Appointment cancellation/no-show does not automatically decline an accepted item. Material changes after presentation/acceptance require a new/superseding version. Declined and superseded history is not deleted.

## Visibility

Patient-facing views may show patient-facing notes and quoted estimate data. Internal clinical notes remain restricted. RLS is authoritative; route/UI filtering is not considered authorization.
