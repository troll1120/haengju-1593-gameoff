import type { BphClass } from "./bph-contract";

/** Verbatim release text from the verified codex.json; no candidate generals. */
export const BPH_CODEX_TEXT = {
  "unit_militia": {
    "name": "의병",
    "side": "조선",
    "text": "고장을 지키려 스스로 모인 군대다. 곽재우 등의 지휘 아래 왜군의 진격과 보급을 막았다.",
    "sourceUrls": [
      "https://encykorea.aks.ac.kr/Article/E0047674",
      "https://encykorea.aks.ac.kr/Article/E0004695"
    ],
    "ref": "추가 요청"
  },
  "unit_chongtong": {
    "name": "총통 포병",
    "side": "조선",
    "text": "천자총통·지자총통 같은 화포를 다루는 조선 병사다. 성벽의 포루에서 큰 화살이나 탄환을 쏘아 다가오는 적을 막았다.",
    "sourceUrls": [
      "https://encykorea.aks.ac.kr/Article/E0056009",
      "https://encykorea.aks.ac.kr/Article/E0054337",
      "https://contents.history.go.kr/mobile/km/view.do?levelId=km_007_0050_0020_0020",
      "https://www.suwon.re.kr/data/file/town/3535263116_ZksRji1n_9e6aeecb66862cdf198eed744ea6454fc22c7295.pdf"
    ],
    "ref": "추가 요청"
  },
  "gwon_yul": {
    "name": "권율",
    "side": "조선",
    "years": "1537~1599",
    "title": "행주산성 대첩의 총지휘관",
    "battles": "이치 전투, 독산성, 행주산성(1593)",
    "end": "1599년 사망. 노환으로 관직을 사임하고 고향으로 돌아갔다.",
    "sourceUrls": [
      "https://encykorea.aks.ac.kr/Article/E0007022"
    ],
    "rosterRef": "roster.ts:2",
    "priority": true
  },
  "yi_sunsin": {
    "name": "이순신",
    "side": "조선",
    "years": "1545~1598",
    "title": "삼도수군통제사",
    "battles": "옥포, 한산도, 명량, 노량 해전",
    "end": "전사. 노량 해전에서 총탄을 맞고 '내 죽음을 알리지 말라' 했다.",
    "sourceUrls": [
      "https://encykorea.aks.ac.kr/Article/E0044900"
    ],
    "rosterRef": "추가 승인",
    "priority": true
  },
  "kim_simin": {
    "name": "김시민",
    "side": "조선",
    "years": "1554~1592",
    "title": "진주목사, 1차 진주성 대첩의 주역",
    "battles": "1차 진주성 전투(1592)",
    "end": "전사. 진주성 전투에서 이마에 총탄을 맞고 며칠 뒤 숨졌다.",
    "sourceUrls": [
      "https://encykorea.aks.ac.kr/Article/E0009658"
    ],
    "rosterRef": "roster.ts:2",
    "priority": true
  },
  "gwak_jaeu": {
    "name": "곽재우",
    "side": "조선",
    "years": "1552~1617",
    "title": "붉은 옷의 홍의장군, 첫 의병장 중 하나",
    "battles": "정암진 전투, 화왕산성",
    "end": "1617년 사망. 벼슬을 거듭 사양하고 은거했다.",
    "sourceUrls": [
      "https://encykorea.aks.ac.kr/Article/E0004695"
    ],
    "rosterRef": "roster.ts:2",
    "priority": true
  },
  "samyeong": {
    "name": "사명대사(유정)",
    "side": "조선",
    "years": "1544~1610",
    "title": "승병장, 1604년 일본에 파견된 사신",
    "battles": "평양성 탈환(1593)",
    "end": "입적. 1610년 해인사에서 생을 마쳤다.",
    "sourceUrls": [
      "https://encykorea.aks.ac.kr/Article/E0041805",
      "https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_n307900"
    ],
    "rosterRef": "추가 승인",
    "priority": true
  },
  "sin_rip": {
    "name": "신립",
    "side": "조선",
    "years": "1546~1592",
    "title": "삼도순변사, 북방의 명장",
    "battles": "충주 탄금대 전투(1592)",
    "end": "자결. 배수진이 무너지자 남한강에 몸을 던졌다.",
    "sourceUrls": [
      "https://encykorea.aks.ac.kr/Article/E0032901"
    ],
    "rosterRef": "roster.ts:2",
    "priority": true
  },
  "song_sanghyeon": {
    "name": "송상현",
    "side": "조선",
    "years": "1551~1592",
    "title": "동래부사, '싸워 죽기는 쉬워도 길을 빌려주긴 어렵다'",
    "battles": "동래성 전투(1592)",
    "end": "순절. 성이 무너지자 관복을 입고 앉은 채 죽음을 맞았다.",
    "sourceUrls": [
      "https://encykorea.aks.ac.kr/Article/E0030855"
    ],
    "rosterRef": "roster.ts:3",
    "priority": true
  },
  "hwang_jin": {
    "name": "황진",
    "side": "조선",
    "years": "1550~1593",
    "title": "이치에서 호남을 지킨 맹장",
    "battles": "이치 전투, 2차 진주성 전투(1593)",
    "end": "전사. 2차 진주성에서 총탄을 맞고 쓰러졌다.",
    "sourceUrls": [
      "https://encykorea.aks.ac.kr/Article/E0065345",
      "https://encykorea.aks.ac.kr/Article/E0054918",
      "https://encykorea.aks.ac.kr/Article/E0007022"
    ],
    "rosterRef": "roster.ts:2",
    "priority": true
  },
  "unit_spearman": {
    "name": "창병",
    "side": "조선",
    "text": "창을 든 보병이다. 자루 끝의 날로 적을 찌르는 근접전을 맡았다.",
    "sourceUrls": [
      "https://encykorea.aks.ac.kr/Article/E0023081"
    ],
    "ref": "rules.ts:35"
  },
  "unit_archer": {
    "name": "궁수",
    "side": "조선",
    "text": "각궁 등 활로 싸우는 병사다. 행주에서는 성 안에서 활을 쏘아 왜군을 막았다.",
    "sourceUrls": [
      "https://encykorea.aks.ac.kr/Article/E0023081",
      "https://encykorea.aks.ac.kr/Article/E0062859"
    ],
    "ref": "rules.ts:35"
  },
  "unit_monk": {
    "name": "승병",
    "side": "조선",
    "text": "절에서 모인 스님 군대다. 처영의 승병은 행주산성 한쪽을 맡아 싸웠다.",
    "sourceUrls": [
      "https://encykorea.aks.ac.kr/Article/E0055712",
      "https://encykorea.aks.ac.kr/Article/E0062859"
    ],
    "ref": "rules.ts:35"
  },
  "unit_ming_cavalry": {
    "name": "기병",
    "side": "조선·명",
    "text": "말을 타고 싸우는 병사다. 조선의 신립과 명의 이여송도 기병을 이끌었다.",
    "sourceUrls": [
      "https://encykorea.aks.ac.kr/Article/E0032901",
      "https://contents.history.go.kr/mobile/km/view.do?levelId=km_007_0060_0030_0010_0020"
    ],
    "ref": "rules.ts:35"
  },
  "unit_hwacha": {
    "name": "화차병",
    "side": "조선",
    "text": "수레 위에 여러 총통을 얹은 화기를 다뤘다. 행주에서는 변이중이 만든 화차가 활약했다.",
    "sourceUrls": [
      "https://encykorea.aks.ac.kr/Article/E0064882",
      "https://encykorea.aks.ac.kr/Article/E0062859"
    ],
    "ref": "rules.ts:35"
  },
  "unit_panokseon": {
    "name": "판옥선",
    "side": "조선",
    "text": "2층 갑판을 올린 조선 수군 주력선이다. 높은 갑판에서 화포를 쏘아 왜선을 부쉈다.",
    "sourceUrls": [
      "https://encykorea.aks.ac.kr/Article/E0059680",
      "https://encykorea.aks.ac.kr/Article/E0023081"
    ],
    "ref": "rules.ts:35"
  },
  "japan_ukita": {
    "name": "우키타 히데이에",
    "side": "japan",
    "years": "1572~1655(1573년생 설도 있음)",
    "title": "행주 공격군의 총지휘관",
    "battles": "행주산성 공격(1593), 세키가하라",
    "end": "1655년 사망. 세키가하라 패전 뒤 하치조지마에 유배되어 그곳에서 생을 마쳤다.",
    "sourceUrls": [
      "https://kotobank.jp/word/宇喜多秀家",
      "https://encykorea.aks.ac.kr/Article/E0062859"
    ],
    "rosterRef": "bosses.ts:9; rules.ts:60",
    "gameStatus": "existing_boss",
    "gameId": "ukita",
    "haengjuRole": "core",
    "replaces": "unit_ukita",
    "verificationNote": "출생 1572·1573년 설을 병기. 구 항목의 의학적 사인 '병사'는 미입증이므로 새 정규안에서 제외.",
    "release": true
  },
  "japan_konishi": {
    "name": "고니시 유키나가",
    "side": "japan",
    "years": "미상~1600",
    "title": "임진왜란 선봉에 선 무장, 강화 교섭에도 참여",
    "battles": "평양성, 행주산성 공격(1593), 세키가하라",
    "end": "처형. 세키가하라에서 패한 뒤 붙잡혀 1600년 처형되었다.",
    "sourceUrls": [
      "https://kotobank.jp/word/小西行長",
      "https://encykorea.aks.ac.kr/Article/E0062859"
    ],
    "rosterRef": "bosses.ts:6",
    "gameStatus": "existing_boss",
    "gameId": "konishi",
    "identityStatus": "proposed_full_name",
    "haengjuRole": "core",
    "verificationNote": "출생은 코토방크 사전 간 미상·1558년설이 공존하므로 미상으로 표기.",
    "release": true
  },
  "japan_wakizaka": {
    "name": "와키자카 야스하루",
    "side": "japan",
    "years": "1554~1626",
    "title": "임진왜란에 수군을 이끌고 참전한 무장",
    "battles": "시즈가타케, 한산도 해전(1592), 세키가하라",
    "end": "1626년 사망. 전쟁 뒤 이요 오즈의 영주를 지냈다.",
    "sourceUrls": [
      "https://kotobank.jp/word/脇坂安治",
      "https://ko.wikipedia.org/wiki/한산도_대첩"
    ],
    "rosterRef": "bosses.ts:7",
    "gameStatus": "existing_boss",
    "gameId": "wakizaka",
    "identityStatus": "proposed_full_name",
    "haengjuRole": "war_context",
    "release": true
  },
  "japan_kobayakawa": {
    "name": "고바야카와 다카카게",
    "side": "japan",
    "years": "1533~1597",
    "title": "모리 가문을 보좌하고 도요토미 정권에 참여한 무장",
    "battles": "규슈 정벌, 벽제관 전투(1593)",
    "end": "1597년 사망.",
    "sourceUrls": [
      "https://kotobank.jp/word/小早川隆景",
      "https://encykorea.aks.ac.kr/Article/E0062859",
      "https://ja.wikipedia.org/wiki/幸州山城の戦い"
    ],
    "rosterRef": "bosses.ts:8",
    "gameStatus": "existing_boss",
    "gameId": "kobayakawa",
    "identityStatus": "proposed_full_name",
    "haengjuRole": "source_disagreement",
    "verificationNote": "행주 참전은 AKS에 명시되나 일본어 위키백과의 참전 명단과 차이가 있어 합의로 단정하지 않음. 히데아키와 별개 인물.",
    "release": true
  },
  "japan_kato_yoshiaki": {
    "name": "가토 요시아키",
    "side": "japan",
    "years": "1563~1631(1562년생 설도 있음)",
    "title": "임진왜란에 수군을 지휘한 무장",
    "battles": "시즈가타케, 안골포 해전, 세키가하라",
    "end": "1631년 에도에서 사망. 말년에는 아이즈의 영주를 지냈다.",
    "sourceUrls": [
      "https://kotobank.jp/word/加藤嘉明-15718"
    ],
    "rosterRef": "bosses.ts:10",
    "gameStatus": "existing_boss",
    "gameId": "kato_yoshiaki",
    "haengjuRole": "war_context",
    "verificationNote": "기요마사와 다른 인물. 코토방크 사전 간 1562·1563년 출생 이견을 병기.",
    "release": true
  },
  "japan_kurushima": {
    "name": "구루시마 미치후사",
    "side": "japan",
    "years": "1561~1597",
    "title": "이요 구루시마 출신의 수군 장수",
    "battles": "시코쿠 정벌, 명량 해전(1597)",
    "end": "전사. 1597년 명량 해전에서 싸우다 숨졌다.",
    "sourceUrls": [
      "https://kotobank.jp/word/来島通総",
      "https://ja.wikipedia.org/wiki/来島通総",
      "https://encykorea.aks.ac.kr/Article/E0018250"
    ],
    "rosterRef": "bosses.ts:11",
    "gameStatus": "existing_boss",
    "gameId": "kurushima",
    "identityStatus": "proposed_full_name",
    "haengjuRole": "war_context",
    "verificationNote": "소스는 성씨만 지정. 미치유키 등 동성 인물과의 구별은 도감 대응 제안.",
    "release": true
  },
  "japan_nabeshima": {
    "name": "나베시마 나오시게",
    "side": "japan",
    "years": "1538~1618",
    "title": "히젠 사가 세력을 이끈 무장",
    "battles": "임진왜란 출전",
    "end": "1618년 사망.",
    "sourceUrls": [
      "https://kotobank.jp/word/鍋島直茂"
    ],
    "rosterRef": "bosses.ts:12",
    "gameStatus": "existing_boss",
    "gameId": "nabeshima",
    "identityStatus": "proposed_full_name",
    "haengjuRole": "war_context",
    "verificationNote": "나오시게·가쓰시게 중 게임의 전체 이름은 미지정. 이번에 읽은 본문으로 입증하지 못한 은거 시점은 생략.",
    "release": true
  },
  "japan_todo": {
    "name": "도도 다카토라",
    "side": "japan",
    "years": "1556~1630",
    "title": "임진왜란 수군 지휘관, 뒤에 이세 쓰의 영주",
    "battles": "세키가하라, 오사카 전투",
    "end": "1630년 사망.",
    "sourceUrls": [
      "https://kotobank.jp/word/藤堂高虎"
    ],
    "rosterRef": "bosses.ts:13",
    "gameStatus": "existing_boss",
    "gameId": "todo",
    "identityStatus": "proposed_full_name",
    "haengjuRole": "war_context",
    "release": true
  }
} as const;

