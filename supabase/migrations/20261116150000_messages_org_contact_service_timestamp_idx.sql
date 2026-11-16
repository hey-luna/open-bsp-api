-- Luna WhatsApp first-flush context queries filter messages by
-- (organization_id, contact_address, service) then order/limit by timestamp.
-- Without this index Postgres scanned messages_timestamp_idx and filtered
-- ~160k org rows (~5s+), exceeding authenticator statement_timeout=8s and
-- delaying Luna's first reply by the flush retry backoff.
-- IF NOT EXISTS keeps re-apply / other envs idempotent.
create index if not exists messages_org_contact_service_timestamp_idx
on public.messages (organization_id, contact_address, service, timestamp desc);
