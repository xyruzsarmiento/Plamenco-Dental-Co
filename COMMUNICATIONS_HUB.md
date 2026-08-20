# Communications Hub V2

Part 25 keeps one patient communication layer:

Business event -> template resolution -> recipient and consent check -> channel selection -> outbox -> provider -> delivery history.

## Channel Rules

Supported channels are SMS, email, Messenger, and in-app portal notifications. Patient preferences and channel reachability are checked before a message is sent or queued.

Provider credentials are server-side only. The React app can mark provider readiness for operations, but it does not store API keys or call SMS/email/Messenger providers directly.

## Internal vs External

Internal notifications stay in the notification center. Patient-facing communications stay in communication delivery logs and outbox records.

## Manual Messaging

Manual messages use the same template, consent, channel availability, and outbox path as automated appointment/payment messages. Manual sends are marked with `dispatch_mode = manual` and `sent_by`.

## Retry

Failed or queued provider jobs can be retried. Retry metadata is stored on both delivery logs and outbox records, including attempt count, max attempts, next retry, and last retry timestamps.

## Messenger

Messenger delivery is prepared through the Meta provider adapter and webhook foundation. Production use still depends on Meta page connection, recipient PSIDs, policy-compliant message tags, and approved app configuration.
