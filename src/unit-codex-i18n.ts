import type { Lang } from "./i18n";
import type { IconName } from "./icons";
import type { Run } from "./rules";
import { bphMilitiaMomentumCap } from "./bph-general-command";

type SpecialDescription = (run?: Run) => string;
type SpecialCopy = {
  readonly name: string;
  readonly description: SpecialDescription;
  readonly value: (amount: number) => string;
};
type SpecialText = Readonly<Record<Lang, SpecialCopy>> & { readonly icon: IconName; readonly values: readonly number[] };
type ValueUnit = "chance" | "percent" | "people" | "times" | "blades" | "shots" | "seconds";
const amountText = (lang: Lang, unit: ValueUnit, amount: number): string => {
  const plus = amount > 0 ? "+" : "";
  if (unit === "chance") return `${amount}%`;
  if (unit === "percent") return `${plus}${amount}%`;
  const ko = { people: "명", times: "번", blades: "개", shots: "발", seconds: "초" } as const;
  const en = { people: "", times: "×", blades: "", shots: "", seconds: "s" } as const;
  return `${plus}${amount}${(lang === "ko" ? ko : en)[unit]}`;
};
const special = (icon: IconName, nameKo: string, nameEn: string,
  descKo: string | SpecialDescription, descEn: string | SpecialDescription,
  unit: ValueUnit, values: readonly number[]): SpecialText => ({
  icon,
  ko: { name: nameKo, description: typeof descKo === "string" ? () => descKo : descKo, value: amount => amountText("ko", unit, amount) },
  en: { name: nameEn, description: typeof descEn === "string" ? () => descEn : descEn, value: amount => amountText("en", unit, amount) },
  values,
});

const militiaCapWords: Readonly<Record<Lang, Readonly<Partial<Record<number, string>>>>> = {
  ko: { 5: "다섯", 6: "여섯", 7: "일곱", 8: "여덟" },
  en: { 5: "five", 6: "six", 7: "seven", 8: "eight" },
};
const militiaCapWord = (lang: Lang, run?: Run): string => {
  const cap = bphMilitiaMomentumCap(run);
  return militiaCapWords[lang][cap] ?? String(cap);
};

