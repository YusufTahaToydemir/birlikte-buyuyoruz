// Kelime Düellosu sözlüğü: konu konu İngilizce → Türkçe. Yanlış şıklar aynı konudan seçilir (fiile fiil, renge renk).
// Biçim: "ingilizce:türkçe" virgülle ayrılır. İngilizce ve Türkçe karşılıklar benzersiz olmalı (words.test.ts denetler).
const RAW: Record<string, string> = {
  nature: `sun:güneş, moon:ay, star:yıldız, tree:ağaç, flower:çiçek, sea:deniz, mountain:dağ, river:nehir, cloud:bulut, rain:yağmur,
    snow:kar, wind:rüzgâr, fire:ateş, stone:taş, sky:gökyüzü, forest:orman, lake:göl, island:ada, desert:çöl, leaf:yaprak,
    grass:çimen, sand:kum, wave:dalga, storm:fırtına, soil:toprak, world:dünya, rainbow:gökkuşağı, spring:ilkbahar, summer:yaz, autumn:sonbahar,
    winter:kış, ice:buz, root:kök, seed:tohum, valley:vadi, cave:mağara, field:tarla, hill:tepe`,
  animals: `cat:kedi, dog:köpek, bird:kuş, horse:at, cow:inek, sheep:koyun, fish:balık, lion:aslan, wolf:kurt, bear:ayı,
    fox:tilki, rabbit:tavşan, owl:baykuş, eagle:kartal, bee:arı, ant:karınca, butterfly:kelebek, snake:yılan, turtle:kaplumbağa, chicken:tavuk,
    duck:ördek, goat:keçi, camel:deve, elephant:fil, monkey:maymun, mouse:fare, frog:kurbağa, deer:geyik, whale:balina, spider:örümcek,
    pigeon:güvercin, donkey:eşek`,
  food: `apple:elma, bread:ekmek, water:su, milk:süt, cheese:peynir, egg:yumurta, honey:bal, rice:pirinç, meat:et, soup:çorba,
    salt:tuz, sugar:şeker, tea:çay, coffee:kahve, olive:zeytin, tomato:domates, potato:patates, onion:soğan, lemon:limon, orange:portakal,
    grape:üzüm, cherry:kiraz, strawberry:çilek, watermelon:karpuz, butter:tereyağı, yogurt:yoğurt, breakfast:kahvaltı, dinner:akşam yemeği, lunch:öğle yemeği, fig:incir,
    walnut:ceviz, date (fruit):hurma, pepper:biber, cucumber:salatalık, flour:un`,
  home: `house:ev, door:kapı, window:pencere, kitchen:mutfak, garden:bahçe, room:oda, bed:yatak, chair:sandalye, table:masa, wall:duvar,
    roof:çatı, floor:zemin, key:anahtar, mirror:ayna, lamp:lamba, pillow:yastık, blanket:battaniye, carpet:halı, spoon:kaşık, fork:çatal,
    knife:bıçak, plate:tabak, cup:fincan, glass:bardak, towel:havlu, soap:sabun, bathroom:banyo, stairs:merdiven, balcony:balkon, clock:saat,
    candle:mum, pot:tencere, oven:fırın`,
  people: `friend:arkadaş, family:aile, mother:anne, father:baba, sister:kız kardeş, brother:erkek kardeş, wife:eş (kadın), husband:eş (erkek), child:çocuk, neighbor:komşu,
    guest:misafir, teacher:öğretmen, student:öğrenci, doctor:doktor, baby:bebek, grandmother:büyükanne, grandfather:büyükbaba, uncle:amca, aunt:teyze, daughter:kız evlat,
    son:oğul, cousin:kuzen, bride:gelin, groom:damat, people:insanlar, man:adam, woman:kadın, girl:kız, boy:erkek çocuk, farmer:çiftçi,
    cook:aşçı, soldier:asker, driver:şoför, nurse:hemşire, engineer:mühendis, lawyer:avukat`,
  body: `heart:kalp, hand:el, eye:göz, head:baş, face:yüz, nose:burun, mouth:ağız, ear:kulak, hair:saç, arm:kol,
    leg:bacak, foot:ayak, finger:parmak, tooth:diş, tongue:dil, neck:boyun, shoulder:omuz, back:sırt, knee:diz, skin:deri,
    blood:kan, bone:kemik, stomach:mide, brain:beyin, lip:dudak, cheek:yanak, eyebrow:kaş, chest:göğüs`,
  verbs: `to read:okumak, to write:yazmak, to learn:öğrenmek, to run:koşmak, to swim:yüzmek, to cook:yemek yapmak, to sleep:uyumak, to wake up:uyanmak, to pray:dua etmek, to help:yardım etmek,
    to forgive:affetmek, to wait:beklemek, to win:kazanmak, to lose:kaybetmek, to try:denemek, to remember:hatırlamak, to forget:unutmak, to eat:yemek, to drink:içmek, to walk:yürümek,
    to see:görmek, to hear:duymak, to speak:konuşmak, to listen:dinlemek, to open:açmak, to close:kapatmak, to give:vermek, to take:almak, to buy:satın almak, to sell:satmak,
    to come:gelmek, to go:gitmek, to sit:oturmak, to stand:ayakta durmak, to love:sevmek, to laugh:gülmek, to cry:ağlamak, to think:düşünmek, to know:bilmek, to begin:başlamak,
    to finish:bitirmek, to build:inşa etmek, to clean:temizlemek, to wash:yıkamak, to carry:taşımak, to find:bulmak, to search:aramak, to ask:sormak, to answer:cevap vermek, to travel:seyahat etmek,
    to dance:dans etmek, to sing:şarkı söylemek, to play:oynamak, to share:paylaşmak, to choose:seçmek, to promise:söz vermek, to believe:inanmak, to grow:büyümek, to fly:uçmak, to fall:düşmek,
    to climb:tırmanmak, to jump:zıplamak, to rest:dinlenmek, to smile:gülümsemek`,
  adjectives: `strong:güçlü, brave:cesur, happy:mutlu, tired:yorgun, hungry:aç, beautiful:güzel, quick:hızlı, slow:yavaş, healthy:sağlıklı, clean:temiz,
    quiet:sessiz, busy:meşgul, ready:hazır, careful:dikkatli, honest:dürüst, generous:cömert, big:büyük, small:küçük, long:uzun, short:kısa,
    hot:sıcak, cold:soğuk, new:yeni, old:eski, young:genç, rich:zengin, poor:fakir, easy:kolay, difficult:zor, heavy:ağır,
    light (weight):hafif, dark:karanlık, bright:parlak, sweet:tatlı, bitter:acı, sour:ekşi, empty:boş, full:dolu, wet:ıslak, dry:kuru,
    sad:üzgün, angry:kızgın, kind:nazik, lazy:tembel, clever:zeki, funny:komik, calm:sakin, wide:geniş, narrow:dar, soft:yumuşak,
    hard:sert, sick:hasta, thirsty:susamış, lucky:şanslı, proud:gururlu, shy:utangaç, curious:meraklı, loyal:sadık, free:özgür, safe:güvenli,
    dangerous:tehlikeli, famous:ünlü, cheap:ucuz, expensive:pahalı`,
  colorsNumbers: `red:kırmızı, blue:mavi, green:yeşil, yellow:sarı, black:siyah, white:beyaz, purple:mor, pink:pembe, brown:kahverengi, gray:gri,
    gold:altın, silver:gümüş, one:bir, two:iki, three:üç, four:dört, five:beş, six:altı, seven:yedi, eight:sekiz,
    nine:dokuz, ten:on, twenty:yirmi, thousand:bin, first:birinci, last:son, half:yarım`,
  time: `always:her zaman, never:asla, sometimes:bazen, today:bugün, tomorrow:yarın, yesterday:dün, early:erken, late:geç, morning:sabah, night:gece,
    evening:akşam, noon:öğle, week:hafta, year:yıl, day:gün, minute:dakika, second:saniye, now:şimdi, soon:yakında, later:sonra,
    before:önce, again:tekrar, often:sık sık, Tuesday:salı, Wednesday:çarşamba, Thursday:perşembe, Friday:cuma, Saturday:cumartesi, Monday:pazartesi, birthday:doğum günü,
    holiday:tatil, season:mevsim, century:yüzyıl, moment:an, future:gelecek, past:geçmiş`,
  values: `patience:sabır, peace:huzur, hope:umut, truth:gerçek, kindness:nezaket, knowledge:bilgi, wisdom:hikmet, gratitude:şükür, love:sevgi, joy:sevinç,
    fear:korku, courage:cesaret, trust:güven, respect:saygı, faith:iman, dream:hayal, memory:anı, health:sağlık, happiness:mutluluk, sadness:üzüntü,
    anger:öfke, mercy:merhamet, justice:adalet, freedom:özgürlük, friendship:dostluk, effort:çaba, success:başarı, mistake:hata, idea:fikir, question:soru,
    answer:cevap, silence:sessizlik, secret:sır, promise:söz, habit:alışkanlık, goal:hedef, life:hayat, time:zaman, luck:şans`,
  travel: `street:sokak, market:pazar, money:para, gift:hediye, journey:yolculuk, city:şehir, village:köy, road:yol, bridge:köprü, car:araba,
    bus:otobüs, train:tren, plane:uçak, ship:gemi, bicycle:bisiklet, ticket:bilet, map:harita, station:istasyon, airport:havalimanı, hospital:hastane,
    school:okul, library:kütüphane, mosque:cami, shop:dükkân, bank:banka, park:park, museum:müze, hotel:otel, bag:çanta, suitcase:valiz,
    passport:pasaport, letter:mektup, phone:telefon, newspaper:gazete, pharmacy:eczane`,
  adventure: `sword:kılıç, shield:kalkan, dragon:ejderha, castle:kale, king:kral, queen:kraliçe, treasure:hazine, hero:kahraman, magic:büyü, crown:taç,
    tower:kule, battle:savaş, enemy:düşman, army:ordu, arrow:ok, bow:yay, armor:zırh, potion:iksir, ghost:hayalet, giant:dev,
    witch:cadı, wizard:büyücü, knight:şövalye, prince:prens, princess:prenses, quest:görev, victory:zafer, legend:efsane, monster:canavar, gem:mücevher,
    scroll:parşömen`,
  clothes: `shirt:gömlek, dress:elbise, shoe:ayakkabı, hat:şapka, coat:palto, scarf:atkı, glove:eldiven, sock:çorap, pants:pantolon, skirt:etek,
    ring:yüzük, necklace:kolye, button:düğme, pocket:cep, umbrella:şemsiye, glasses:gözlük, watch:kol saati, belt:kemer, jacket:ceket, boots:çizme`,
}

export type WordEntry = { en: string; tr: string; cat: number }

export const WORD_CATS = Object.keys(RAW)
export const WORDS: WordEntry[] = WORD_CATS.flatMap((cat, ci) =>
  RAW[cat].split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const k = s.indexOf(':')
    return { en: s.slice(0, k).trim(), tr: s.slice(k + 1).trim(), cat: ci }
  }),
)
/** Her konudaki kelimelerin WORDS içindeki sıraları (yanlış şık havuzu) */
export const WORDS_BY_CAT: number[][] = WORD_CATS.map((_, ci) => WORDS.flatMap((w, i) => (w.cat === ci ? [i] : [])))
