create function public.init_data(
  p_organization_id uuid,
  p_limit integer default 200,
  p_per_conversation integer default 10,
  p_since timestamptz default null,
  p_until timestamptz default null
)
returns json
language plpgsql
stable
security invoker
set search_path to ''
as $$
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

  -- Fetch conversations for the messages returned
  select coalesce(json_agg(row_to_json(c.*)), '[]'::json)
  into _conversations
  from public.conversations c
  where c.id = any(_conversation_ids);

  return json_build_object(
    'conversations', _conversations,
    'messages', _messages
  );
end;
$$;