/** Values shown in the codex follow the approved special-upgrade table. */
export const UNIT_SPECIAL_TEXT: Readonly<Partial<Record<string, SpecialText>>> = {
  Hero1_Squire: special("pierce", "꿰뚫는 창", "Piercing Spear",
    "찌를 때 일정 확률로 표적 주변의 적도 함께 맞습니다.", "A spear thrust can also hit enemies around its target.", "chance", [10, 20, 30]),
  Hero4_Bannerman: special("reinforce", "군령 전파", "Rallying Orders",
    "공격할 때 더 많은 아군을 강화합니다.", "Each attack strengthens more allies.", "people", [1, 2, 3]),
  Hero2_Knight: special("shield", "방패 반격", "Shield Counter",
    "막을 확률이 오르고, 막으면 주변 적을 잠시 기절시킵니다.", "Adds to block chance and briefly stuns nearby enemies on a block.", "chance", [7, 14, 21]),
  Hero5_Treant: special("reinforce", "말뚝 전달", "Passing Stakes",
    "던진 말뚝이 더 많은 아군에게 튑니다.", "Thrown stakes bounce to more allies.", "times", [1, 2, 3]),
  Hero7_Icebourne: special("sword", "칼날 추가", "Extra Blades",
    "몸 둘레를 도는 칼날이 늘어납니다.", "More blades circle the spearman.", "blades", [1, 2, 3]),
  Hero_Skeleton: special("skull", "원혼 폭발", "Final Burst",
    "쓰러질 때 일정 확률로 폭발합니다.", "May explode when defeated.", "chance", [25, 50, 75]),
  Hero1_Barbarian: special("sword", "의병의 기세", "Militia Spirit",
    run => `주변의 다른 의병 한 명마다 공격력이 오릅니다. 최대 ${militiaCapWord("ko", run)} 명까지 연계됩니다.`,
    run => `Gains attack for each nearby fellow militiaman, up to ${militiaCapWord("en", run)}.`, "percent", [4, 6, 8]),
  Hero_Rat: special("motion", "날쌘 몸", "Quick Dodge",
    "적의 공격을 일정 확률로 피합니다.", "Has a chance to dodge enemy attacks.", "chance", [10, 20, 30]),
  Hero_Jaguar: special("heart", "기습 회복", "Recovery on Kill",
    "적을 처치하면 일정 확률로 체력을 회복합니다.", "May recover HP after defeating an enemy.", "chance", [25, 50, 75]),
  Hero3_WitchDoctor: special("skull", "독 번짐", "Spreading Poison",
    "독에 걸린 적이 모든 공격에서 더 큰 피해를 받습니다.", "Poisoned enemies take more damage from all attacks.", "percent", [20, 40, 60]),
  Hero4_Duelist: special("coin", "전리품", "Spoils of Battle",
    "적을 처치할 때 엽전을 얻을 확률이 오릅니다.", "Defeated enemies are more likely to yield coins.", "chance", [10, 20, 30]),
  Hero1_Archer: special("crossbow", "화살 추가", "Extra Arrows",
    "한 번에 더 많은 화살을 쏩니다.", "Fires more arrows per shot.", "shots", [1, 2, 3]),
  Hero3_DemonSlayer: special("crossbow", "급소 사격", "Vital Shot",
    "화살이 치명타를 낼 확률이 오릅니다.", "Arrows are more likely to land a critical hit.", "chance", [7, 14, 21]),
  Hero_Monkey: special("crossbow", "튕기는 화살", "Bouncing Arrows",
    "적을 맞힌 화살이 다음 적에게 더 많이 튑니다.", "Arrows bounce to more enemies after a hit.", "times", [1, 2, 3]),
  Hero2_Monk: special("motion", "연속 돌진", "Chain Dash",
    "한 번 공격할 때 더 여러 번 돌진합니다.", "Dashes more times with each attack.", "times", [1, 2, 3]),
  Hero3_Illusionist: special("reinforce", "분신 추가", "Extra Decoys",
    "모집할 때 분신이 더 많이 나옵니다.", "More decoys appear when recruited.", "people", [1, 2, 3]),
  Hero5_Beastmaster: special("reinforce", "동반 병력 추가", "Extra Scouts",
    "모집할 때 척후 의병을 더 많이 데려옵니다.", "Brings more Militia Scouts when recruited.", "people", [1, 2, 3]),
  Hero_Bear: special("up", "거인 등장", "Giant Arrival",
    "일정 확률로 거인이 되어 나옵니다.", "Has a chance to arrive as a giant.", "chance", [25, 50, 75]),
  Hero2_Pyromancer: special("rocket-cart", "연발 화전", "Fire Arrow Volley",
    "한 번 공격할 때 화전을 더 많이 쏩니다.", "Launches more fire arrows with each attack.", "shots", [1, 2]),
  Hero4_Stormcaller: special("hourglass", "오래가는 회오리", "Lingering Vortex",
    "회오리가 더 오래 남습니다.", "The vortex lasts longer.", "percent", [20, 40, 60]),
  Hero6_Shotgun: special("flash", "탄환 추가", "Extra Pellets",
    "한 번에 더 많은 탄환을 쏩니다.", "Fires more pellets per shot.", "shots", [1, 2, 3]),
  Hero6_BloodMage: special("heart", "흡혈 강화", "Stronger Life Steal",
    "적에게 준 피해에서 돌려받는 체력이 늘어납니다.", "Restores more HP from the damage dealt.", "percent", [20, 40, 60]),
  Hero7_Warlord: special("shield", "가시 갑옷", "Spiked Armor",
    "가시 갑옷을 입고 받은 피해 일부를 적에게 돌려줍니다.", "Wears spiked armor that reflects some damage back at attackers.", "chance", [20, 40, 60]),
  Hero5_Dino: special("motion", "재돌격", "Follow-up Charge",
    "돌격을 마치면 일정 확률로 한 번 더 돌격합니다.", "May charge again after finishing a charge.", "chance", [25, 50, 75]),
  Hero5_Rider: special("pierce", "관통 유지", "Lasting Pierce",
    "화살이 적을 뚫고 지나갈 때 피해가 덜 줄어듭니다.", "Arrows lose less damage when piercing through enemies.", "percent", [10, 20, 30]),
  Hero6_Skelewheel: special("hourglass", "질주 시간", "Longer Run",
    "편곤을 휘두르며 더 오래 달립니다.", "Runs longer while swinging the flail.", "seconds", [1, 2, 3]),
  Hero7_AstralFisher: special("motion", "빠른 당김", "Faster Reel",
    "갈고리에 걸린 적을 더 빨리 끌어옵니다.", "Reels in hooked enemies faster.", "percent", [25, 50, 75]),
  Hero3_Portal: special("reinforce", "빠른 상륙", "Faster Landings",
    "지원 병력을 더 자주 내려 보냅니다.", "Lands reinforcements more often.", "percent", [25, 50, 75]),
};

