import type { CodexTextId } from "./bph-codex-data";
import type { Lang } from "./i18n";

export type CodexHistoryText = Readonly<Record<Lang, string>>;
export type CodexBattleSide = "joseon" | "joseon-ming" | "japan" | "eastern-army";
export type CodexBattleVerdict = "victory" | "defeat" | "defended" | "uncertain";

/** Titles, publishers, read receipts and claim checks: review/codex-history/sources.json. */
export const BPH_CODEX_HISTORY_SOURCES = {
  gwon: "https://encykorea.aks.ac.kr/Article/E0007022",
  yi: "https://encykorea.aks.ac.kr/Article/E0044900",
  kim: "https://encykorea.aks.ac.kr/Article/E0009658",
  gwak: "https://encykorea.aks.ac.kr/Article/E0004695",
  samyeong: "https://encykorea.aks.ac.kr/Article/E0041805",
  sin: "https://encykorea.aks.ac.kr/Article/E0032901",
  song: "https://encykorea.aks.ac.kr/Article/E0030855",
  hwang: "https://encykorea.aks.ac.kr/Article/E0065345",
  jinju: "https://encykorea.aks.ac.kr/Article/E0054918",
  haengju: "https://encykorea.aks.ac.kr/Article/E0062859",
  byeokjegwan: "https://encykorea.aks.ac.kr/Article/E0022875",
  myeongnyang: "https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_i302300",
  kato: "https://www.pref.ehime.jp/ehimenotakara/08.html",
  katoSide: "https://www.mcvb.jp/kankou/detail1.php?cid=5&sid=124",
  nabeshima: "https://online.bunka.go.jp/db/heritages/detail/285126",
  todo: "https://www.info.city.tsu.mie.jp/kosodate_kyouiku/kyouikuiinkai/1004357/1004663/1004713/1004738.html",
  weapons: "https://encykorea.aks.ac.kr/Article/E0023081",
  monk: "https://encykorea.aks.ac.kr/Article/E0055712",
  hwacha: "https://encykorea.aks.ac.kr/Article/E0064882",
  cannon: "https://encykorea.aks.ac.kr/Article/E0056009",
  ship: "https://encykorea.aks.ac.kr/Article/E0059680",
} as const;
export type CodexHistorySourceUrl = typeof BPH_CODEX_HISTORY_SOURCES[keyof typeof BPH_CODEX_HISTORY_SOURCES];
export type CodexHistoryFact = {
  readonly text: CodexHistoryText;
  readonly sourceUrls: readonly [CodexHistorySourceUrl, ...CodexHistorySourceUrl[]];
};
export type CodexBattleHistory = CodexHistoryFact & {
  readonly id: string;
  readonly name: CodexHistoryText;
  /** Outcome belongs to this side, never to the player or the game's enemy slot. */
  readonly side: CodexBattleSide;
  readonly verdict: CodexBattleVerdict;
};
export type CodexHistoryRecord = {
  readonly kind: "person";
  readonly achievement: CodexHistoryFact;
  readonly anecdote: CodexHistoryFact;
  readonly battles: readonly CodexBattleHistory[];
} | {
  readonly kind: "unit";
  /** A class represents no identifiable individual or historically attested detachment. */
  readonly achievement: null;
  readonly anecdote: CodexHistoryFact;
  readonly battles: readonly [];
};

export const BPH_CODEX_HISTORY_LABELS = {
  achievement: { ko: "주요 전공", en: "Achievements" },
  battles: { ko: "전투별 평가", en: "Battle outcomes" },
  anecdote: { ko: "일화·배경", en: "Anecdote / background" },
  unit: { ko: "병종 설명 · 개인 전공 해당 없음", en: "Unit background · individual achievements do not apply" },
  sources: { ko: "출처", en: "Sources" },
} as const satisfies Readonly<Record<string, CodexHistoryText>>;
export const BPH_CODEX_VERDICT_LABELS = {
  victory: { ko: "승전", en: "Victory" },
  defeat: { ko: "패전", en: "Defeat" },
  defended: { ko: "방어 성공", en: "Defense held" },
  uncertain: { ko: "판정 유보", en: "Outcome unconfirmed" },
} as const satisfies Readonly<Record<CodexBattleVerdict, CodexHistoryText>>;
export const BPH_CODEX_BATTLE_SIDE_LABELS = {
  joseon: { ko: "조선군", en: "Joseon forces" },
  "joseon-ming": { ko: "조명 연합군", en: "Joseon-Ming allied forces" },
  japan: { ko: "일본군", en: "Japanese forces" },
  "eastern-army": { ko: "동군", en: "Eastern Army" },
} as const satisfies Readonly<Record<CodexBattleSide, CodexHistoryText>>;