export type CodexTextId = keyof typeof BPH_CODEX_TEXT;
export const BPH_CLASS_TEXT: Readonly<Record<BphClass, CodexTextId>> = {
 spearman: "unit_spearman", archer: "unit_archer", militia: "unit_militia", monk: "unit_monk",
 hwacha: "unit_hwacha", chongtong: "unit_chongtong", joseon_cavalry: "unit_ming_cavalry", panokseon: "unit_panokseon",
};
export const BPH_GENERAL_TEXT = ["gwon_yul", "sin_rip", "song_sanghyeon", "hwang_jin", "kim_simin", "gwak_jaeu", "samyeong", "yi_sunsin"] as const;

/** Original collection.csv order, addresses and discovery fields, including enemies. */
export const BPH_CODEX_SLOTS = [
  {
    "id": "Hero1_Squire",
    "source": "resources.assets:1412",
    "kind": "hero",
    "rarity": 0,
    "discoveryBonus": 10,
    "discoveryResource": "mastery",
    "foilBonus": 0
  },
  {
    "id": "Hero1_Barbarian",
    "source": "resources.assets:1411",
    "kind": "hero",
    "rarity": 1,
    "discoveryBonus": 10,
    "discoveryResource": "mastery",
    "foilBonus": 0
  },
  {
    "id": "Hero1_Archer",
    "source": "resources.assets:1410",
    "kind": "hero",
    "rarity": 2,
    "discoveryBonus": 10,
    "discoveryResource": "mastery",
    "foilBonus": 0
  },
  {
    "id": "Tome_Thunderstorm",
    "source": "resources.assets:1499",
    "kind": "tome",
    "rarity": 3,
    "discoveryBonus": 10,
    "discoveryResource": "mastery",
    "foilBonus": 2
  },
  {
    "id": "Hero2_Monk",
    "source": "resources.assets:1416",
    "kind": "hero",
    "rarity": 0,
    "discoveryBonus": 50,
    "discoveryResource": "mastery",
    "foilBonus": 0
  },
  {
    "id": "Hero2_Knight",
    "source": "resources.assets:1415",
    "kind": "hero",
    "rarity": 1,
    "discoveryBonus": 50,
    "discoveryResource": "mastery",
    "foilBonus": 0
  },
  {
    "id": "Hero2_Pyromancer",
    "source": "resources.assets:1417",
    "kind": "hero",
    "rarity": 2,
    "discoveryBonus": 50,
    "discoveryResource": "mastery",
    "foilBonus": 0
  },
  {
    "id": "Tome_RaiseDead",
    "source": "resources.assets:1498",
    "kind": "tome",
    "rarity": 3,
    "discoveryBonus": 100,
    "discoveryResource": "mastery",
    "foilBonus": 3
  },
  {
    "id": "Hero3_WitchDoctor",
    "source": "resources.assets:1421",
    "kind": "hero",
    "rarity": 0,
    "discoveryBonus": 500,
    "discoveryResource": "mastery",
    "foilBonus": 0
  },
  {
    "id": "Hero3_DemonSlayer",
    "source": "resources.assets:1418",
    "kind": "hero",
    "rarity": 1,
    "discoveryBonus": 500,
    "discoveryResource": "mastery",
    "foilBonus": 0
  },
  {
    "id": "Hero3_Illusionist",
    "source": "resources.assets:1419",
    "kind": "hero",
    "rarity": 2,
    "discoveryBonus": 500,
    "discoveryResource": "mastery",
    "foilBonus": 0
  },
  {
    "id": "Hero3_Portal",
    "source": "resources.assets:1420",
    "kind": "hero",
    "rarity": 3,
    "discoveryBonus": 500,
    "discoveryResource": "mastery",
    "foilBonus": 0
  },
  {
    "id": "Hero4_Bannerman",
    "source": "resources.assets:1422",
    "kind": "hero",
    "rarity": 0,
    "discoveryBonus": 5000,
    "discoveryResource": "mastery",
    "foilBonus": 0
  },
  {
    "id": "Hero4_Duelist",
    "source": "resources.assets:1423",
    "kind": "hero",
    "rarity": 1,
    "discoveryBonus": 5000,
    "discoveryResource": "mastery",
    "foilBonus": 0
  },
  {
    "id": "Hero4_Stormcaller",
    "source": "resources.assets:1424",
    "kind": "hero",
    "rarity": 2,
    "discoveryBonus": 5000,
    "discoveryResource": "mastery",
    "foilBonus": 0
  },
  {
    "id": "Tome_DragonsCall",
    "source": "resources.assets:1497",
    "kind": "tome",
    "rarity": 3,
    "discoveryBonus": 10000,
    "discoveryResource": "mastery",
    "foilBonus": 5
  },
  {
    "id": "Hero6_Shotgun",
    "source": "sharedassets1.assets:2672",
    "kind": "hero",
    "rarity": 0,
    "discoveryBonus": 25,
    "discoveryResource": "skull",
    "foilBonus": 0
  },
  {
    "id": "Hero6_BloodMage",
    "source": "sharedassets1.assets:2671",
    "kind": "hero",
    "rarity": 1,
    "discoveryBonus": 25,
    "discoveryResource": "skull",
    "foilBonus": 0
  },
  {
    "id": "Hero6_Skelewheel",
    "source": "sharedassets1.assets:2673",
    "kind": "hero",
    "rarity": 2,
    "discoveryBonus": 25,
    "discoveryResource": "skull",
    "foilBonus": 0
  },
  {
    "id": "Tome_SpectralPact",
    "source": "sharedassets1.assets:2712",
    "kind": "tome",
    "rarity": 3,
    "discoveryBonus": 50,
    "discoveryResource": "skull",
    "foilBonus": 6
  },
  {
    "id": "Hero5_Treant",
    "source": "sharedassets1.assets:2670",
    "kind": "hero",
    "rarity": 0,
    "discoveryBonus": 10,
    "discoveryResource": "fruit",
    "foilBonus": 0
  },
  {
    "id": "Hero5_Dino",
    "source": "sharedassets1.assets:2667",
    "kind": "hero",
    "rarity": 1,
    "discoveryBonus": 5,
    "discoveryResource": "fruit",
    "foilBonus": 0
  },
  {
    "id": "Hero5_Rider",
    "source": "sharedassets1.assets:2669",
    "kind": "hero",
    "rarity": 1,
    "discoveryBonus": 5,
    "discoveryResource": "fruit",
    "foilBonus": 0
  },
  {
    "id": "Hero5_DinoRider",
    "source": "sharedassets1.assets:2668",
    "kind": "hero",
    "rarity": 1,
    "discoveryBonus": 5,
    "discoveryResource": "fruit",
    "foilBonus": 0
  },
  {
    "id": "Hero5_Beastmaster",
    "source": "sharedassets1.assets:2666",
    "kind": "hero",
    "rarity": 2,
    "discoveryBonus": 10,
    "discoveryResource": "fruit",
    "foilBonus": 0
  },
  {
    "id": "Hero_Rat",
    "source": "resources.assets:1431",
    "kind": "hero",
    "rarity": 0,
    "discoveryBonus": 10,
    "discoveryResource": "fruit",
    "foilBonus": 0
  },
  {
    "id": "Hero_Monkey",
    "source": "resources.assets:1430",
    "kind": "hero",
    "rarity": 2,
    "discoveryBonus": 10,
    "discoveryResource": "fruit",
    "foilBonus": 0
  },
  {
    "id": "Hero_Jaguar",
    "source": "resources.assets:1429",
    "kind": "hero",
    "rarity": 1,
    "discoveryBonus": 10,
    "discoveryResource": "fruit",
    "foilBonus": 0
  },
  {
    "id": "Hero_Bear",
    "source": "resources.assets:1428",
    "kind": "hero",
    "rarity": 3,
    "discoveryBonus": 10,
    "discoveryResource": "fruit",
    "foilBonus": 0
  },
  {
    "id": "Tome_Earthquake",
    "source": "sharedassets1.assets:2709",
    "kind": "tome",
    "rarity": 3,
    "discoveryBonus": 20,
    "discoveryResource": "fruit",
    "foilBonus": 5
  },
  {
    "id": "Hero7_Warlord",
    "source": "sharedassets1.assets:2676",
    "kind": "hero",
    "rarity": 0,
    "discoveryBonus": 5,
    "discoveryResource": "shard",
    "foilBonus": 0
  },
  {
    "id": "Hero7_AstralFisher",
    "source": "sharedassets1.assets:2674",
    "kind": "hero",
    "rarity": 1,
    "discoveryBonus": 5,
    "discoveryResource": "shard",
    "foilBonus": 0
  },
  {
    "id": "Hero7_Icebourne",
    "source": "sharedassets1.assets:2675",
    "kind": "hero",
    "rarity": 2,
    "discoveryBonus": 5,
    "discoveryResource": "shard",
    "foilBonus": 0
  },
  {
    "id": "Tome_Blizzard",
    "source": "sharedassets1.assets:2706",
    "kind": "tome",
    "rarity": 3,
    "discoveryBonus": 15,
    "discoveryResource": "shard",
    "foilBonus": 7
  },
  {
    "id": "Hero9_BlackHole",
    "source": "resources.assets:1425",
    "kind": "hero",
    "rarity": 0,
    "discoveryBonus": 100,
    "discoveryResource": "zenith",
    "foilBonus": 0
  },
  {
    "id": "Hero9_Supernova",
    "source": "resources.assets:1427",
    "kind": "hero",
    "rarity": 2,
    "discoveryBonus": 100,
    "discoveryResource": "zenith",
    "foilBonus": 0
  },
  {
    "id": "Hero9_Quasar",
    "source": "resources.assets:1426",
    "kind": "hero",
    "rarity": 1,
    "discoveryBonus": 100,
    "discoveryResource": "zenith",
    "foilBonus": 0
  },
  {
    "id": "Tome_Transmutation",
    "source": "resources.assets:1500",
    "kind": "tome",
    "rarity": 3,
    "discoveryBonus": 50,
    "discoveryResource": "zenith",
    "foilBonus": 10
  },
  {
    "id": "Hero_Skeleton",
    "source": "resources.assets:1432",
    "kind": "hero",
    "rarity": 0,
    "discoveryBonus": 10,
    "discoveryResource": "mastery",
    "foilBonus": 0
  },
  {
    "id": "Tome_CursorDPS",
    "source": "sharedassets1.assets:2708",
    "kind": "tome",
    "rarity": 2,
    "discoveryBonus": 1000,
    "discoveryResource": "mastery",
    "foilBonus": 2
  },
  {
    "id": "Tome_HeroFrenzy",
    "source": "sharedassets1.assets:2711",
    "kind": "tome",
    "rarity": 3,
    "discoveryBonus": 0,
    "discoveryResource": "mastery",
    "foilBonus": 5
  },
  {
    "id": "Monster1_Caveling",
    "source": "resources.assets:1445",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 25,
    "discoveryResource": "mastery",
    "foilBonus": 1,
    "hp": 2,
    "damage": 1,
    "cooldown": 1.25
  },
  {
    "id": "Monster1_Raider",
    "source": "resources.assets:1446",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 25,
    "discoveryResource": "mastery",
    "foilBonus": 1,
    "hp": 5,
    "damage": 1.5,
    "cooldown": 1.2000000476837158
  },
  {
    "id": "Boss1_Apogre",
    "source": "resources.assets:1434",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 100,
    "discoveryResource": "mastery",
    "foilBonus": 3,
    "hp": 250,
    "damage": 3,
    "cooldown": 0.6000000238418579
  },
  {
    "id": "Monster2_Overseer",
    "source": "resources.assets:1447",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 100,
    "discoveryResource": "mastery",
    "foilBonus": 2,
    "hp": 12,
    "damage": 3,
    "cooldown": 0.5
  },
  {
    "id": "Boss2_Beast",
    "source": "resources.assets:1435",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 1000,
    "discoveryResource": "mastery",
    "foilBonus": 4,
    "hp": 460,
    "damage": 3,
    "cooldown": 1.5
  },
  {
    "id": "Monster3_Shadow",
    "source": "resources.assets:1448",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 1000,
    "discoveryResource": "mastery",
    "foilBonus": 2,
    "hp": 28,
    "damage": 2.5,
    "cooldown": 1.5
  },
  {
    "id": "Boss3_Witch",
    "source": "resources.assets:1436",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 10000,
    "discoveryResource": "mastery",
    "foilBonus": 5,
    "hp": 900,
    "damage": 4,
    "cooldown": 1
  },
  {
    "id": "Monster4_Sentinel",
    "source": "resources.assets:1453",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 50,
    "discoveryResource": "mastery",
    "foilBonus": 3,
    "hp": 7,
    "damage": 1.5,
    "cooldown": 1.2000000476837158
  },
  {
    "id": "Monster4_Bandit",
    "source": "resources.assets:1449",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 250,
    "discoveryResource": "mastery",
    "foilBonus": 3,
    "hp": 14,
    "damage": 1.5,
    "cooldown": 1.600000023841858
  },
  {
    "id": "Monster4_Minorat1",
    "source": "resources.assets:1451",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 2500,
    "discoveryResource": "mastery",
    "foilBonus": 4,
    "hp": 360,
    "damage": 9,
    "cooldown": 0.6000000238418579
  },
  {
    "id": "Boss4_Forger",
    "source": "resources.assets:1438",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 1000000,
    "discoveryResource": "mastery",
    "foilBonus": 7,
    "hp": 35000,
    "damage": 15,
    "cooldown": 0.550000011920929
  },
  {
    "id": "Monster6_Spider",
    "source": "resources.assets:1464",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 5,
    "discoveryResource": "fruit",
    "foilBonus": 2,
    "hp": 4.5,
    "damage": 1,
    "cooldown": 0.5
  },
  {
    "id": "Monster6_SpiderSmall",
    "source": "resources.assets:1465",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 5,
    "discoveryResource": "fruit",
    "foilBonus": 2,
    "hp": 2,
    "damage": 0.8999999761581421,
    "cooldown": 0.6000000238418579
  },
  {
    "id": "Monster6_Digger",
    "source": "resources.assets:1463",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 5,
    "discoveryResource": "fruit",
    "foilBonus": 2,
    "hp": 8.5,
    "damage": 1.2999999523162842,
    "cooldown": 0.699999988079071
  },
  {
    "id": "Boss6_SpiderQueen",
    "source": "resources.assets:1440",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 250,
    "discoveryResource": "fruit",
    "foilBonus": 10,
    "hp": 220,
    "damage": 1,
    "cooldown": 2
  },
  {
    "id": "Monster5_Zombie",
    "source": "resources.assets:1458",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 15,
    "discoveryResource": "skull",
    "foilBonus": 3,
    "hp": 12,
    "damage": 9,
    "cooldown": 1.2000000476837158
  },
  {
    "id": "Monster5_ZombieRunner",
    "source": "resources.assets:1460",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 15,
    "discoveryResource": "skull",
    "foilBonus": 3,
    "hp": 19,
    "damage": 16,
    "cooldown": 1.5
  },
  {
    "id": "Monster5_ZombieExplosive",
    "source": "resources.assets:1459",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 15,
    "discoveryResource": "skull",
    "foilBonus": 3,
    "hp": 21,
    "damage": 4.5,
    "cooldown": 0.5
  },
  {
    "id": "Boss5_Niro",
    "source": "resources.assets:1439",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 150,
    "discoveryResource": "skull",
    "foilBonus": 10,
    "hp": 2500,
    "damage": 22,
    "cooldown": 0.699999988079071
  },
  {
    "id": "Monster7_Troll",
    "source": "resources.assets:1467",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 5,
    "discoveryResource": "shard",
    "foilBonus": 5,
    "hp": 220,
    "damage": 17,
    "cooldown": 0.5
  },
  {
    "id": "Monster7_SpikedMammoth",
    "source": "resources.assets:1466",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 5,
    "discoveryResource": "shard",
    "foilBonus": 5,
    "hp": 320,
    "damage": 27,
    "cooldown": 0.6000000238418579
  },
  {
    "id": "Boss7_FrozenHead",
    "source": "resources.assets:1442",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 100,
    "discoveryResource": "shard",
    "foilBonus": 10,
    "hp": 3200,
    "damage": 30,
    "cooldown": 0.10000000149011612
  },
  {
    "id": "Monster8_Acolyte",
    "source": "sharedassets1.assets:2681",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 20,
    "discoveryResource": "zenith",
    "foilBonus": 5,
    "hp": 800,
    "damage": 80,
    "cooldown": 1.7000000476837158
  },
  {
    "id": "Monster9_BouncingBall",
    "source": "resources.assets:1470",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 50,
    "discoveryResource": "zenith",
    "foilBonus": 5,
    "hp": 450,
    "damage": 0,
    "cooldown": 0
  },
  {
    "id": "Monster9_CrystalTurret",
    "source": "resources.assets:1471",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 200,
    "discoveryResource": "zenith",
    "foilBonus": 5,
    "hp": 100,
    "damage": 25,
    "cooldown": 0.25
  },
  {
    "id": "Boss9_Final",
    "source": "sharedassets1.assets:2680",
    "kind": "enemy",
    "rarity": null,
    "discoveryBonus": 0,
    "discoveryResource": "zenith",
    "foilBonus": 15,
    "hp": 22000,
    "damage": 120,
    "cooldown": 1
  }
] as const;
