// Role cards (AB-CONTRACT A1): a fixed 4-line card per role.
//   想要什么 / 盯着什么 / 能拧什么 / 常犯的错（和总目标的冲突）
// The 8th card is 整个经济: the goal, then the four penalty items 河溢 / 河干 / 湖崩 / 地下太低 (DESIGN-v3; were 泛滥 / 干涸 / 溃坝 / 透支)
// 盯着什么 / 能拧什么 point to places on the picture: DESIGN-v3 Rule 3 (ROLE_VALVES in src/data/layers.js) (the same four lamps as the objective strip).
// DOM-free (Node checkers can import it). Rendering + clickable terms live in src/ui/concepts.js (roleCardHtml).
//
//   roleCard(role, iso?)  -> { role, mark, title, sub, rows:[{ k, v }] }   text localised for the country (central-bank name, inflation target)
//   ROLE_CARD_ORDER       the 8 keys in display order
//   roleOfConcept(id)     -> the role whose card belongs on top of concept card `id` | null
//   ROLE_KEYWORDS         extra [text, concept id] pairs used only inside role cards (on top of KEYWORDS of concepts.js)
import { countryInfo } from '../ui/country-info.js';

export const ROLE_CARD_ORDER = ['centralBank', 'bank', 'household', 'firm', 'government', 'investor', 'foreign', 'economy'];

// one-character marks / names (same marks as PLAYERS in tabs/_util.js; 'economy' is new)
export const ROLE_META = {
  centralBank: { name: '央行', mark: '央' }, bank: { name: '银行', mark: '银' }, household: { name: '家庭', mark: '家' },
  firm: { name: '企业', mark: '企' }, government: { name: '政府', mark: '政' }, investor: { name: '投资者', mark: '投' },
  foreign: { name: '外国人', mark: '外' }, economy: { name: '整个经济', mark: '总' },
};

// inflation target per country. AUS is a band (RBA 2–3%); CHN has no formal number (about 3% in practice).
const TARGET = { USA: '2%', AUS: '2–3%', GBR: '2%', JPN: '2%', EA: '2%', CHN: '3% 左右' };
export const inflationTarget = iso => TARGET[countryInfo(iso).iso] || '2%';

// which concept cards show which role card on top (the tap targets of the diagram: 央行 → 政策利率 ..., 国境线 → 出口 / 进口 / 汇率 ...)
const CONCEPT_ROLE = {
  policyRate: 'centralBank', qe: 'centralBank',
  bankApproval: 'bank', bankCapital: 'bank', badLoans: 'bank',
  dsr: 'household', income: 'household',
  capex: 'firm', capacity: 'firm',
  govDebtGdp: 'government', fiscalInjection: 'government', govPurchases: 'government', transfers: 'government', interestToTax: 'government',
  assetReservoir: 'investor',
  exports: 'foreign', imports: 'foreign', fx: 'foreign', foreignBonds: 'foreign', reserveCurrency: 'foreign',
};
export const roleOfConcept = id => CONCEPT_ROLE[id] || null;

// words that only get a link inside role cards (a global link would be too eager in other texts)
export const ROLE_KEYWORDS = [['月供/收入', 'dsr'], ['池子', 'assetReservoir'], ['产能闲置', 'capacity'], ['抵押品', 'lvr'], ['资产涨幅', 'assetReservoir']];

/** The card of one role for a country (iso: 'USA' | 'AUS' | ...; default USA). */
export function roleCard(role, iso) {
  const ci = countryInfo(iso), tg = inflationTarget(ci.iso), cb = ci.cbName;
  const meta = ROLE_META[role];
  if (!meta) return null;
  const R = (k, v) => ({ k, v });
  let sub = '', rows;
  switch (role) {
    case 'centralBank':
      sub = cb.includes('央行') ? '' : cb;
      rows = [
        R('想要什么', `物价稳在 ${tg}（${cb}的目标）、就业稳`),
        R('盯着什么', '断面水位（CPI）、断面空出的宽度（失业率）'),
        R('能拧什么', '吸力旋钮（政策利率）、央行泵（QE）'),
        R('常犯的错', '只看物价，看不见资产泡沫'),
      ];
      break;
    case 'bank':
      rows = [
        R('想要什么', '赚利差、不出坏账'),
        R('盯着什么', '地下水位（坏账率、资本比率）、房产池（房价，抵押品）'),
        R('能拧什么', '抽水泵：审批松紧、LVR 上限'),
        R('常犯的错', '繁荣时放太多，萧条时一起收'),
      ];
      break;
    case 'household':
      rows = [
        R('想要什么', '有房住、生活变好'),
        R('盯着什么', '工资口流回的水（工作）、自己那块地下水位（月供/收入）'),
        R('能拧什么', '借多少（抽水）、存多少'),
        R('常犯的错', '追涨借太多；出事后一起省钱，压低别人的收入'),
      ];
      break;
    case 'firm':
      rows = [
        R('想要什么', '利润'),
        R('盯着什么', '订单（河的流量）、吸力（融资成本）'),
        R('能拧什么', '把断面挖宽（Capex）'),
        R('常犯的错', '繁荣时一起扩产 → 产能过剩'),
      ];
      break;
    case 'government':
      rows = [
        R('想要什么', '稳定、就业（各国权重不同）'),
        R('盯着什么', '失业率（河干）、自己那块地下水位（利息/税收、政府债务/GDP）'),
        R('能拧什么', '深井泵（支出）、分水堰的税口'),
        R('常犯的错', '刺激收太早（日本 1997），或钱给错地方'),
      ];
      break;
    case 'investor':
      rows = [
        R('想要什么', '扣掉通胀后的回报'),
        R('盯着什么', '湖里各池的资产涨幅、吸力（实际利率）'),
        R('能拧什么', '新钱进湖里哪个池子'),
        R('常犯的错', '追涨杀跌，放大波动'),
      ];
      break;
    case 'foreign':
      rows = [
        R('想要什么', '收益和安全'),
        R('盯着什么', '吸力差（利差）、闸价（汇率）、怕'),
        R('能拧什么', '闸：买不买你的东西和国债'),
        R('常犯的错', '风险一来一起撤'),
      ];
      break;
    case 'economy':
      sub = '总目标';
      rows = [
        R('总目标', '长期运出最多的真实东西给人用（每人真实消费，累计）'),
        R('河溢', `通胀偏离目标（${cb}的目标 ${tg}）`),
        R('河干', '失业率高、产能闲置'),
        R('湖崩', '金融危机（B2、环 ⑤）'),
        R('地下太低', '债务/收入过高（DSR、利息/税收）'),
      ];
      break;
    default: return null;
  }
  return { role, mark: meta.mark, title: meta.name, sub, rows };
}