type UnitText = {
  readonly ko: string; readonly en: string;
  readonly description: { readonly ko: string; readonly en: string };
  readonly reason: string;
};
const entry = (ko: string, en: string, descriptionKo: string, descriptionEn: string, reason: string): UnitText =>
  ({ ko, en, description: { ko: descriptionKo, en: descriptionEn }, reason });

/** Display copy only. Asset IDs, saved identities and combat values never change. */
export const UNIT_CODEX_TEXT: Readonly<Record<string, UnitText>> = {
  Hero1_Archer: entry("궁수", "Archer",
    "사거리 안의 적에게 화살을 쏩니다.",
    "Shoots arrows at enemies within range.", "조선군의 기본 활 병력"),
  Hero1_Barbarian: entry("칼잡이 의병", "Militia Swordsman",
    "앞쪽 부채꼴 안의 적들을 함께 벱니다.; 강화하면 체력이 줄어들수록 더 빠르게 공격합니다.",
    "Cuts enemies in a fan in front.; With the upgrade, attacks faster as health falls.", "의병의 근접 베기로 부채꼴 공격 표현"),
  Hero1_Squire: entry("창병", "Spearman",
    "계급 없는 병졸로, 오장 아래에서 싸웁니다.; 가까운 적을 창으로 찌릅니다.; 진급 강화를 배우면 적을 처치해 오장, 십장, 기총으로 차례로 진급합니다.",
    "A rank-and-file soldier who fights under an Ojang.; Stabs nearby enemies with a spear.; With promotion upgrades, kills earn the ranks of Ojang, Sipjang and Gichong.", "조선식 지휘 계급으로 진급"),
  Hero1_Squire2: entry("오장 창병", "Ojang Spearman",
    "오장으로 진급해 병사 다섯을 이끕니다.; 창병보다 멀리, 세게 찌릅니다.",
    "Promoted to Ojang, leading a squad of five men.; Strikes harder and farther than a basic spearman.", "오장 단계의 기존 창병 외형 유지"),
  Hero1_Squire3: entry("십장 창병", "Sipjang Spearman",
    "십장으로 진급해 병사 열을 이끕니다.; 오장 창병보다 더 세고 빠르게 찌릅니다.",
    "Promoted to Sipjang, leading ten men.; Strikes harder and faster than an Ojang spearman.", "십장 단계의 기존 창병 외형 유지"),
  Hero2_Knight: entry("철갑 창병", "Armored Spearman",
    "적의 공격을 일정 확률로 막습니다.; 막기 기술을 강화하면 공격을 완전히 막았을 때 둘레의 적을 잠시 기절시킵니다.",
    "Has a chance to block enemy attacks.; With the blocking skill upgrade, a fully blocked hit stuns nearby enemies.", "철갑과 방어 동작으로 막기 표현"),
  Hero2_Monk: entry("돌진 승병", "Charging Monk",
    "가까운 적 사이를 연달아 뛰어넘습니다.; 착지 지점 둘레의 적에게 피해를 주고 기절시키며 밀어냅니다.; 도약 중에는 피해를 받지 않습니다.",
    "Leaps between nearby enemies.; Damages, stuns and pushes enemies near each landing.; Takes no damage during the leap.", "공중 도약과 착지 공격"),
  Hero2_Pyromancer: entry("화전 화차병", "Fire Arrow Rocketeer",
    "화전을 쏘아 떨어진 자리 둘레의 적들에게 피해를 줍니다.",
    "Fires a burning arrow that damages enemies around its landing point.", "화염 주문 대신 조선 화전"),
  Hero3_DemonSlayer: entry("명궁", "Sharpshooter",
    "화살이 일정 확률로 치명타가 되어 더 큰 피해를 줍니다.",
    "Arrows have a chance to deal a critical hit for extra damage.", "퇴마 대신 활의 명중 솜씨로 치명타 표현"),
  Hero3_Illusionist: entry("분신 승병", "Decoy Monk",
    "모집될 때 분신들이 함께 나옵니다.; 살아 있는 동안 전투에서 얻는 숙련이 늘어납니다.; 쓰러지면 그 자리 둘레의 적들에게 피해를 줍니다.",
    "Arrives with decoys when recruited.; Increases mastery earned in battle while alive.; On death, bursts and damages nearby enemies.", "분산 진형과 연막으로 분신·사망 폭발 표현"),
  Hero3_Portal: entry("지원 판옥선", "Reinforcement Panokseon",
    "일정한 간격으로 지금까지 발견한 병력을 내려 보냅니다.; 흔한 병력이 더 자주 내리며 같은 지원 판옥선은 나오지 않습니다.; 병력을 여럿 내려 보내면 배가 물러납니다.",
    "Lands previously discovered soldiers at regular intervals.; Common soldiers appear more often, and another reinforcement ship cannot appear.; Withdraws after landing several soldiers.", "판옥선의 지원 병력 상륙으로 대체"),
  Hero3_WitchDoctor: entry("독연 의병", "Poison Smoke Militia",
    "독연 항아리를 던져 맞은 적들을 감염시킵니다.; 떨어진 자리에는 독연이 잠시 남아 안의 적에게 계속 피해를 줍니다.",
    "Throws a poison jar that infects enemies on impact.; Leaves a poison pool for a while, damaging enemies inside over time.", "주술 대신 독연 항아리와 연두 연기"),
  Hero4_Bannerman: entry("기총 창병", "Banner Captain",
    "기총은 깃발 하나 아래 서른 남짓한 병사를 이끕니다.; 공격할 때마다 자신을 뺀 무작위 아군의 다음 공격을 강화합니다.; 강화는 잠시 유지되며 공격하면 사라집니다.",
    "A Gichong leads a banner company of about thirty men.; Each attack strengthens the next attack of a random ally other than itself.; The boost lasts a short while and is spent on an attack.", "조선 군기의 독려로 다음 공격 강화"),
  Hero4_Duelist: entry("도약 의병", "Leaping Militia",
    "멀리 있는 적에게 뛰어들어 착지한 자리 둘레의 적을 잠시 기절시킵니다.; 가까운 적은 바로 벱니다.; 처치할 때 일정 확률로 동전을 얻습니다.",
    "Leaps toward distant enemies and briefly stuns enemies around the landing.; Cuts nearby enemies directly.; Kills have a chance to award a coin.", "의병의 도약과 착지 먼지"),
  Hero4_Stormcaller: entry("회오리 화차병", "Smoke Vortex Rocketeer",
    "표적 자리에 연막 회오리를 일으킵니다.; 회오리는 잠시 떠돌며 안의 적에게 계속 피해를 줍니다.; 휘말린 적을 끌어당겨 돌리다가 내던집니다.",
    "Creates a smoke vortex at the target.; It drifts for a while and keeps damaging enemies inside.; Pulls enemies into a swirl, then throws them out.", "벼락·기상 주문 대신 흰 연막 회오리"),
  Hero9_BlackHole: entry("축지 승병", "Blink Monk",
    "순식간에 표적 자리로 옮겨 가 둘레의 적들에게 피해를 줍니다.; 강화하면 적을 끌어당기거나 옮겨 간 자리에서 밀어냅니다.",
    "Moves instantly to the target and damages nearby enemies.; Upgrades can pull enemies inward or push them away at the destination.", "천체 대신 유격 이동과 청록 바람"),
  Hero9_Quasar: entry("신기전 화차병", "Singijeon Rocketeer",
    "신기전 불줄기를 쏘아 지나는 길의 적마다 한 번씩 피해를 줍니다.; 불줄기는 조금씩 휘며 화면 끝에 닿으면 반대편에서 한 번 더 이어집니다.",
    "Fires an instant bright stream of singijeon fire, hitting each enemy along its path once.; The stream curves slightly and continues once from the opposite edge.", "광선 대신 황금·백색 신기전 불줄기"),
  Hero9_Supernova: entry("불씨 궁수", "Ember Archer",
    "표적 근처에 불씨 항아리를 놓습니다.; 손가락이나 마우스의 공격 범위가 항아리에 닿으면 곧 터집니다.; 폭발은 가까운 항아리에도 불을 붙이며 연쇄로 터진 항아리는 더 큰 피해를 줍니다.; 적이 닿기만 해서는 터지지 않습니다.; 오래 건드리지 않으면 조용히 사라집니다.; 폭발 뒤 남는 불씨는 잠시 보이지만 피해를 주지 않습니다.",
    "Places an ember jar near the target.; Touch it with the finger or mouse attack area to ignite it; it bursts a moment later.; Bursts ignite nearby jars, and chained bursts deal bonus damage.; Enemy contact alone does not trigger it.; Jars left untouched for long vanish quietly.; Sparks linger briefly after a burst and deal no damage.", "초신성·지뢰 대신 불씨 항아리와 황금 불씨"),
  Hero_Bear: entry("철벽 승병", "Defender Monk",
    "둘레의 적들을 한꺼번에 칩니다.; 받는 피해가 줄어들며 감염되지 않습니다.",
    "Hits nearby enemies together.; Takes reduced damage and cannot be infected.", "곰 대신 기존 철벽 승병"),
  Hero_Jaguar: entry("기습 의병", "Ambush Militia",
    "가까운 적에게 빠르게 달려들어 벱니다.; 감염되지 않습니다.",
    "Quickly cuts nearby enemies.; Cannot be infected.", "맹수 대신 기습 의병"),
  Hero_Monkey: entry("속사 궁수", "Rapid Archer",
    "사거리 안의 적에게 화살을 쏩니다.; 감염되지 않습니다.",
    "Shoots arrows at enemies within range.; Cannot be infected.", "원숭이 대신 민첩한 궁수"),
  Hero_Rat: entry("척후 의병", "Militia Scout",
    "가까운 적을 칼로 벱니다.; 감염되지 않습니다.",
    "Cuts nearby enemies with a blade.; Cannot be infected.", "쥐 대신 척후 의병"),
  Hero_Skeleton: entry("원혼 창병", "Fallen Spearman",
    "가까운 적을 창으로 찌릅니다.; 싸우는 동안 체력이 조금씩 줄며 감염되지 않습니다.; 사망 투척을 강화하면 쓰러질 때 가장 가까운 적에게 원혼 파편을 날립니다.",
    "Stabs nearby enemies.; Slowly loses health in battle and cannot be infected.; With the death throw upgrade, sends a fragment at the nearest enemy when it falls.", "해골 대신 오너 허용 원혼과 백색 파편"),
  Hero_SkeletonUpgraded: entry("속공 원혼병", "Swift Fallen Spearman",
    "원혼 창병보다 더 세고 빠르게 찌릅니다.; 싸우는 동안 체력이 조금씩 줄며 감염되지 않습니다.; 사망 투척을 강화하면 쓰러질 때 가장 가까운 적에게 원혼 파편을 날립니다.",
    "Strikes harder and faster than a fallen spearman.; Slowly loses health in battle and cannot be infected.; With the death throw upgrade, sends a fragment at the nearest enemy when it falls.", "강화 원혼도 기존 창병 그림 유지"),
  Hero5_Beastmaster: entry("척후장 승병", "Scout Leader Monk",
    "전투에 나설 때 척후 의병 여럿을 데리고 나옵니다.; 강화하면 동료의 병종이 바뀌고 쓰러진 동료가 다시 합류할 수 있습니다.",
    "Arrives with a band of militia scouts.; Upgrades change the companions' class and can bring fallen companions back.", "야수 조련 대신 척후대 지휘"),
  Hero5_Dino: entry("돌격 기병", "Charging Cavalry",
    "적을 향해 곧게 돌진합니다.; 부딪힌 적에게 피해를 주고 기절시키며 밀어냅니다.; 돌진 중에는 피해를 받지 않습니다.",
    "Rushes straight toward an enemy.; Damages, stuns and pushes enemies on contact.; Takes no damage during a charge.", "공룡 대신 기존 조선 기병"),
  Hero5_DinoRider: entry("돌격 궁기병", "Mounted Raider",
    "돌진하면서 적을 꿰뚫는 화살을 잇달아 쏩니다.; 돌진 중에는 피해를 받지 않습니다.; 쓰러지거나 희생되면 돌격 기병과 궁기병으로 갈라져 뛰어내리며 착지한 둘레의 적을 기절시킵니다.",
    "Rushes while firing a stream of piercing arrows.; Takes no damage during a charge.; On death or sacrifice, splits into charging cavalry and a mounted archer; they leap apart and stun enemies around their landing.", "공룡 기수 대신 돌격 궁기병의 분리 전투"),
  Hero5_Rider: entry("궁기병", "Mounted Archer",
    "적을 꿰뚫는 화살을 쏘아 지나는 길의 적들에게 피해를 줍니다.",
    "Fires piercing arrows that damage enemies along their path.", "조선 궁기병의 관통 화살"),
  Hero5_Treant: entry("보강 창병", "Bulwark Spearman",
    "공격할 때마다 가까이서 가장 많이 다친 아군에게 목책 보강물을 보냅니다.; 보강을 받은 아군은 잠시 방어가 굳어집니다.",
    "Each attack sends a palisade brace to the most wounded nearby ally.; The brace strengthens that ally's defense for a short while.", "나무 정령과 씨앗 대신 목책 보강"),
  Hero6_BloodMage: entry("회복 총통병", "Recovering Gunner",
    "적에게 준 피해의 일부만큼 체력을 회복합니다.; 강화하면 처치한 적이나 가까이 쓰러진 아군에게서 기운을 거두어 회복하거나 공격력이 자랍니다.",
    "Heals for part of the damage dealt.; Upgrades can recover health or grow attack by gathering strength from defeated enemies or nearby fallen allies.", "흡혈·마법 대신 전투 중 회복"),
  Hero6_Shotgun: entry("산탄 총통병", "Scattershot Gunner",
    "화살 여러 발을 부채꼴로 흩뿌려 쏩니다.; 각 화살은 공격력만큼 피해를 줍니다.; 강화하면 화살 수가 늘어납니다.",
    "Fires a spread of arrows in a fan.; Each arrow deals full attack damage.; Upgrades add more arrows.", "현대 산탄총 대신 총통병의 분산 사격"),
  Hero6_Skelewheel: entry("편곤 기병", "Flail Cavalry",
    "편곤을 휘두르며 잠시 방향을 흔들어 내달립니다.; 부딪힌 적들에게 피해를 주고 밀어내며 화면 끝에서는 튕겨 나옵니다.",
    "Rushes for a short while with a swinging flail, wobbling as it moves.; Damages and pushes enemies on contact, and bounces off screen edges.", "해골 바퀴 대신 기병의 편곤과 먼지"),
  Hero7_AstralFisher: entry("갈고리 판옥선", "Grappling Panokseon",
    "먼 적에게 갈고리를 던져 기절시키고 배 쪽으로 끌어당겨 칩니다.; 가까운 적은 직접 칩니다.; 망령 기술을 강화하면 처치한 적의 망령이 잠시 아군으로 싸웁니다.",
    "Hooks distant enemies, stuns them and pulls them toward the ship to strike.; Hits nearby enemies directly.; With the fallen ally upgrade, defeated enemies briefly return to fight for your side.", "천체 낚시 대신 판옥선의 갈고리"),
  Hero7_Icebourne: entry("회검 창병", "Circling Blade Spearman",
    "공격할 때 몸 둘레를 잠시 도는 칼날을 만듭니다.; 칼날에 닿는 적에게 피해를 줍니다.",
    "Creates a blade that briefly circles the soldier.; The blade damages enemies it touches.", "얼음 마법 대신 백색 칼날 궤적"),
  Hero7_Warlord: entry("유인 기병", "Decoy Cavalry",
    "직접 공격하지 않고 둘레의 적들이 자신을 노리도록 이끕니다.; 강화하면 맞을 때 적을 얼리거나 피해를 돌려주고 보호막을 얻습니다.",
    "Does not attack directly; draws nearby enemies to target it.; Upgrades can freeze attackers, reflect damage or grant a shield when hit.", "군주의 주문 대신 기병 지휘와 청백 방어 효과"),
  Hero7_Warlord_Spiked: entry("유인 기병", "Decoy Cavalry",
    "강화된 유인 기병입니다.; 직접 공격하지 않고 둘레의 적들을 끌어들입니다.; 배운 강화에 따라 피격 시 빙결, 반사, 보호막을 씁니다.",
    "A decoy cavalry soldier.; Does not attack directly and draws nearby enemies.; Purchased upgrades provide freezing, reflection and shields when hit.", "갑옷 변형은 기존 아트 유지"),
  Hero8_Doppelganger: entry("변신 승병", "Disguised Monk",
    "모집 팩을 열 때 살아 있는 변신 승병마다 지금까지 발견한 다른 병력 하나로 모습을 바꿉니다.; 변신 승병으로 다시 바뀌지는 않습니다.",
    "When a recruit pack opens, each living disguised monk changes into another previously discovered soldier.; Cannot turn into another disguised monk.", "오너 지정 변신 승병과 기존 병력 그림 사용"),
};

