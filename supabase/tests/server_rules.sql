-- Sunucu kuralları testi (Şartname §27). SQL Editor'de postgres olarak çalıştırılır.
-- Mevcut test kullanıcıları (test_bir, test_iki) üzerinde çalışır. Sonunda bilerek exception fırlatır: böylece tüm değişiklikler GERİ ALINIR ve sonuçlar hata metninde listelenir.





do $$
declare
  u uuid; s daily_summaries; i_en task_instances; i_wake task_instances; i_nut task_instances;
  res text := ''; op1 uuid := gen_random_uuid(); r1 jsonb; r2 jsonb; r3 jsonb; v_total bigint; n_ledger int; v_tz text; v_today date; v_other uuid;
begin
  select au.id into u from app_users au where au.username = 'test_bir';
  if u is null then raise exception 'test_bir bulunamadı'; end if;
  -- Oturumu taklit et: RPC'ler auth.uid() üzerinden kullanıcıyı belirler
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);

  perform bb_process_user(u);
  v_tz := (bb_couple_of(u)).timezone; v_today := bb_local_date(now(), v_tz);
  select * into s from daily_summaries where user_id = u and local_date = v_today;
  select * into i_en from task_instances where daily_summary_id = s.id and snapshot->>'code' = 'ENGLISH';
  select * into i_wake from task_instances where daily_summary_id = s.id and snapshot->>'code' = 'WAKE';
  select * into i_nut from task_instances where daily_summary_id = s.id and snapshot->>'code' = 'NUTRITION';

  -- 2/3/4/5: 10 kelime = 6 XP; aynı operationId 5 kez tek etki; 20'ye güncelleme +6; 10'a düşürme -6
  r1 := record_task(i_en.id, op1, i_en.revision, 'set_value', 10, null, null);
  if (r1->'instance'->>'earnedXP')::int <> 6 then raise exception 'S2 beklenen 6, gelen %', r1->'instance'->>'earnedXP'; end if;
  res := res || format(E'
%s · %s · %s', 2, '10/20 kelime', '6 XP ✓');
  r2 := record_task(i_en.id, op1, i_en.revision, 'set_value', 10, null, null);
  r3 := record_task(i_en.id, op1, i_en.revision, 'set_value', 10, null, null);
  select count(*) into n_ledger from xp_ledger where daily_summary_id = s.id and reason = 'TASK:set_value';
  if (r2->>'xpDelta') <> (r1->>'xpDelta') or (r3->'instance'->>'revision') <> (r1->'instance'->>'revision') then raise exception 'S3 idempotency bozuk'; end if;
  res := res || format(E'
%s · %s · %s', 3, 'Aynı operationId tekrar', 'tek etki, aynı yanıt ✓');
  r2 := record_task(i_en.id, gen_random_uuid(), (r1->'instance'->>'revision')::int, 'set_value', 20, null, null);
  if (r2->>'xpDelta')::int <> 6 or (r2->'instance'->>'earnedXP')::int <> 12 then raise exception 'S4 beklenen +6/12, gelen %/%', r2->>'xpDelta', r2->'instance'->>'earnedXP'; end if;
  res := res || format(E'
%s · %s · %s', 4, '10 → 20 kelime', '+6, toplam 12 ✓');
  r3 := record_task(i_en.id, gen_random_uuid(), (r2->'instance'->>'revision')::int, 'set_value', 10, null, null);
  if (r3->>'xpDelta')::int <> -6 then raise exception 'S5 beklenen -6, gelen %', r3->>'xpDelta'; end if;
  res := res || format(E'
%s · %s · %s', 5, '20 → 10 kelime', '-6 ✓');

  -- 45: eski revision ile farklı operasyon → REVISION_CONFLICT
  begin
    perform record_task(i_en.id, gen_random_uuid(), 0, 'set_value', 15, null, null);
    raise exception 'S45 çakışma yakalanmadı';
  exception when others then
    if sqlerrm <> 'REVISION_CONFLICT' then raise; end if;
    res := res || format(E'
%s · %s · %s', 45, 'Eski revision', 'REVISION_CONFLICT ✓');
  end;

  -- 7: kalkış 06.30 = 15, 06.31 = 0
  r1 := record_task(i_wake.id, gen_random_uuid(), i_wake.revision, 'set_value', 390, null, null);
  if (r1->'instance'->>'earnedXP')::int <> 15 then raise exception 'S7a'; end if;
  r2 := record_task(i_wake.id, gen_random_uuid(), (r1->'instance'->>'revision')::int, 'set_value', 391, null, null);
  if (r2->'instance'->>'earnedXP')::int <> 0 then raise exception 'S7b'; end if;
  res := res || format(E'
%s · %s · %s', 7, 'Kalkış 06.30 / 06.31', '15 / 0 XP ✓');

  -- 16: ceza kapalı, "planıma uymadı" → 0 XP, ceza yok
  r1 := record_task(i_nut.id, gen_random_uuid(), i_nut.revision, 'set_value', 0, null, null);
  if (r1->'summary'->>'penaltyXP')::int <> 0 or (r1->'instance'->>'status') <> 'MISSED_SELF' then raise exception 'S16'; end if;
  res := res || format(E'
%s · %s · %s', 16, 'Beslenme uymadı, ceza kapalı', '0 XP, ceza 0 ✓');

  -- 17/18: ceza açık → net = max(0, brüt-5); kaydı düzeltince ceza kalkar
  update plan_versions set penalty_enabled = true where user_id = u and status = 'ACTIVE';
  perform bb_recompute_day(s.id); perform bb_write_xp_delta(s.id, 'TEST');
  select * into s from daily_summaries where id = s.id;
  if s.penalty_xp <> 5 or s.net_xp <> greatest(0, s.gross_xp - 5) then raise exception 'S17 penalty=% net=% gross=%', s.penalty_xp, s.net_xp, s.gross_xp; end if;
  select coalesce(sum(delta),0) into v_total from xp_ledger where daily_summary_id = s.id;
  if v_total <> s.net_xp then raise exception 'S17 defter % <> net %', v_total, s.net_xp; end if;
  res := res || format(E'
%s · %s · %s', 17, 'Ceza açık', format('brüt %s, ceza 5, net %s, defter tutarlı ✓', s.gross_xp, s.net_xp));
  r1 := record_task(i_nut.id, gen_random_uuid(), (select revision from task_instances where id = i_nut.id), 'set_value', 2, null, null);
  if (r1->'summary'->>'penaltyXP')::int <> 0 then raise exception 'S18'; end if;
  res := res || format(E'
%s · %s · %s', 18, 'Ceza kaydı kaldırıldı', 'ceza 0, ters fark yazıldı ✓');
  update plan_versions set penalty_enabled = false where user_id = u and status = 'ACTIVE';

  -- 14: bir görev takip dışı → paydadan çıkar
  r1 := record_task(i_wake.id, gen_random_uuid(), (select revision from task_instances where id = i_wake.id), 'set_excused', null, null, null);
  if (r1->'summary'->>'plannedXP')::int <> 129 - 15 then raise exception 'S14 planned %', r1->'summary'->>'plannedXP'; end if;
  res := res || format(E'
%s · %s · %s', 14, 'Bir görev takip dışı', 'payda 114 ✓');

  -- 11: kilitli gün → DAY_LOCKED
  update daily_summaries set correction_deadline = now() - interval '1 second' where id = s.id;
  begin
    perform record_task(i_en.id, gen_random_uuid(), (select revision from task_instances where id = i_en.id), 'set_value', 5, null, null);
    raise exception 'S11 kilit çalışmadı';
  exception when others then
    if sqlerrm <> 'DAY_LOCKED' then raise; end if;
    res := res || format(E'
%s · %s · %s', 11, 'Süre dolduktan sonra kayıt', 'DAY_LOCKED ✓');
  end;
  -- Kilit sonrası aynı operationId ile tekrar → eski başarı yanıtı döner (yeni değişiklik yok)
  r2 := record_task(i_en.id, op1, i_en.revision, 'set_value', 10, null, null);
  if (r2->'instance'->>'earnedXP')::int <> 6 then raise exception 'S12b'; end if;
  res := res || format(E'
%s · %s · %s', 12, 'Kilitli günde eski operationId', 'eski yanıt, değişiklik yok ✓');

  -- 36/42: kilitleme + kalp tekilliği (işlem iki kez çalışır, kalp bir kez)
  update daily_summaries set state = 'CLOSED_EDITABLE' where id = s.id;
  perform bb_process_user(u); perform bb_process_user(u);
  select * into s from daily_summaries where id = s.id;
  if s.state <> 'FINALIZED' then raise exception 'S36 state %', s.state; end if;
  if (select count(*) from heart_ledger where reference_id = s.id) <> 1 then raise exception 'S36 kalp sayısı'; end if;
  if (select hearts from wallet_balances where user_id = u) <> 2 then raise exception 'S36 cüzdan'; end if;
  res := res || format(E'
%s · %s · %s', 36, 'Kilitleme iki kez çalıştı', '1 kalp kaydı (2 kalp), cüzdan 2 ✓');

  -- 39: partner başkasının görevine ID ile erişemez
  select au.id into v_other from app_users au where au.username = 'test_iki';
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_other::text, true);
  begin
    perform record_task(i_en.id, gen_random_uuid(), 0, 'set_value', 5, null, null);
    raise exception 'S39 sızıntı';
  exception when others then
    if sqlerrm <> 'NOT_FOUND' then raise; end if;
    res := res || format(E'
%s · %s · %s', 39, 'Partner başkasının görevine erişti', 'NOT_FOUND ✓');
  end;
  raise exception E'TEST SONUÇLARI (tümü geçti, değişiklikler geri alındı):%', res;
end $$;



