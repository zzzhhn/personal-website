export const worldText = {
  en: {
    title: 'Bobby’s island', stage: 'Camp art slice · greybox playtest', loading: 'Preparing the island', loadingHint: 'Terrain, light, then a place to begin.',
    controls: 'WASD move · Shift run · Space jump · E enter a vehicle', driving: 'WASD drive · Space brake · E leave vehicle',
    menu: 'Map & settings', resume: 'Back to the island', back: 'Back to portfolio', light: 'Light', dusk: 'Dusk', night: 'Night', language: 'Language',
    camp: 'Camp', town: 'Coastal town', park: 'Boardwalk park', offroad: '4×4', coupe: 'Fastback', van: 'Van',
    enter: 'E · Enter', leave: 'E · Leave vehicle', recover: 'R · Flip back', recovering: 'Returning to the road…',
    zoom: 'Scroll · three zoom levels', error: 'The island could not be loaded.', retry: 'Try again',
    mobile: 'Open on desktop to enter the island.', mobileDetail: 'The island is being playtested. Use a keyboard to walk and drive.',
    future: 'Under construction', map: 'Island map', privacy: 'Movement is never recorded.',
  },
  zh: {
    title: 'Bobby 的城岛', stage: '营地样片 · 灰盒试玩', loading: '正在准备城岛', loadingHint: '铺好地面，点亮灯光，准备出发。',
    controls: 'WASD 行走 · Shift 跑 · 空格跳 · E 上车', driving: 'WASD 驾驶 · 空格刹车 · E 下车',
    menu: '地图与设置', resume: '继续探索', back: '回到简历', light: '光照', dusk: '黄昏', night: '夜晚', language: '语言',
    camp: '营地', town: '海岸城区', park: '栈道园区', offroad: '越野车', coupe: '轿跑', van: '小货车',
    enter: 'E · 上车', leave: 'E · 下车', recover: 'R · 翻回来', recovering: '正在返回路面……',
    zoom: '滚轮 · 三档缩放', error: '城岛暂时无法加载。', retry: '重试',
    mobile: '在桌面打开可进入。', mobileDetail: '城岛正在试玩阶段，使用键盘步行与驾驶。',
    future: '建设中', map: '城岛地图', privacy: '不记录移动轨迹。',
  },
} as const;

/** Display the source ISO date as a language-neutral year/month. */
export const experienceMonth = (startDate: string) => startDate.slice(0, 7).replace('-', '.');
