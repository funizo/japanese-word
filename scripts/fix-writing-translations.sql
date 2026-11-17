-- 생성된 번역의 누락을 교정합니다. 기존 사용자 답안과 과거 결과는 보존합니다.
-- 예상한 한국어·기존 정답이 일치할 때만 수정하며 여러 번 실행해도 안전합니다.
begin;
with corrections(question_index,korean,old_reference,patch) as (
  values
    (0,'출장 전날에는 필요한 서류를 가방에 넣어 두기로 하고 있습니다.',
      '前日に必要な書類をかばんに入れておくことにしている。',
      jsonb_build_object(
        'reference','出張の前日には必要な書類をかばんに入れておくことにしています。',
        'tokens','["出張の","前日には","必要な","書類を","かばんに","入れておく","ことにしています"]'::jsonb,
        'reading','しゅっちょうのぜんじつにはひつようなしょるいをかばんにいれておくことにしています。',
        'explanation',E'「동사 사전형＋ことにしている」는 스스로 정한 일을 계속 실천하는 습관을 나타냅니다.\n「出張の前日には」는 출장 전날에는, 「入れておく」는 미리 넣어 둔다는 뜻입니다.\n「ことにしています」는 정중한 표현으로, 넣어 두기로 정하고 실천하고 있다는 뜻입니다.')),
    (1,'우리는 방금 공항에 도착해서 아직 짐을 찾지 못했습니다.',
      '空港に着いたばかりなのでまだ荷物を受け取っていません。',
      jsonb_build_object(
        'reference','私たちは空港に着いたばかりなのでまだ荷物を受け取れていません。',
        'tokens','["私たちは","空港に","着いた","ばかりなので","まだ","荷物を","受け取れていません"]'::jsonb,
        'reading','わたしたちはくうこうについたばかりなのでまだにもつをうけとれていません。',
        'explanation',E'「동사 た형＋ばかり」는 어떤 일이 끝난 지 얼마 되지 않았음을 나타냅니다.\n「私たちは」는 우리는, 「着いたばかりなので」는 방금 도착했기 때문에라는 뜻입니다.\n「まだ受け取れていません」는 아직 받지 못한 상태임을 나타냅니다.')),
    (3,'온라인 지도를 이용한 덕분에 처음 가는 장소를 쉽게 찾을 수 있었습니다.',
      'オンライン地図のおかげで初めて行く場所を簡単に見つけられました。',
      jsonb_build_object(
        'reference','オンライン地図を利用したおかげで初めて行く場所を簡単に見つけられました。',
        'tokens','["オンライン地図を","利用した","おかげで","初めて","行く","場所を","簡単に","見つけられました"]'::jsonb,
        'reading','おんらいんちずをりようしたおかげではじめていくばしょをかんたんにみつけられました。',
        'explanation',E'「동사 보통형＋おかげで」는 좋은 결과를 가져온 원인이나 도움을 나타냅니다.\n「オンライン地図を利用したおかげで」는 온라인 지도를 이용한 덕분에라는 뜻입니다.\n「見つけられました」는 찾을 수 있었다는 뜻으로, 도움을 받아 가능해진 결과를 표현합니다.'))
)
update writing_private.solutions s set content=s.content || c.patch
from corrections c, public.writing_questions q
where s.study_date='2026-11-17' and s.question_index=c.question_index
  and q.study_date=s.study_date and q.question_index=s.question_index
  and q.korean=c.korean and s.content->>'reference'=c.old_reference
returning s.study_date,s.question_index,s.content->>'reference' as corrected_reference;
commit;
