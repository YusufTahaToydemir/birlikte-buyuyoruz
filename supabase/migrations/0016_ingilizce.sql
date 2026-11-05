-- 0016: İngilizce kelime hedefi düşürüldü (kullanıcı isteği): 2 / 5 / 10 / 15 / 20 / 30.
-- XP/altın/hasar değişmez; yalnızca hedef. Bugünün yapılmamış, kapanmamış İngilizce görevlerinin başlığı da güncellenir.
update quest_catalog set targets = '{"1":"2","2":"5","3":"10","4":"15","5":"20","6":"30"}'::jsonb where code = 'ENGLISH';

update quests q set title = bb_quest_title(c.title, c.targets, hd.difficulty, h.look->>'gender')
from quest_catalog c, hero_days hd, heroes h
where q.code = 'ENGLISH' and c.code = 'ENGLISH' and not q.done
  and hd.user_id = q.user_id and hd.local_date = q.local_date and not hd.closed
  and h.user_id = q.user_id;
