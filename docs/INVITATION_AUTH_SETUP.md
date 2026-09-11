# Internal Invitation Auth Setup

The internal invitation Edge Function builds its callback as:

```text
<configured application URL>/accept-invite
```

It reads `SITE_URL` first, then `PUBLIC_SITE_URL`, then `APP_URL`. The selected value must be an `http(s)` application origin without credentials, query parameters, or fragments. If none is configured or the value is invalid, the function rejects the invitation before sending email.

## Local development

Frontend:

```text
http://localhost:5173
```

Set the Edge Function secret:

```text
SITE_URL=http://localhost:5173
```

Configure Supabase Auth with:

```text
Site URL: http://localhost:5173
Additional Redirect URL: http://localhost:5173/accept-invite
```

Do not use `http://localhost:3000` for this Vite application. Do not manually edit invitation URLs after receiving them; the Supabase callback code must be exchanged on `/accept-invite` as delivered.

## Production

Use the deployed HTTPS application origin for `SITE_URL`, the Supabase Auth Site URL, and the matching `/accept-invite` Additional Redirect URL. Do not make a localhost value a production default.

## Acceptance behavior

`AcceptInvitePage` keeps the callback parameters in the address bar until `exchangeCodeForSession` succeeds. Only then are the parameters removed from the visible URL. After the session is established, the invited user sets a password and calls `accept_own_internal_invitation()` to activate the internal profile.
