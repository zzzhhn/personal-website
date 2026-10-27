export interface IntentText { readonly zh: string; readonly en: string }
export type IntentClass = 'lookup' | 'plan' | 'rewrite' | 'extract' | 'debug' | 'act';
export interface IntentTask {
  readonly id: string;
  readonly request: IntentText;
  readonly interaction: IntentText;
  readonly intent: IntentClass;
  readonly retry: IntentText;
  readonly clarification?: { readonly id: string; readonly question: IntentText; readonly reply: IntentText };
}

// Original fictional scenarios. These are neither AIME's taxonomy nor internal user data.
// Bump this revision whenever IDs, gold intents or required clarification change.
export const INTENT_BANK_REVISION = 'original-20261027-v1';
export const INTENT_REQUIRED = 6;
export const INTENT_LABELS: Readonly<Record<IntentClass, IntentText>> = {
  lookup: { zh: '查询', en: 'Lookup' }, plan: { zh: '规划', en: 'Plan' },
  rewrite: { zh: '改写', en: 'Rewrite' }, extract: { zh: '提取', en: 'Extract' },
  debug: { zh: '程序排错', en: 'Debug' }, act: { zh: '执行动作', en: 'Act' },
};

export const INTENT_TASKS: readonly IntentTask[] = [
  {
    id: 'T1', intent: 'lookup',
    request: { zh: '先查20:00那班还有没有空位，别替我预订。', en: 'Check whether the 20:00 ride has a free seat. Do not book it.' },
    interaction: { zh: '拨动查询道岔，看空位灯。', en: 'Route the request to the seat lookup and check the light.' },
    retry: { zh: '对方只想查空位；预订会改变座位状态。', en: 'They only wanted availability. Booking changes the seat state.' },
  },
  {
    id: 'T2', intent: 'plan',
    request: { zh: '我想先看灯塔，再坐车，十点前回门口，帮我排顺序。', en: 'Plan a route: lighthouse, then the ride, back at the gate before ten.' },
    interaction: { zh: '在园内路线小景安排顺序；地图和时刻已给定。', en: 'Arrange the route in the model; its map and schedule are provided.' },
    retry: { zh: '需要一份行程安排，不是立即订票或只查一个事实。', en: 'They need an itinerary, not a booking or one isolated fact.' },
  },
  {
    id: 'T3', intent: 'rewrite',
    request: { zh: '把“禁止攀爬”说得客气些，但别改成允许攀爬。', en: 'Make “Do not climb” more polite without changing the restriction.' },
    interaction: { zh: '将告示送入改写滚筒，查看意思保留的示例。', en: 'Send the notice through the rewrite drum and compare its meaning.' },
    retry: { zh: '改的是表达，不是园规本身。', en: 'Change the wording, not the rule itself.' },
  },
  {
    id: 'T4', intent: 'extract',
    request: { zh: '从这张入园券提取日期、场次、人数，不要新增安排。', en: 'Extract the date, session and party size from this ticket. Add no new plans.' },
    interaction: { zh: '将票送到提取装置，让三个已有字段显露。', en: 'Use the extractor to reveal the three existing fields.' },
    retry: { zh: '需要已有字段，不需要新行程；输出格式本身不是意图。', en: 'They need existing fields, not a new plan. Format alone is not intent.' },
  },
  {
    id: 'T5', intent: 'debug',
    request: { zh: '小车程序一出发就重复回站，帮我找出逻辑错误并修正。', en: 'This cart program keeps returning to the station. Find and fix the logic error.' },
    interaction: { zh: '使用排错工具观察错误循环，不要求现场写代码。', en: 'Inspect the faulty loop with the debug tool; no coding is required.' },
    retry: { zh: '请求明确指向程序逻辑排错，不是编旅行路线。', en: 'The request is about faulty program logic, not a travel itinerary.' },
  },
  {
    id: 'T6', intent: 'act',
    request: { zh: '请替我预订20:00这一班的一个座位。', en: 'Book one seat on the 20:00 ride for me.' },
    interaction: { zh: '在虚构席位小景执行一次模拟预订。', en: 'Make one simulated booking inside the fictional seat model.' },
    retry: { zh: '只查空位还未完成预订目标；这里不会产生真实订单。', en: 'Availability alone does not make a booking. No real order is created here.' },
  },
  {
    id: 'T7', intent: 'rewrite',
    request: { zh: '帮我弄一下这个。', en: 'Can you sort this out for me?' },
    interaction: { zh: '先摇澄清铃，再按确认的目标选择装置。', en: 'Ring the clarification bell, then choose the confirmed action.' },
    retry: { zh: '访客澄清后只要改告示，不要发送或订座。', en: 'After clarification they want the notice rewritten, not sent or booked.' },
    clarification: {
      id: 'desired-outcome',
      question: { zh: '你想改告示，还是订座？', en: 'Do you want the notice rewritten, or a seat booked?' },
      reply: { zh: '只把告示改礼貌，别发送。', en: 'Just make the notice more polite. Do not send it.' },
    },
  },
];

const aliases: Readonly<Record<IntentClass, readonly string[]>> = {
  lookup: ['lookup', 'look up', '查询', '查找', '检索'],
  plan: ['plan', 'planning', '规划', '行程规划'],
  rewrite: ['rewrite', 'rewriting', '改写', '润色'],
  extract: ['extract', 'extraction', '提取', '信息提取'],
  debug: ['debug', 'debugging', '程序排错', '代码排错', '调试'],
  act: ['act', 'action', 'execute', '执行', '执行动作', '预订', 'book'],
};
export function normalizeIntent(answer: string): IntentClass | null {
  const normalized = answer.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  return (Object.keys(aliases) as IntentClass[]).find(id => aliases[id].includes(normalized)) ?? null;
}
export const findIntentTask = (id: string): IntentTask | undefined => INTENT_TASKS.find(task => task.id === id);
