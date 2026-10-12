-- Meta WhatsApp timestamps are Unix seconds; preserve payload array order for
-- same-second inbound parts (Luna batchParts) without rewriting Meta time.
alter table public.messages
add column webhook_index integer;
