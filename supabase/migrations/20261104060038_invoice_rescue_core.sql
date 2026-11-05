create table public.merchant_access (
  user_id uuid primary key references auth.users(id),
  singleton boolean not null default true unique check (singleton),
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.merchant_access(user_id),
  paypal_id text not null unique,
  number text not null,
  customer_name text not null,
  customer_email text not null,
  description text not null,
  currency text not null check (currency = 'USD'),
  total_cents bigint not null check (total_cents >= 0),
  due_cents bigint not null check (due_cents >= 0),
  status text not null,
  due_date date not null,
  paypal_url text,
  paused boolean not null default false,
  promise_date date,
  reconciled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index invoices_owner_created on public.invoices(owner_id, created_at desc);

create table public.customer_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.merchant_access(user_id),
  invoice_id uuid not null,
  body text not null check (length(body) between 1 and 6000),
  received_at timestamptz not null,
  source text not null check (source = 'merchant_paste'),
  created_at timestamptz not null default now(),
  foreign key (invoice_id, owner_id) references public.invoices(id, owner_id),
  unique (id, invoice_id, owner_id)
);
create index customer_messages_owner_invoice on public.customer_messages(owner_id, invoice_id);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.merchant_access(user_id),
  invoice_id uuid not null,
  message_id uuid not null,
  classification text not null check (classification in ('forgot_to_pay','missing_payment_link','missing_invoice_information','invoice_dispute','cash_flow_difficulty','promise_to_pay','already_paid_claim','unknown')),
  confidence double precision not null check (confidence between 0 and 1),
  evidence jsonb not null,
  action text not null check (action in ('resend_payment_link','prepare_reminder','request_information','record_promise','pause_reminders','human_review','no_action')),
  draft text not null check (length(draft) between 1 and 1800),
  promise_date date,
  status text not null default 'pending' check (status in ('pending','executing','executed','rejected','blocked','uncertain','failed')),
  reason text not null,
  created_at timestamptz not null default now(),
  foreign key (invoice_id, owner_id) references public.invoices(id, owner_id),
  foreign key (message_id, invoice_id, owner_id) references public.customer_messages(id, invoice_id, owner_id)
);
create index recommendations_owner_status on public.recommendations(owner_id, status, created_at desc);
create index recommendations_message on public.recommendations(message_id);

create table public.operations (
  id uuid primary key,
  owner_id uuid not null references public.merchant_access(user_id),
  invoice_id uuid,
  kind text not null check (kind in ('create','send','reminder')),
  payload_hash text not null,
  state text not null default 'started' check (state in ('started','succeeded','uncertain','failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (invoice_id, owner_id) references public.invoices(id, owner_id)
);
create index operations_owner_created on public.operations(owner_id, created_at desc);
create index operations_invoice_created on public.operations(invoice_id, created_at desc);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.merchant_access(user_id),
  invoice_id uuid,
  title text not null,
  detail text not null,
  created_at timestamptz not null default now(),
  foreign key (invoice_id, owner_id) references public.invoices(id, owner_id)
);
create index audit_owner_created on public.audit_log(owner_id, created_at desc);
create index audit_invoice on public.audit_log(invoice_id);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.merchant_access(user_id),
  created_at timestamptz not null default now()
);
create index ai_runs_owner_created on public.ai_runs(owner_id, created_at desc);

create table public.webhook_events (
  id text primary key,
  payload jsonb not null,
  state text not null default 'processing' check (state in ('processing','processed','failed')),
  lease_until timestamptz not null default now() + interval '60 seconds',
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- Browsers can read their own records. All writes run after server authorization.
do $$
declare table_name text;
begin
  foreach table_name in array array['merchant_access','invoices','customer_messages','recommendations','operations','audit_log','ai_runs','webhook_events'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    if table_name not in ('ai_runs','webhook_events') then
      execute format('grant select on public.%I to authenticated', table_name);
      execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid()) = %I)', table_name, case when table_name = 'merchant_access' then 'user_id' else 'owner_id' end);
    end if;
  end loop;
end $$;