export function unitDisplayName(id: string, lang: Lang): string | undefined {
  return UNIT_CODEX_TEXT[id]?.[lang];
}
export function unitAbilityText(id: string, lang: Lang): string | undefined {
  return UNIT_CODEX_TEXT[id]?.description[lang];
}

/** Old authored names remain save-compatible; every UI translates them to the same chosen display name. */
const AUTHORED_NAMES: Readonly<Record<string, string>> = {
  "치유 승병": "Hero2_Monk", "화염 화차병": "Hero2_Pyromancer", "퇴마 궁수": "Hero3_DemonSlayer",
  "환영 승병": "Hero3_Illusionist", "소환 판옥선": "Hero3_Portal", "독침 의병": "Hero3_WitchDoctor",
  "뇌격 화차병": "Hero4_Stormcaller", "흡인 승병": "Hero9_BlackHole", "광선 화차병": "Hero9_Quasar",
  "성화 궁수": "Hero9_Supernova", "소환 창병": "Hero_Skeleton", "정예 소환 창병": "Hero_SkeletonUpgraded",
  "조련 승병": "Hero5_Beastmaster", "흡혈 총통병": "Hero6_BloodMage", "회전 기병": "Hero6_Skelewheel",
  "빙갑 창병": "Hero7_Icebourne",
};
export function unitNameTranslation(korean: string, lang: "ko" | "en"): string | undefined {
  const alias = AUTHORED_NAMES[korean], text = alias ? UNIT_CODEX_TEXT[alias]
    : Object.values(UNIT_CODEX_TEXT).find(candidate => candidate.ko === korean);
  return text?.[lang];
}
