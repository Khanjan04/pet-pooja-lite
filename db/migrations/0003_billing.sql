-- Razorpay subscription states map onto ours; keep the raw one too.
-- 'incomplete' = created or authenticated, first charge not yet taken.
alter table subscriptions drop constraint subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check
  check (status in ('incomplete','trialing','active','past_due','cancelled','paused'));
alter table subscriptions add column provider_status text;
-- Webhooks can arrive out of order: only apply an event newer than the last one applied.
alter table subscriptions add column provider_event_at timestamptz;
create unique index subscriptions_one_live on subscriptions (org_id) where status in ('incomplete','active','past_due','paused');
