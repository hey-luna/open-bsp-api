-- Notify Luna when Meta (or dispatcher) sets delivered / failed / read on an
-- outgoing WhatsApp message. Compact callback is built in luna-outbound-status.
create trigger handle_outgoing_status_to_luna
after update
on public.messages
for each row
when (
  new.direction = 'outgoing'::public.direction
  and new.service = 'whatsapp'::public.service
  and (
    (
      (old.status ->> 'failed') is distinct from (new.status ->> 'failed')
      and (new.status ->> 'failed') is not null
    )
    or (
      (old.status ->> 'delivered') is distinct from (new.status ->> 'delivered')
      and (new.status ->> 'delivered') is not null
    )
    or (
      (old.status ->> 'read') is distinct from (new.status ->> 'read')
      and (new.status ->> 'read') is not null
    )
  )
)
execute function public.edge_function('/luna-outbound-status', 'post');
