create index recommendations_invoice_owner on public.recommendations(invoice_id, owner_id);

create function public.save_analysis(p_owner_id uuid, p_invoice_id uuid, p_message text, p_received_at timestamptz, p_analysis jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare message_id uuid; recommendation public.recommendations;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));
  perform 1 from public.invoices where id = p_invoice_id and owner_id = p_owner_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  insert into public.customer_messages(owner_id,invoice_id,body,received_at,source)
  values(p_owner_id,p_invoice_id,p_message,p_received_at,'merchant_paste') returning id into message_id;
  update public.recommendations set status = 'blocked' where owner_id = p_owner_id and invoice_id = p_invoice_id and status = 'pending';
  insert into public.recommendations(owner_id,invoice_id,message_id,classification,confidence,evidence,action,draft,promise_date,reason)
  values(p_owner_id,p_invoice_id,message_id,p_analysis->>'classification',(p_analysis->>'confidence')::double precision,
    p_analysis->'evidence',p_analysis->>'action',p_analysis->>'draft',(p_analysis->>'promise_date')::date,p_analysis->>'reason') returning * into recommendation;
  if recommendation.classification in ('invoice_dispute','already_paid_claim','cash_flow_difficulty') then
    update public.invoices set paused = true, updated_at = now() where id = p_invoice_id;
  end if;
  insert into public.audit_log(owner_id,invoice_id,title,detail) values(p_owner_id,p_invoice_id,'AI analysis prepared',recommendation.classification || ' · ' || recommendation.action || ' · previous pending suggestions superseded · merchant approval required');
  return to_jsonb(recommendation);
end $$;

revoke all on function public.save_analysis(uuid,uuid,text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.save_analysis(uuid,uuid,text,timestamptz,jsonb) to service_role;
