-- Already applied live on open-bsp-luna: luna-whatsapp-batch-flush loads
-- recent messages with
--   WHERE organization_id + contact_address + service
--   ORDER BY timestamp DESC LIMIT 10
-- Without this index Postgres walked messages_timestamp_idx backward over
-- ~230k rows and hit statement timeout (~2 min welcome latency).
-- IF NOT EXISTS keeps re-apply / other envs idempotent.
create index if not exists messages_org_contact_service_timestamp_idx
on public.messages (organization_id, contact_address, service, "timestamp" desc);
