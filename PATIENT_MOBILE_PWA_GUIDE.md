# Patient Mobile / PWA Guide

## Target widths
Patient-facing flows must remain usable at 360 px, 390 px, and 430 px, plus tablet and desktop. Navigation should remain compact, touch-friendly, and avoid horizontal overflow.

## Installability
Part 42 adds `/manifest.json`, PWA install metadata, and `/sw.js`. Installation is progressive enhancement; core clinic workflows must continue to work if service-worker registration is unavailable.

## Cache safety
The service worker caches only same-origin public/static shell resources. It explicitly avoids portal/app/auth/API/storage/function paths. Never cache auth tokens, patient API JSON, signed URLs, payment callbacks, form submissions, or other sensitive records in broad persistent caches.

## Offline state
When the browser is offline, show an explicit offline banner. Do not claim current financial/clinical state is fresh. Payment, appointment mutation, medical-history writes, treatment-plan decisions, and form/signature submission require connectivity and must not be silently queued.

## Updates
Do not force an aggressive reload while a patient is signing a form, changing an appointment, or completing a payment. A future update prompt should allow the user to finish sensitive work first.

## Accessibility
Maintain visible focus, semantic labels, readable contrast, touch targets, and keyboard access. Mobile cards should replace wide tables where necessary.
