# Recall Communication Rules

Recall communication reuses the existing communication preferences, templates, delivery logs, outbox, and provider configuration. It does not create a second sender.

Only channels that are configured, have a usable destination, and are permitted by the patient's preferences may be used. External credentials remain server-side.

Every external reminder must have a stable idempotency key. Repeated UI clicks, worker retries, and concurrent staff actions must not generate duplicate sends. Cooldown, reminder sequence count, quiet hours, and automated timing remain clinic decisions and are not hardcoded.

`queued`, `sent`, `delivered`, and `failed` must reflect the existing provider-backed delivery pipeline. A UI click is not `sent`, and `sent` must not be promoted to `delivered` without provider evidence.

Manual phone calls and walk-in discussions are stored separately as recall contact attempts and must never be presented as provider delivery events.

Bulk messaging, if enabled later, must preview patient count, channel, template, and scope before confirmation and must report partial failures rather than a single blanket success message.
