export const worldText = {
  en: {
    title: 'Bobby’s island', stage: 'Camp art slice · greybox playtest', loading: 'Preparing the island', loadingHint: 'Terrain, light, then a place to begin.',
    controls: 'WASD move (relative to camera) · Shift sprint · Space jump · E enter a vehicle', driving: 'W/S throttle · A/D steer · Space brake · E leave vehicle',
    credits: 'Credits', motionCredit: 'Character motion adapted from the CMU Graphics Lab Motion Capture Database.',
    menu: 'Map & settings', resume: 'Back to the island', back: 'Back to portfolio', light: 'Light', dusk: 'Dusk', night: 'Night', language: 'Language',
    camp: 'Camp', town: 'Coastal town', park: 'Boardwalk park', ridge: 'Windmill hill', shore: 'Island shore', offroad: '4×4', coupe: 'Fastback', van: 'Van',
    enter: 'E · Enter', leave: 'E · Leave vehicle', recover: 'R · Flip back', recovering: 'Returning to the road…',
    zoom: 'Drag or double-click to look · Scroll to zoom · V camera view · Gamepad supported', error: 'The island could not be loaded.', retry: 'Try again',
    quality: 'Image quality', balanced: 'Balanced', high: 'High', qualityHint: 'Choose Balanced if movement becomes choppy.',
    mobile: 'Open on desktop to enter the island.', mobileDetail: 'The island is being playtested. Use a keyboard and mouse or a gamepad to walk and drive.',
    future: 'Under construction', map: 'Island map', privacy: 'Movement is never recorded.',

    // HUD, prompts, cards, map (ui session). Facts never live here: only interface words.
    zoneSub: { ridge: 'Lookout', shore: 'Open coast' }, present: 'Present', close: 'Close', interact: 'Interact', switchTarget: 'Switch',
    hintMove: 'Move', hintLook: 'Look', hintInteract: 'Interact', hintDrive: 'Drive', hintKeysMove: 'WASD', hintKeysLook: 'Drag · Scroll', hintKeysDrive: 'W/S · A/D',
    waypoint: 'Waypoint', waypointSet: 'Click the map to set a waypoint; click it again to clear.', waypointClear: 'Clear waypoint', metres: 'm',
    legendBuildings: 'Internships (oldest → newest)', legendBooths: 'Project booths', legendYou: 'You', legendPlots: 'Plots for later',
    keysTitle: 'Controls', keysWalk: 'Walk', keysDriveTitle: 'Drive',
    keyRows: [['WASD', 'Move (relative to the camera)'], ['Shift', 'Sprint'], ['Space', 'Jump'], ['E', 'Interact · enter or leave a vehicle'], ['Q', 'Switch between nearby objects'], ['Drag · Scroll', 'Look · zoom'], ['V', 'Camera view'], ['Esc', 'Map & settings']],
    driveRows: [['W / S', 'Throttle · reverse'], ['A / D', 'Steer'], ['Space', 'Brake'], ['R', 'Flip back']],
    cardKind: { experience: 'Internship', project: 'Project', about: 'About', note: 'Note' },
    period: 'Period', location: 'Location', stack: 'Stack', highlights: 'Highlights', courses: 'Core courses', expected: 'Expected', page: 'Page',
    openOnSite: 'Read on the portfolio', live: 'Live', source: 'Source', prev: 'Previous', next: 'Next', interests: 'In my free time',
    thanksTitle: 'Also used', groundCredit: 'Ground detail textures: ambientCG (CC0).',
  },
  zh: {
    title: 'Bobby 的城岛', stage: '营地样片 · 灰盒试玩', loading: '正在准备城岛', loadingHint: '铺好地面，点亮灯光，准备出发。',
    controls: 'WASD 移动（相对镜头） · Shift 冲刺 · 空格跳 · E 上车', driving: 'W/S 油门 · A/D 转向 · 空格刹车 · E 下车',
    credits: '致谢', motionCredit: '角色动作改编自 CMU Graphics Lab Motion Capture Database。',
    menu: '地图与设置', resume: '继续探索', back: '回到简历', light: '光照', dusk: '黄昏', night: '夜晚', language: '语言',
    camp: '营地', town: '海岸城区', park: '栈道园区', ridge: '风车山丘', shore: '环岛海岸', offroad: '越野车', coupe: '轿跑', van: '小货车',
    enter: 'E · 上车', leave: 'E · 下车', recover: 'R · 翻回来', recovering: '正在返回路面……',
    zoom: '拖拽或双击鼠标转镜头 · 滚轮缩放 · V 切换视角 · 支持手柄', error: '城岛暂时无法加载。', retry: '重试',
    quality: '画面质量', balanced: '流畅', high: '高清', qualityHint: '如果移动时卡顿，可以切换到流畅。',
    mobile: '在桌面打开可进入。', mobileDetail: '城岛正在试玩阶段，使用键鼠或手柄步行与驾驶。',
    future: '建设中', map: '城岛地图', privacy: '不记录移动轨迹。',

    zoneSub: { ridge: '远眺', shore: '开阔海岸' }, present: '至今', close: '关闭', interact: '交互', switchTarget: '切换',
    hintMove: '移动', hintLook: '镜头', hintInteract: '交互', hintDrive: '驾驶', hintKeysMove: 'WASD', hintKeysLook: '拖拽 · 滚轮', hintKeysDrive: 'W/S · A/D',
    waypoint: '航点', waypointSet: '点击地图设置航点，再点一次航点取消。', waypointClear: '清除航点', metres: '米',
    legendBuildings: '实习楼（由旧到新）', legendBooths: '项目展位', legendYou: '你', legendPlots: '预留地块',
    keysTitle: '操作', keysWalk: '步行', keysDriveTitle: '驾驶',
    keyRows: [['WASD', '移动（相对镜头）'], ['Shift', '冲刺'], ['空格', '跳'], ['E', '交互 · 上车或下车'], ['Q', '在附近的物件间切换'], ['拖拽 · 滚轮', '转镜头 · 缩放'], ['V', '切换视角'], ['Esc', '地图与设置']],
    driveRows: [['W / S', '油门 · 倒车'], ['A / D', '转向'], ['空格', '刹车'], ['R', '翻回来']],
    cardKind: { experience: '实习', project: '项目', about: '关于', note: '便签' },
    period: '时间', location: '地点', stack: '技术栈', highlights: '亮点', courses: '核心课程', expected: '预计', page: '页',
    openOnSite: '在简历站阅读', live: '在线版', source: '源码', prev: '上一页', next: '下一页', interests: '空闲时间',
    thanksTitle: '另外用到', groundCredit: '地面细节贴图：ambientCG（CC0）。',
  },
} as const;

/** Display the source ISO date as a language-neutral year/month. */
export const experienceMonth = (startDate: string) => startDate.slice(0, 7).replace('-', '.');
