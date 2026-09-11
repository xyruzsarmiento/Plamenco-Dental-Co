-- RLS already enforces recall ownership and branch/provider scope, so this RPC
-- should execute with the caller's privileges instead of bypassing policies.
alter function public.mark_recall_needs_rescheduling(uuid) security invoker;
