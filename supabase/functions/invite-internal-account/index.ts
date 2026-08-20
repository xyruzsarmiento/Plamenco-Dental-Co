import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type InternalRole = 'super_admin' | 'admin' | 'dentist' | 'associate_dentist' | 'staff'

type InvitePayload = {
  email?: string
  name?: string
  role?: InternalRole
  branchIds?: string[]
  providerProfileRequired?: boolean
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supportedRoles: InternalRole[] = ['super_admin', 'admin', 'dentist', 'associate_dentist', 'staff']

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const siteUrl = Deno.env.get('SITE_URL') ?? Deno.env.get('PUBLIC_SITE_URL') ?? ''

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Invitation service is not configured. Configure the Edge Function secrets before inviting accounts.' }, 500)
  }

  const authHeader = request.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: authUser, error: authError } = await userClient.auth.getUser()
  if (authError || !authUser.user) return json({ error: 'Authentication required.' }, 401)

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id, role, status, permissions')
    .eq('id', authUser.user.id)
    .maybeSingle()

  if (profileError) return json({ error: `Could not verify inviter permissions: ${profileError.message}` }, 500)

  const permissions = Array.isArray(profile?.permissions) ? profile.permissions : []
  const canInvite = profile?.role === 'super_admin' || permissions.includes('system_admin.manage') || permissions.includes('staff.manage')
  if (!canInvite || profile?.status !== 'active') {
    return json({ error: 'Not authorized to invite internal accounts.' }, 403)
  }

  let payload: InvitePayload
  try {
    payload = await request.json() as InvitePayload
  } catch {
    return json({ error: 'Invalid invitation payload.' }, 400)
  }

  const email = payload.email?.trim().toLowerCase()
  const name = payload.name?.trim()
  const role = payload.role
  const branchIds = [...new Set((payload.branchIds ?? []).filter(Boolean))]

  if (!email || !name || !role) return json({ error: 'Name, email, and role are required.' }, 400)
  if (!supportedRoles.includes(role)) return json({ error: 'Unsupported internal role.' }, 400)
  if (role === 'patient') return json({ error: 'Patient accounts cannot be created from Team & Access.' }, 400)

  if (branchIds.length) {
    const { data: validBranches, error: branchError } = await adminClient
      .from('branches')
      .select('id')
      .in('id', branchIds)
      .eq('status', 'active')

    if (branchError) return json({ error: `Could not validate branch assignments: ${branchError.message}` }, 500)
    const validIds = new Set((validBranches ?? []).map((branch) => String(branch.id)))
    const invalidIds = branchIds.filter((id) => !validIds.has(id))
    if (invalidIds.length) return json({ error: 'One or more selected branches are invalid or inactive.' }, 400)
  }

  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: siteUrl ? `${siteUrl.replace(/\/$/, '')}/reset-password` : undefined,
    data: {
      full_name: name,
      first_name: name,
      last_name: '',
      role,
      account_type: 'internal',
    },
  })

  const invitationRow = {
    email,
    full_name: name,
    role,
    branch_ids: branchIds,
    provider_profile_required: Boolean(payload.providerProfileRequired || role === 'dentist' || role === 'associate_dentist'),
    status: inviteError ? 'failed' : 'sent',
    error_message: inviteError?.message ?? '',
    invited_by: authUser.user.id,
  }

  const { data: invitation, error: rowError } = await adminClient
    .from('internal_account_invitations')
    .insert([invitationRow])
    .select('id, status, error_message')
    .single()

  if (inviteError) return json({ error: inviteError.message, invitation }, 400)
  if (rowError) return json({ error: `Invitation email was created but the audit record failed: ${rowError.message}` }, 500)
  if (!inviteData.user) return json({ error: 'Supabase did not return the invited user.' }, 500)

  const userId = inviteData.user.id

  const { error: profileUpsertError } = await adminClient.from('profiles').upsert({
    id: userId,
    full_name: name,
    email,
    role,
    status: 'active',
    permissions: [],
  }, { onConflict: 'id' })

  if (profileUpsertError) {
    return json({ error: `Invitation sent, but account profile provisioning failed: ${profileUpsertError.message}`, invitation }, 500)
  }

  if (role === 'dentist' || role === 'associate_dentist') {
    const { data: provider, error: providerError } = await adminClient
      .from('providers')
      .upsert({
        profile_id: userId,
        display_name: name,
        role,
        email,
        status: 'active',
      }, { onConflict: 'profile_id' })
      .select('id')
      .single()

    if (providerError || !provider) {
      return json({ error: `Invitation sent, but dentist profile provisioning failed: ${providerError?.message ?? 'Provider row missing.'}`, invitation }, 500)
    }

    if (branchIds.length) {
      const providerAssignments = branchIds.map((branchId, index) => ({
        provider_id: provider.id,
        branch_id: branchId,
        is_primary: index === 0,
        status: 'active',
      }))
      const { error: assignmentError } = await adminClient
        .from('provider_branch_assignments')
        .upsert(providerAssignments, { onConflict: 'provider_id,branch_id' })

      if (assignmentError) {
        return json({ error: `Invitation sent, but dentist branch assignment failed: ${assignmentError.message}`, invitation }, 500)
      }
    }
  } else if (branchIds.length) {
    const staffAssignments = branchIds.map((branchId, index) => ({
      profile_id: userId,
      branch_id: branchId,
      is_primary: index === 0,
      status: 'active',
    }))
    const { error: assignmentError } = await adminClient
      .from('staff_branch_assignments')
      .upsert(staffAssignments, { onConflict: 'profile_id,branch_id' })

    if (assignmentError) {
      return json({ error: `Invitation sent, but branch assignment failed: ${assignmentError.message}`, invitation }, 500)
    }
  }

  return json({
    invitation,
    account: {
      userId,
      email,
      role,
      branchIds,
      providerProfileCreated: role === 'dentist' || role === 'associate_dentist',
    },
  })
})
