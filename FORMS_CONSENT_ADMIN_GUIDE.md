# Forms & Consent Administration Guide

## Scope

Forms & Consent extends the Part 36 intake model. It does not create a second patient, document, consent, or signature system. Clinic staff must supply and approve form wording; the application does not generate legal language or medical clearance.

## Draft

Authorized management users create a template and version 1 as a draft. Draft versions are editable, cannot be assigned to patients, and are not valid signed-consent records.

## Publish

A draft may be published only after required metadata and content are present. Publishing records the publisher and timestamp, marks the version immutable, and makes it the template's current version for new assignments. A later wording change requires a new version.

## Create New Version

A new draft version is cloned from the latest version so clinic staff can deliberately edit it. Existing published versions and signed patient submissions remain unchanged. Publishing the new draft does not rewrite an older patient's signed copy.

## Archive

Archiving stops new assignment of the template. Existing assignments, signed submissions, content snapshots, and signature references are preserved.

## Assignment

Only published versions may be assigned. Manual assignment records the patient, exact template version, actor, and optional appointment, clinical visit, branch, treatment-plan, or treatment linkage. Repeated assignment of the same patient/version/appointment/visit context is treated idempotently.

## Patient Signing

The patient sees only versions assigned to their own patient record. A version explicitly configures one of three methods: no signature/acknowledgement, typed-name acknowledgement, or drawn signature. Drawn signatures use the private `consent-signatures` storage bucket. Submission stores an immutable copy of the exact version content.

## Decline

Decline is a final historical result, not a deletion. It records a declined submission and finalizes the assignment without fabricating a signature.

## Front Desk and Dentist Use

Front-desk workflows should consume concise assignment status for operational completeness. Full sensitive content and signatures require stronger clinical or management access. Dentist workflows may inspect relevant authorized consent before treatment but the application never labels a patient medically or legally cleared.

## Print / PDF

A print/PDF workflow must always render the immutable `form_content_snapshot`, version metadata, patient context, signature method, signature artifact when applicable, and signed timestamp. It must not rebuild an old signed document from the current template. Any stored PDF must remain private.

## Historical Handling

Historical imports without evidence of consent stay `No recorded consent`. Missing historical version/provider/branch data remains unknown rather than being mapped to current data.
