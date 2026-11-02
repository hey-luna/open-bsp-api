-- Already applied live on open-bsp-luna to stop seq scans on the
-- minute cron reclaim: WHERE status = 'flushing' AND updated_at < $1.
-- IF NOT EXISTS keeps re-apply / other envs idempotent.
create index if not exists luna_whatsapp_batches_status_updated_at_idx
on public.luna_whatsapp_batches (status, updated_at);