create function public.claim_operation(p_owner_id uuid, p_key uuid, p_kind text, p_invoice_id uuid, p_payload_hash text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare existing public.operations;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));
  select * into existing from public.operations where id = p_key;
  if found then
    if existing.owner_id <> p_owner_id or existing.kind <> p_kind or existing.payload_hash <> p_payload_hash then
      raise exception 'Operation key conflict';
    end if;
    return jsonb_build_object('fresh',false,'state',existing.state,'result',existing.result);
  end if;
  if p_kind not in ('create','send') then raise exception 'Unsupported operation'; end if;
  insert into public.operations(id, owner_id, invoice_id, kind, payload_hash) values (p_key, p_owner_id, p_invoice_id, p_kind, p_payload_hash);
  return jsonb_build_object('fresh',true,'state','started');
end $$;

create function public.reserve_ai_analysis(p_owner_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));
  if (select count(*) from public.ai_runs where owner_id = p_owner_id and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'Daily AI limit reached';
  end if;
  insert into public.ai_runs(owner_id) values (p_owner_id);
end $$;

create function public.reconcile_invoice(p_owner_id uuid, p_invoice_id uuid, p_data jsonb, p_started_at timestamptz)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare invoice public.invoices; old_status text;
begin
  select * into strict invoice from public.invoices where id = p_invoice_id and owner_id = p_owner_id for update;
  old_status := invoice.status;
  if invoice.reconciled_at > p_started_at then return to_jsonb(invoice); end if;
  if invoice.status in ('PAID','MARKED_AS_PAID','CANCELLED','REFUNDED','MARKED_AS_REFUNDED') and p_data->>'status' in ('DRAFT','SENT','UNPAID','PARTIALLY_PAID','PAYMENT_PENDING','SCHEDULED') then
    return to_jsonb(invoice);
  end if;
  if p_data->>'paypal_id' <> invoice.paypal_id or p_data->>'currency' <> 'USD' then raise exception 'Invoice identity mismatch'; end if;
  update public.invoices set
    number = p_data->>'number', customer_name = p_data->>'customer_name', customer_email = p_data->>'customer_email',
    description = p_data->>'description', total_cents = (p_data->>'total_cents')::bigint, due_cents = (p_data->>'due_cents')::bigint,
    status = p_data->>'status', due_date = (p_data->>'due_date')::date, paypal_url = p_data->>'paypal_url',
    reconciled_at = p_started_at, updated_at = now()
  where id = p_invoice_id returning * into invoice;
  if invoice.status in ('PAID','MARKED_AS_PAID','CANCELLED','REFUNDED','MARKED_AS_REFUNDED','PAYMENT_PENDING') then
    update public.recommendations set status = 'blocked' where invoice_id = invoice.id and status = 'pending';
  end if;
  if old_status <> invoice.status then
    insert into public.audit_log(owner_id,invoice_id,title,detail) values(p_owner_id,invoice.id,'PayPal status reconciled',old_status || ' → ' || invoice.status);
  end if;
  return to_jsonb(invoice);
end $$;

create function public.claim_recommendation(p_owner_id uuid, p_recommendation_id uuid, p_draft text, p_promise_date date, p_today date)
returns void language plpgsql security invoker set search_path = public as $$
declare recommendation public.recommendations; invoice public.invoices; outgoing boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));
  select * into strict recommendation from public.recommendations where id = p_recommendation_id and owner_id = p_owner_id;
  select * into strict invoice from public.invoices where id = recommendation.invoice_id and owner_id = p_owner_id for update;
  select * into strict recommendation from public.recommendations where id = p_recommendation_id and owner_id = p_owner_id for update;
  if recommendation.status <> 'pending' then raise exception 'Already reviewed'; end if;
  if length(trim(p_draft)) < 1 or length(p_draft) > 1800 then raise exception 'Invalid draft'; end if;
  outgoing := recommendation.action in ('prepare_reminder','resend_payment_link');
  if outgoing then
    if invoice.status not in ('SENT','UNPAID','PARTIALLY_PAID') or invoice.due_cents <= 0 or invoice.paused or invoice.promise_date >= p_today then raise exception 'Reminders blocked'; end if;
    if invoice.reconciled_at < now() - interval '60 seconds' then raise exception 'Fresh PayPal status required'; end if;
    if (select count(*) from public.operations where owner_id = p_owner_id and kind = 'reminder' and state in ('started','succeeded','uncertain') and created_at > now() - interval '24 hours') >= 2 then raise exception 'Merchant reminder limit'; end if;
    if exists(select 1 from public.operations where invoice_id = invoice.id and kind = 'reminder' and state in ('started','succeeded','uncertain') and created_at > now() - interval '12 hours') then raise exception 'Invoice reminder cooldown'; end if;
    insert into public.operations(id,owner_id,invoice_id,kind,payload_hash) values(recommendation.id,p_owner_id,invoice.id,'reminder',md5(p_draft));
  elsif recommendation.action = 'record_promise' then
    if p_promise_date is null or p_promise_date < p_today then raise exception 'Invalid promise date'; end if;
    update public.invoices set promise_date = p_promise_date, updated_at = now() where id = invoice.id;
  elsif recommendation.action in ('human_review','pause_reminders') then
    update public.invoices set paused = true, updated_at = now() where id = invoice.id;
  end if;
  update public.recommendations set draft = p_draft, promise_date = p_promise_date, status = case when outgoing then 'executing' else 'executed' end where id = recommendation.id;
  insert into public.audit_log(owner_id,invoice_id,title,detail) values(p_owner_id,invoice.id,'Merchant approved action',recommendation.action || case when outgoing then ' · sending through PayPal' else ' · application record updated' end);
