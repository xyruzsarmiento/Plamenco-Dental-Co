import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type InternalRole = 'super_admin' | 'dentist' | 'associate_dentist' | 'staff'
type ResendPayload = { invitationId?: string }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders })
}

function resolveInviteRedirectUrl() {
  const configuredUrl = [Deno.env.get('SITE_URL'), Deno.env.get('PUBLIC_SITE_URL'), Deno.env.get('APP_URL')]
    .find((value) => Boolean(value?.trim()))?.trim()
  if (!configuredUrl) return { error: 'Invitation service is not configured with an application URL.' }
  try {
    const parsed = new URL(configuredUrl)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      return { error: 'Invitation service has an invalid application URL.' }
    }
    return { redirectTo: `${configuredUrl.replace(/\/+$/, '')}/accept-invite` }
  } catch {
    return { error: 'Invitation service has an invalid application URL.' }
  }
}

async function findAuthUserByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const match = data.users.find((user) => user.email?.trim().toLowerCase() === email)
    if (match) return match
    if (data.users.length < 1000) return null
  }
  return null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const inviteRedirect = resolveInviteRedirectUrl()
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Invitation service is not configured.' }, 500)
  if (inviteRedirect.error) return json({ error: inviteRedirect.error }, 500)

  const authHeader = request.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user) return json({ error: 'Authentication required.' }, 401)

  const { data: inviter, error: inviterError } = await adminClient.from('profiles').select('role, status').eq('id', authData.user.id).maybeSingle()
  if (inviterError) return json({ error: 'Could not verify inviter permissions.' }, 500)
  if (inviter?.role !== 'super_admin' || inviter.status !== 'active') return json({ error: 'Only an active Super Admin can resend internal invitations.' }, 403)

  let payload: ResendPayload
  try { payload = await request.json() as ResendPayload } catch { return json({ error: 'Invalid recovery payload.' }, 400) }
  const invitationId = payload.invitationId?.trim()
  if (!invitationId) return json({ error: 'An invitation record is required.' }, 400)

  const { data: invitation, error: invitationError } = await adminClient.from('internal_account_invitations').select('id, email, full_name, role, status').eq('id', invitationId).maybeSingle()
  if (invitationError) return json({ error: 'Unable to load the invitation record.' }, 500)
  if (!invitation) return json({ error: 'Invitation record not found.' }, 404)
  if (!['pending', 'sent', 'failed', 'cancelled'].includes(invitation.status)) return json({ error: 'This invitation is already accepted or cannot be recovered.' }, 409)

  const email = String(invitation.email ?? '').trim().toLowerCase()
  const role = invitation.role as InternalRole
  const authUser = await findAuthUserByEmail(adminClient, email)
  if (!authUser) return json({ error: 'The original authenticated account could not be found. No new account was created.' }, 404)

  const { data: profile, error: profileError } = await adminClient.from('profiles').select('id, email, role, status').eq('id', authUser.id).maybeSingle()
  if (profileError) return json({ error: 'Unable to verify the existing clinic profile.' }, 500)
  if (!profile || profile.email?.trim().toLowerCase() !== email || profile.role !== role) return json({ error: 'The existing clinic profile does not match this invitation. No changes were made.' }, 409)
  if (profile.status === 'active') return json({ error: 'This clinic account is already active. No new invitation was sent.', state: 'active' }, 409)
  if (profile.status !== 'inactive') return json({ error: 'This clinic account is not eligible for invitation recovery.', state: profile.status }, 409)

  const { data: inviteData, error: resendError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteRedirect.redirectTo,
    data: { full_name: invitation.full_name, first_name: invitation.full_name, last_name: '', role, account_type: 'internal' },
  })
  if (resendError || !inviteData.user) return json({ error: resendError?.message ?? 'Supabase could not resend the invitation. No clinic records were changed.' }, 400)

  const { data: updatedInvitation, error: updateError } = await adminClient.from('internal_account_invitations').update({ status: 'sent', error_message: '', invited_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', invitationId).select('id, status, invited_at').single()
  if (updateError) return json({ error: `Invitation was sent, but its audit record could not be updated: ${updateError.message}` }, 500)
  return json({ invitation: updatedInvitation, account: { userId: authUser.id, email, role } })
})
