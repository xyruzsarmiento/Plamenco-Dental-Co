import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type InvitePayload = {
  email?: string
  name?: string
  role?: 'super_admin' | 'admin' | 'dentist' | 'associate_dentist' | 'staff'
  branchIds?: string[]
  providerProfileRequired?: boolean
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const siteUrl = Deno.env.get('SITE_URL') ?? Deno.env.get('PUBLIC_SITE_URL') ?? ''

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return Response.json({ error: 'Invitation service is not configured.' }, { status: 500, headers: corsHeaders })
  }

  const authHeader = request.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: authUser } = await userClient.auth.getUser()
  if (!authUser.user) return Response.json({ error: 'Authentication required.' }, { status: 401, headers: corsHeaders })

  const { data: profile } = await adminClient
    .from('profiles')
    .select('id, role, status, permissions')
    .eq('id', authUser.user.id)
    .maybeSingle()

  const permissions = Array.isArray(profile?.permissions) ? profile.permissions : []
  const canInvite = profile?.role === 'super_admin' || permissions.includes('system_admin.manage') || permissions.includes('staff.manage')
  if (!canInvite || profile?.status !== 'active') {
    return Response.json({ error: 'Not authorized to invite internal accounts.' }, { status: 403, headers: corsHeaders })
  }

  const payload = await request.json() as InvitePayload
  const email = payload.email?.trim().toLowerCase()
  const name = payload.name?.trim()
  const role = payload.role
  if (!email || !name || !role) return Response.json({ error: 'Name, email, and role are required.' }, { status: 400, headers: corsHeaders })

  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: siteUrl ? `${siteUrl.replace(/\/$/, '')}/reset-password` : undefined,
    data: { full_name: name, role },
  })

  const invitationRow = {
    email,
    full_name: name,
    role,
    branch_ids: payload.branchIds ?? [],
    provider_profile_required: Boolean(payload.providerProfileRequired || role === 'dentist' || role === 'associate_dentist'),
    status: inviteError ? 'failed' : 'sent',
    error_message: inviteError?.message ?? '',
    invited_by: authUser.user.id,
  }

  const { data: invitation, error: rowError } = await adminClient
    .from('internal_account_invitations')
    .insert([invitationRow])
    .select('id, status')
    .single()

  if (inviteError || rowError) {
    return Response.json({ error: inviteError?.message ?? rowError?.message ?? 'Invitation failed.' }, { status: 500, headers: corsHeaders })
  }

  if (inviteData.user) {
    await adminClient.from('profiles').upsert({
      id: inviteData.user.id,
      full_name: name,
      email,
      role,
      status: 'invited',
      permissions: [],
    })
  }

  return Response.json({ invitation }, { headers: corsHeaders })
})
