-- Safe Disk IO bundle:
-- 1) rewrite init_data to use per-conversation LATERAL lookups (same limits /
--    filters; avoids full-org window sorts that spill to temp files)
-- 2) index for org+direction+timestamp polling
-- 3) shorten cron.job_run_details retention (7d -> 2d)

create index if not exists messages_org_direction_timestamp_idx
on public.messages
using btree (organization_id, direction, timestamp desc);

create or replace function public.init_data(
  p_organization_id uuid,
  p_limit integer default 200,
  p_per_conversation integer default 10,
  p_since timestamp with time zone default null,
  p_until timestamp with time zone default null
)
returns json
language plpgsql
stable
security invoker
set search_path to ''
as $function$
declare
  _messages json;
  _conversations json;
  _conversation_ids uuid[];
begin
  -- Same semantics as the prior window-function version (up to
  -- p_per_conversation recent messages per conversation, then the global
  -- p_limit most recent), but per-conversation LATERAL index lookups instead
  -- of sorting the full org message set into temp files (Disk IO).
  with limited as (
    select m.*
    from public.conversations c
    cross join lateral (
      select msg.*
      from public.messages msg
      where msg.conversation_id = c.id
        and msg.organization_id = p_organization_id
        and (p_since is null or msg.timestamp > p_since)
        and (p_until is null or msg.timestamp < p_until)
      order by msg.timestamp desc
      limit p_per_conversation
    ) m
    where c.organization_id = p_organization_id
    order by m.timestamp desc
    limit p_limit
  )
  select
    coalesce(json_agg(row_to_json(l.*)), '[]'::json),
    array_agg(distinct l.conversation_id)
  into _messages, _conversation_ids
  from limited l;

  select coalesce(json_agg(row_to_json(c.*)), '[]'::json)
  into _conversations
  from public.conversations c
  where c.id = any(_conversation_ids);

  return json_build_object(
    'conversations', _conversations,
    'messages', _messages
  );
end;
$function$;

-- pg_cron job created in declarative_schemas_limitations; retention only.
do $do$
declare
  _jobid bigint;
begin
  select jobid into _jobid from cron.job where jobname = 'delete-job-run-details';
  if _jobid is not null then
    perform cron.alter_job(
      _jobid,
      command := $cmd$delete from cron.job_run_details where end_time < now() - interval '2 days'$cmd$
    );
  end if;
end;
$do$;