end $$;

create function public.finish_recommendation(p_owner_id uuid, p_recommendation_id uuid, p_state text)
returns void language plpgsql security invoker set search_path = public as $$
declare recommendation public.recommendations;
begin
  if p_state not in ('succeeded','uncertain','failed') then raise exception 'Invalid operation result'; end if;
  select * into strict recommendation from public.recommendations where id = p_recommendation_id and owner_id = p_owner_id for update;
  if recommendation.status <> 'executing' then raise exception 'Operation is not executing'; end if;
  update public.operations set state = p_state, updated_at = now() where id = recommendation.id and owner_id = p_owner_id;
  update public.recommendations set status = case when p_state = 'succeeded' then 'executed' else p_state end where id = recommendation.id;
  insert into public.audit_log(owner_id,invoice_id,title,detail) values(p_owner_id,recommendation.invoice_id,
    case when p_state = 'succeeded' then 'PayPal accepted reminder' when p_state = 'uncertain' then 'Reminder outcome needs reconciliation' else 'PayPal rejected reminder' end,
    case when p_state = 'succeeded' then 'The API accepted the merchant-approved reminder. Delivery to the recipient is not independently confirmed.' else 'Synchronize the invoice before deciding on another action.' end);
end $$;

create function public.claim_webhook(p_event_id text, p_payload jsonb)
returns boolean language plpgsql security invoker set search_path = public as $$
declare event public.webhook_events;
begin
  insert into public.webhook_events(id,payload) values(p_event_id,p_payload) on conflict do nothing;
  select * into strict event from public.webhook_events where id = p_event_id for update;
  if event.payload <> p_payload then raise exception 'Event payload mismatch'; end if;
  if event.state = 'processed' then return false; end if;
  if event.attempts > 1 and event.state = 'processing' and event.lease_until > now() then return false; end if;
  update public.webhook_events set state = 'processing', lease_until = now() + interval '60 seconds', attempts = attempts + 1 where id = p_event_id;
  return true;
end $$;

-- Internal functions are callable only with the server key.
do $$
declare function_name regprocedure;
begin
  for function_name in select oid::regprocedure from pg_proc where pronamespace = 'public'::regnamespace and proname in ('claim_operation','reserve_ai_analysis','reconcile_invoice','claim_recommendation','finish_recommendation','claim_webhook') loop
    execute format('revoke all on function %s from public, anon, authenticated', function_name);
    execute format('grant execute on function %s to service_role', function_name);
  end loop;
end $$;
