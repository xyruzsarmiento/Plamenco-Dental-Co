# Supabase social authentication setup

Part 7 adds **patient-only** Google and Facebook authentication through Supabase Auth. Provider secrets are never stored in the frontend repository.

## 1. Supabase URL configuration

In **Supabase Dashboard → Authentication → URL Configuration**:

- Set the production **Site URL** to the deployed Plamenco Dental Co. origin.
- Add development redirect URLs such as `http://localhost:5173/login` and the actual local Vite origin you use.
- Add the production callback destination, for example `https://<your-production-domain>/login`.

The application calls `signInWithOAuth()` with `${window.location.origin}/login?oauth=callback`, so each deployed origin that may authenticate must be allowed by Supabase redirect configuration.

## 2. Google provider

In **Supabase Dashboard → Authentication → Providers → Google**:

1. Enable Google.
2. Create/configure the OAuth client in Google Cloud Console.
3. Use the callback URL shown by Supabase for the Google OAuth client redirect URI.
4. Put the Google Client ID and Client Secret only in the Supabase provider configuration.
5. Do not add the client secret to Vite environment variables or browser source code.

## 3. Facebook provider

In **Supabase Dashboard → Authentication → Providers → Facebook**:

1. Enable Facebook.
2. Configure a Facebook Login application in Meta for Developers.
3. Use the callback URL shown by Supabase as an allowed OAuth redirect URI.
4. Put the Facebook App ID and App Secret only in Supabase provider configuration.
5. Do not expose the App Secret in frontend source or Vite variables.

## 4. Security behavior implemented by the application

- Google/Facebook entry points are intended for **patients**.
- A social-authenticated session is never promoted to Staff, Dentist, Associate Dentist, or Super Admin from user-editable metadata.
- If a social-authenticated identity maps to an internal `profiles` role, the application rejects the social login and signs the session back out. Internal users must use clinic-managed credentials.
- New patient records are linked by the authenticated Supabase `auth_user_id`, not by blindly merging an email address.
- If the same email already belongs to a patient row with a different `auth_user_id`, the application refuses to auto-link it. Account linking must occur through supported Supabase identity linking rather than an email-string match.
- User-scoped in-memory query caches are cleared when social auth begins and when the user signs out/account context changes.

## 5. Patient onboarding after first social login

For a first-time social patient, the application uses verified provider metadata to establish the initial name/email where available and creates the patient record under the authenticated `auth_user_id`. Optional clinic fields that the provider does not supply (for example phone/date of birth) can then be completed from the patient's Profile page.

## 6. Verification checklist

Test separately on localhost and production:

- Email/password patient login
- Email/password Staff/Dentist/Super Admin login
- Google new patient
- Google returning patient
- Google cancellation/provider error
- Facebook new patient
- Facebook returning patient
- Facebook cancellation/provider error
- Logout and sign-in as a different patient
- Attempt social login for an internal clinic account and verify privileged access is rejected
- Forgot-password and reset-password redirects

If a provider reports `redirect_uri_mismatch`, compare the provider callback configured in Google/Meta with the exact callback URL shown in the Supabase provider settings, and verify the application origin is allowed in Supabase URL Configuration.
