-- Run against a configured test project using a privileged SQL connection.
-- Every test record is rolled back at the end of this script.
begin;
do $$
declare
  owner uuid;
  invoice_id uuid := gen_random_uuid();
  message_id uuid := gen_random_uuid();
  recommendation_id uuid := gen_random_uuid();
  second_recommendation_id uuid := gen_random_uuid();
  operation_id uuid := gen_random_uuid();
  result jsonb;
  invoice_data jsonb;
  blocked boolean;
  event_id text := 'TEST-' || gen_random_uuid();
begin
  select user_id into strict owner from public.merchant_access;
  insert into public.invoices(id,owner_id,paypal_id,number,customer_name,customer_email,description,currency,total_cents,due_cents,status,due_date)
  values(invoice_id,owner,'INV2-TEST-' || gen_random_uuid(),'DB-REGRESSION','Synthetic test','test@example.com','Rollback-only test','USD',10000,10000,'UNPAID',current_date);
  insert into public.customer_messages(id,owner_id,invoice_id,body,received_at,source)
  values(message_id,owner,invoice_id,'I forgot to pay.',now(),'merchant_paste');
  insert into public.recommendations(id,owner_id,invoice_id,message_id,classification,confidence,evidence,action,draft,reason)
  values(recommendation_id,owner,invoice_id,message_id,'forgot_to_pay',0.9,'["I forgot to pay."]','prepare_reminder','A friendly reminder.','Rollback test');

  result := public.claim_operation(owner,operation_id,'create',null,'payload');
  if not (result->>'fresh')::boolean then raise exception 'First operation was not fresh'; end if;
  result := public.claim_operation(owner,operation_id,'create',null,'payload');
  if (result->>'fresh')::boolean then raise exception 'Duplicate operation claimed twice'; end if;
  blocked := false;
  begin perform public.claim_operation(owner,operation_id,'create',null,'different');
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Conflicting operation payload accepted'; end if;

  -- Avoid depending on reminders already sent by the merchant outside this test.
  update public.operations set created_at = now() - interval '2 days' where owner_id = owner and kind = 'reminder';
  perform public.claim_recommendation(owner,recommendation_id,'A friendly reminder.',null,current_date);
  blocked := false;
  begin perform public.claim_recommendation(owner,recommendation_id,'A friendly reminder.',null,current_date);
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Duplicate approval accepted'; end if;
  perform public.finish_recommendation(owner,recommendation_id,'uncertain');
  if (select status from public.recommendations where id = recommendation_id) <> 'uncertain' then raise exception 'Uncertain result was not retained'; end if;

  insert into public.recommendations(id,owner_id,invoice_id,message_id,classification,confidence,evidence,action,draft,reason)
  values(second_recommendation_id,owner,invoice_id,message_id,'forgot_to_pay',0.9,'["I forgot to pay."]','prepare_reminder','A friendly reminder.','Rollback test');
  blocked := false;
  begin perform public.claim_recommendation(owner,second_recommendation_id,'A friendly reminder.',null,current_date);
  exception when others then blocked := true; end;
  if not blocked then raise exception 'Uncertain reminder did not consume cooldown'; end if;

  select to_jsonb(i) into invoice_data from public.invoices i where id = invoice_id;
  invoice_data := invoice_data || '{"status":"PAYMENT_PENDING","due_cents":4000}'::jsonb;
  result := public.reconcile_invoice(owner,invoice_id,invoice_data,now() + interval '1 second');
  if result->>'status' <> 'PAYMENT_PENDING' then raise exception 'Pending payment was incorrectly settled'; end if;
  if (select status from public.recommendations where id = second_recommendation_id) <> 'blocked' then raise exception 'Pending payment did not block pending reminders'; end if;

  invoice_data := invoice_data || '{"status":"PAID","due_cents":0}'::jsonb;
  result := public.reconcile_invoice(owner,invoice_id,invoice_data,now() + interval '3 seconds');
  if result->>'status' <> 'PAID' then raise exception 'Paid reconciliation failed'; end if;
  invoice_data := invoice_data || '{"status":"UNPAID","due_cents":10000}'::jsonb;
  result := public.reconcile_invoice(owner,invoice_id,invoice_data,now() + interval '2 seconds');
  if result->>'status' <> 'PAID' then raise exception 'Stale reconciliation reopened paid invoice'; end if;
  result := public.reconcile_invoice(owner,invoice_id,invoice_data,now() + interval '4 seconds');
  if result->>'status' <> 'PAID' then raise exception 'Late unconfirmed status reopened settled invoice'; end if;

  if not public.claim_webhook(event_id,'{"type":"test"}'::jsonb) then raise exception 'First webhook was not claimed'; end if;
  if public.claim_webhook(event_id,'{"type":"test"}'::jsonb) then raise exception 'Concurrent duplicate webhook claimed'; end if;
  update public.webhook_events set state='failed' where id=event_id;
  if not public.claim_webhook(event_id,'{"type":"test"}'::jsonb) then raise exception 'Failed webhook could not retry'; end if;
  update public.webhook_events set state='processed' where id=event_id;
  if public.claim_webhook(event_id,'{"type":"test"}'::jsonb) then raise exception 'Processed webhook was claimed twice'; end if;

  if has_function_privilege('anon','public.claim_recommendation(uuid,uuid,text,date,date)','execute') then raise exception 'Anonymous role can execute internal action'; end if;
  if has_function_privilege('authenticated','public.claim_recommendation(uuid,uuid,text,date,date)','execute') then raise exception 'Browser role can execute internal action'; end if;
  if has_table_privilege('authenticated','public.invoices','update') then raise exception 'Browser role can update authoritative invoice state'; end if;

  result := public.save_analysis(owner,invoice_id,'I cannot find the link.',now(),'{"classification":"missing_payment_link","confidence":0.9,"evidence":["I cannot find the link."],"action":"resend_payment_link","draft":"Thanks for your message.","promise_date":null,"reason":"Rollback test"}'::jsonb);
  recommendation_id := (result->>'id')::uuid;
  result := public.save_analysis(owner,invoice_id,'The amount is wrong.',now(),'{"classification":"invoice_dispute","confidence":0.9,"evidence":["The amount is wrong."],"action":"human_review","draft":"I will review the amount.","promise_date":null,"reason":"Rollback test"}'::jsonb);
  if (select status from public.recommendations where id = recommendation_id) <> 'blocked' then raise exception 'New message did not supersede pending analysis'; end if;
  if not (select paused from public.invoices where id = invoice_id) then raise exception 'Dispute did not atomically pause application reminders'; end if;
  if has_function_privilege('authenticated','public.save_analysis(uuid,uuid,text,timestamptz,jsonb)','execute') then raise exception 'Browser can call internal analysis function'; end if;
end $$;
rollback;
select 'Database regression checks passed; all synthetic records rolled back' as result;