const S = BPH_CODEX_HISTORY_SOURCES;
function fact(ko: string, en: string, ...sourceUrls: CodexHistoryFact["sourceUrls"]): CodexHistoryFact {
  return { text: { ko, en }, sourceUrls };
}

/** Use text[language()] with the existing i18n Lang; do not feed English through t(). */
export const BPH_CODEX_HISTORY: Readonly<Record<CodexTextId, CodexHistoryRecord>> = {
  gwon_yul: {
    kind: "person",
    achievement: fact("이치와 행주에서 일본군을 물리쳤다.", "Repelled Japanese forces at Ichi and Haengju.", S.gwon),
    anecdote: fact("행주로 옮기기 전 독산성에 진지를 구축해 일본군을 견제했다.", "Before moving to Haengju, he established a position at Doksanseong to check Japanese forces.", S.gwon),
    battles: [
      { id: "ichi-1592", name: { ko: "이치", en: "Ichi" }, side: "joseon", verdict: "victory", ...fact("황진과 함께 일본군의 전주 방면 진격을 저지했다.", "With Hwang Jin, stopped the Japanese advance toward Jeonju.", S.gwon) },
      { id: "doksanseong-1592", name: { ko: "독산성", en: "Doksanseong" }, side: "joseon", verdict: "defended", ...fact("성책을 지키며 버텨 일본군의 철수를 이끌었다.", "Held the fortified position until Japanese forces withdrew.", S.gwon) },
      { id: "haengju-1593", name: { ko: "행주", en: "Haengju" }, side: "joseon", verdict: "victory", ...fact("관군과 승병의 방어를 지휘해 공격을 물리쳤다.", "Directed government troops and monk soldiers in repelling the assault.", S.gwon) },
    ],
  },
  yi_sunsin: {
    kind: "person",
    achievement: fact("옥포·한산·명량 등 해전에서 조선 수군을 이끌어 승리했다.", "Led Joseon naval victories at Okpo, Hansan and Myeongnyang.", S.yi),
    anecdote: fact("노량에서 전사했으며, 조명 연합 수군은 일본 함대와 싸워 승리했다.", "He was killed at Noryang, where the allied Joseon-Ming fleet won the battle.", S.yi),
    battles: [
      { id: "okpo-1592", name: { ko: "옥포", en: "Okpo" }, side: "joseon", verdict: "victory", ...fact("출전한 조선 수군이 일본 함선을 격파했다.", "The Joseon fleet defeated Japanese ships.", S.yi) },
      { id: "hansan-1592", name: { ko: "한산", en: "Hansan" }, side: "joseon", verdict: "victory", ...fact("일본 함대를 넓은 바다로 유인해 격파했다.", "Lured the Japanese fleet into open water and defeated it.", S.yi) },
      { id: "myeongnyang-1597", name: { ko: "명량", en: "Myeongnyang" }, side: "joseon", verdict: "victory", ...fact("재정비한 수군으로 일본 함대의 공격을 물리쳤다.", "Repelled the Japanese fleet with the reorganized Joseon navy.", S.myeongnyang) },
      { id: "noryang-1598", name: { ko: "노량", en: "Noryang" }, side: "joseon-ming", verdict: "victory", ...fact("연합 수군은 승리했으나 이순신은 전사했다.", "The allied fleet won, but Yi Sun-sin was killed.", S.yi) },
    ],
  },
  kim_simin: {
    kind: "person",
    achievement: fact("제1차 진주성 전투에서 성 방어를 지휘했다.", "Commanded the defense in the first battle of Jinju.", S.kim),
    anecdote: fact("진주목사로서 무기를 마련하고 병사들에게 사용법을 익히게 했다.", "As Jinju magistrate, prepared weapons and trained soldiers to use them.", S.kim),
    battles: [
      { id: "jinju-1592", name: { ko: "제1차 진주성", en: "First battle of Jinju" }, side: "joseon", verdict: "victory", ...fact("일본군의 성 공격을 막아냈다.", "Repelled the Japanese siege.", S.kim) },
    ],
  },
  gwak_jaeu: {
    kind: "person",
    achievement: fact("의병을 이끌고 정암진에서 일본군의 도하를 저지했다.", "Led militia in stopping a Japanese river crossing at Jeongamjin.", S.gwak),
    anecdote: fact("붉은 옷을 입고 홍의장군이라 불렸으며 유격 전술을 구사했다.", "Known as the Red-Robed General, he used guerrilla tactics.", S.gwak),
    battles: [
      { id: "jeongamjin-1592", name: { ko: "정암진", en: "Jeongamjin" }, side: "joseon", verdict: "victory", ...fact("일본군을 물리쳐 호남 방면 진출을 저지했다.", "Defeated Japanese forces and blocked their advance toward Honam.", S.gwak) },
      { id: "hwawang-1597", name: { ko: "화왕산성", en: "Hwawang Fortress" }, side: "joseon", verdict: "defended", ...fact("성을 고수해 일본군의 접근을 막았다.", "Held the fortress and deterred Japanese forces from approaching.", S.gwak) },
    ],
  },
  samyeong: {
    kind: "person",
    achievement: fact("승군을 이끌고 평양성 수복에 기여했다.", "Led monk soldiers and contributed to the recovery of Pyongyang.", S.samyeong),
    anecdote: fact("1604년 일본에 사신으로 가서 포로 송환과 국교 문제를 논의했다.", "In 1604 he went to Japan as an envoy to discuss captives' return and diplomatic relations.", S.samyeong),
    battles: [
      { id: "pyongyang-1593", name: { ko: "평양성 수복", en: "Recovery of Pyongyang" }, side: "joseon-ming", verdict: "victory", ...fact("승군이 연합군의 성 수복에 참여했다.", "Monk soldiers participated in the allied recovery of the city.", S.samyeong) },
    ],
  },
  sin_rip: {
    kind: "person",
    achievement: fact("북방 방어에서 공을 세운 무장이었다.", "A commander who distinguished himself in northern frontier defense.", S.sin),
    anecdote: fact("탄금대에서 기병 활용을 택했으나 포위되어 패했다.", "At Tangeumdae he chose to use cavalry but was surrounded and defeated.", S.sin),
    battles: [
      { id: "tangeumdae-1592", name: { ko: "탄금대", en: "Tangeumdae" }, side: "joseon", verdict: "defeat", ...fact("일본군에 포위되어 패했고 신립은 순절했다.", "His forces were surrounded and defeated; Sin Rip died.", S.sin) },
    ],
  },
  song_sanghyeon: {
    kind: "person",
    achievement: fact("동래성에서 침입군에 맞서 항전했다.", "Resisted the invading army at Dongnae Fortress.", S.song),
    anecdote: fact("일본군의 길을 빌려 달라는 요구를 거절하고 항전의 뜻을 밝혔다.", "Rejected the Japanese demand for passage and declared his intent to resist.", S.song),
    battles: [
      { id: "dongnae-1592", name: { ko: "동래성", en: "Dongnae" }, side: "joseon", verdict: "defeat", ...fact("성이 함락되었고 송상현은 순절했다.", "The fortress fell and Song Sang-hyeon died.", S.song) },
    ],
  },
  hwang_jin: {
    kind: "person",
    achievement: fact("이치 방어에 활약하고 제2차 진주성 전투에서 항전했다.", "Helped defend Ichi and fought in the second battle of Jinju.", S.hwang, S.gwon),
    anecdote: fact("일본에 다녀온 뒤 침략에 대비해 무예를 단련했다.", "After visiting Japan, he trained in martial skills in preparation for an invasion.", S.hwang),
    battles: [
      { id: "ichi-1592", name: { ko: "이치", en: "Ichi" }, side: "joseon", verdict: "victory", ...fact("권율과 함께 일본군을 격퇴했다.", "Helped Gwon Yul repel Japanese forces.", S.gwon) },
      { id: "jinju-1593", name: { ko: "제2차 진주성", en: "Second battle of Jinju" }, side: "joseon", verdict: "defeat", ...fact("성 방어 중 전사했고 성은 끝내 함락되었다.", "He died defending the fortress, which ultimately fell.", S.hwang, S.jinju) },
    ],
  },
  japan_ukita: {
    kind: "person",
    achievement: fact("일본군 총대장으로 행주산성 공격을 지휘했다.", "Commanded the Japanese assault on Haengju Fortress.", S.haengju),
    anecdote: fact("행주 공격에 나섰다가 부상을 입고 물러났다.", "Was wounded during the Haengju assault and withdrew.", S.haengju),
    battles: [
      { id: "haengju-1593", name: { ko: "행주", en: "Haengju" }, side: "japan", verdict: "defeat", ...fact("공격군이 성을 함락하지 못하고 퇴각했다.", "The attacking army failed to take the fortress and withdrew.", S.haengju) },
    ],
  },
  japan_konishi: {
    kind: "person",
    achievement: fact("임진왜란 때 일본군 선봉을 지휘했다.", "Commanded Japanese advance forces during the invasion.", S.sin),
    anecdote: fact("평양에서 물러난 뒤 행주 공격에 참여했으나 다시 패했다.", "After retreating from Pyongyang, took part in the unsuccessful Haengju assault.", S.haengju),
    battles: [
      { id: "tangeumdae-1592", name: { ko: "탄금대", en: "Tangeumdae" }, side: "japan", verdict: "victory", ...fact("신립의 군대를 공격해 격파했다.", "Attacked and defeated Sin Rip's army.", S.sin) },
      { id: "pyongyang-1593", name: { ko: "평양성", en: "Pyongyang" }, side: "japan", verdict: "defeat", ...fact("연합군의 공격에 패해 서울로 물러났다.", "Was defeated by allied forces and retreated to Seoul.", S.byeokjegwan) },
      { id: "haengju-1593", name: { ko: "행주", en: "Haengju" }, side: "japan", verdict: "defeat", ...fact("선봉 공격이 저지되어 물러났다.", "His advance assault was repelled.", S.haengju) },
    ],
  },
  japan_wakizaka: {
    kind: "person",
    achievement: fact("일본 수군을 이끌고 조선 침공에 참여했다.", "Led Japanese naval forces in the invasion of Joseon.", S.yi),
    anecdote: fact("한산에서 이순신의 유인 전술에 맞서 싸웠다.", "Fought against Yi Sun-sin's lure-and-attack tactics at Hansan.", S.yi),
    battles: [
      { id: "hansan-1592", name: { ko: "한산", en: "Hansan" }, side: "japan", verdict: "defeat", ...fact("함대가 한산 앞바다로 유인되어 격파되었다.", "His fleet was lured into the waters off Hansan and defeated.", S.yi) },
    ],
  },
  japan_kobayakawa: {
    kind: "person",
    achievement: fact("벽제관에서 일본군의 반격에 참여했다.", "Took part in the Japanese counterattack at Byeokjegwan.", S.byeokjegwan),
    anecdote: fact("개성에서 물러난 뒤 서울 성 밖에서 명군과 맞섰다.", "After withdrawing from Kaesong, he faced Ming forces outside Seoul.", S.byeokjegwan),
    battles: [
      { id: "ichi-1592", name: { ko: "이치", en: "Ichi" }, side: "japan", verdict: "defeat", ...fact("전주 방면 진격이 조선군에 저지되었다.", "The advance toward Jeonju was stopped by Joseon forces.", S.gwon) },
      { id: "byeokjegwan-1593", name: { ko: "벽제관", en: "Byeokjegwan" }, side: "japan", verdict: "victory", ...fact("일본군의 반격으로 명군이 물러났다.", "The Japanese counterattack forced Ming forces to withdraw.", S.byeokjegwan) },
    ],
  },
  japan_kato_yoshiaki: {
    kind: "person",
    achievement: fact("시즈가타케에서 이름을 알렸고 세키가하라 전공으로 영지가 늘었다.", "Became known at Shizugatake and gained territory for his service at Sekigahara.", S.kato),
    anecdote: fact("1602년 마쓰야마성 축성을 시작했다.", "Began constructing Matsuyama Castle in 1602.", S.kato),
    battles: [
      { id: "sekigahara-1600", name: { ko: "세키가하라", en: "Sekigahara" }, side: "eastern-army", verdict: "victory", ...fact("동군에 가담해 전공을 세웠다.", "Served with the victorious Eastern Army.", S.kato, S.katoSide) },
    ],
  },
  japan_kurushima: {
    kind: "person",
    achievement: fact("일본 수군 장수로 명량 해전에 참전했다.", "Served as a Japanese naval commander at Myeongnyang.", S.myeongnyang),
    anecdote: fact("명량에서 일본 수군이 패할 때 전사했다.", "Was killed during the Japanese naval defeat at Myeongnyang.", S.myeongnyang),
    battles: [
      { id: "myeongnyang-1597", name: { ko: "명량", en: "Myeongnyang" }, side: "japan", verdict: "defeat", ...fact("일본 수군이 패했고 구루시마는 전사했다.", "The Japanese fleet was defeated and Kurushima was killed.", S.myeongnyang) },
    ],
  },
  japan_nabeshima: {
    kind: "person",
    achievement: fact("일본군 장수로 조선 침공에 참여했다.", "Participated in the invasion of Joseon as a Japanese commander.", S.nabeshima),
    anecdote: fact("조선에 있던 나오시게에게 보낸 봉행들의 서장이 남아 있다.", "A letter from the commissioners to Naoshige, then in Joseon, survives.", S.nabeshima),
    battles: [
      { id: "korea-campaign-1592-1598", name: { ko: "조선 침공 전역", en: "Campaign in Joseon" }, side: "japan", verdict: "uncertain", ...fact("참전은 확인되지만 이 서장만으로 개별 전투의 승패는 판정하지 않는다.", "Participation is attested; this letter alone does not establish an individual battle outcome.", S.nabeshima) },
    ],
  },
  japan_todo: {
    kind: "person",
    achievement: fact("수군을 지휘했고 뒤에 세키가하라에서 동군으로 싸웠다.", "Commanded naval forces and later fought for the Eastern Army at Sekigahara.", S.todo),
    anecdote: fact("전쟁 뒤 이마바리성과 쓰성 등의 축성에 관여했다.", "Later worked on castles including Imabari and Tsu.", S.todo),
    battles: [
      { id: "myeongnyang-1597", name: { ko: "명량", en: "Myeongnyang" }, side: "japan", verdict: "defeat", ...fact("일본 수군이 패했고 도도는 부상을 입었다.", "The Japanese fleet was defeated and Todo was wounded.", S.myeongnyang) },
      { id: "sekigahara-1600", name: { ko: "세키가하라", en: "Sekigahara" }, side: "eastern-army", verdict: "victory", ...fact("동군에 속해 승리했다.", "Fought on the victorious Eastern Army side.", S.todo) },
    ],
  },
  unit_militia: {
    kind: "unit", achievement: null, battles: [],
    anecdote: fact("의병은 고장을 지키려 모인 집단이다. 이 카드는 특정 의병장이나 부대를 가리키지 않는다.", "Militia gathered to defend their communities. This card identifies no individual commander or specific detachment.", S.gwak),
  },
  unit_chongtong: {
    kind: "unit", achievement: null, battles: [],
    anecdote: fact("총통은 화약으로 탄환이나 큰 화살을 쏘는 화포다. 이 카드는 이를 다루는 병종이다.", "Chongtong are gunpowder cannon firing shot or large arrows. This card represents their crews.", S.cannon),
  },
  unit_spearman: {
    kind: "unit", achievement: null, battles: [],
    anecdote: fact("창은 적을 찌르는 장병기다. 병종 설명을 개인의 무공으로 해석하지 않는다.", "A spear is a long thrusting weapon. This unit description establishes no individual's exploits.", S.weapons),
  },
  unit_archer: {
    kind: "unit", achievement: null, battles: [],
    anecdote: fact("활과 화살로 싸우는 병종이다. 특정 인물이나 전투 참가 부대는 아니다.", "A troop class using bows and arrows, without a specific personal or battlefield identity.", S.weapons),
  },
  unit_monk: {
    kind: "unit", achievement: null, battles: [],
    anecdote: fact("임진왜란에는 승려들이 승군을 이루어 싸웠다. 이 카드는 처영 개인과 구분한다.", "Monks formed fighting forces during the war. This card is distinct from Cheoyeong as an individual.", S.monk),
  },
  unit_ming_cavalry: {
    kind: "unit", achievement: null, battles: [],
    anecdote: fact("말을 타고 싸우는 병종이다. 신립의 기병 운용 기록이 이 카드의 참전 증거가 되지는 않는다.", "A mounted troop class. Records of Sin Rip's cavalry do not attest this card's participation in a battle.", S.sin),
  },
  unit_hwacha: {
    kind: "unit", achievement: null, battles: [],
    anecdote: fact("화차는 수레에 화기를 얹은 병기다. 이 병종에 특정 인물의 전공을 부여하지 않는다.", "Hwacha mounted weapons on a cart. This troop class is not assigned an individual's achievements.", S.hwacha),
  },
  unit_panokseon: {
    kind: "unit", achievement: null, battles: [],
    anecdote: fact("판옥선은 위층 갑판에 전투 공간을 둔 조선 수군의 전선이다.", "Panokseon were Joseon warships with an upper deck used as a fighting platform.", S.ship),
  },
};
