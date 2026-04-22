/**
 * 纯净版（无任何状态显示）
 * - 不显示：已更新 / 开奖中 / 等待开奖 / 缓存中
 * - 只显示：期号 + 球号 + 生肖 + 五行 + 日期时间 + 倒计时
 * - 强制防缓存 + API fallback
 * - 左上角标题前加入开奖机图标 🎰
 */

export default async function (ctx) {

  const LOTTERY_CONFIG = {
    '澳门': { type: 'macau1' },
    '新澳门': { type: 'macau2' },
    '老澳门': { type: 'macauOld' },
    '香港': { type: 'hk' },
    '新香港': { type: 'newHK' }
  };

  const DEFAULT_LOTTERY = '新澳门';
  const lotteryNameInput = ctx.env['彩票类型'] || DEFAULT_LOTTERY;
  const config = LOTTERY_CONFIG[lotteryNameInput];

  const WAVE_COLOR = { red: '#FF3B30', blue: '#007AFF', green: '#34C759' };
  const WAVE_MAP = {
    red: ['01','02','07','08','12','13','18','19','23','24','29','30','34','35','40','45','46'],
    blue: ['03','04','09','10','14','15','20','25','26','31','36','37','41','42','47','48'],
    green: ['05','06','11','16','17','21','22','27','28','32','33','38','39','43','44','49']
  };
  const getWaveColor = n => {
    n = String(n).padStart(2, '0');
    if (WAVE_MAP.red.includes(n)) return WAVE_COLOR.red;
    if (WAVE_MAP.blue.includes(n)) return WAVE_COLOR.blue;
    return WAVE_COLOR.green;
  };

  const ZODIAC_MAP = {
    1: "鼠", 2: "牛", 3: "虎", 4: "兔",
    5: "龙", 6: "蛇", 7: "马", 8: "羊",
    9: "猴", 10: "鸡", 11: "狗", 12: "猪"
  };

  // ============================
  // 星期五行五行表（来自你上传的图）
  // ============================
  const FIVE_ELEMENTS_MAP = {
    metal: ['04','05','12','13','26','27','34','35','42','43'], // 金
    wood:  ['08','09','16','17','24','25','38','39','46','47'], // 木
    water: ['01','14','15','22','23','30','31','44','45'],      // 水
    fire:  ['02','03','10','11','18','19','32','33','40','41','48','49'], // 火
    earth: ['06','07','20','21','28','29','36','37']            // 土
  };

  function getFiveElement(num) {
    num = String(num).padStart(2, '0');
    if (FIVE_ELEMENTS_MAP.metal.includes(num)) return "金";
    if (FIVE_ELEMENTS_MAP.wood.includes(num))  return "木";
    if (FIVE_ELEMENTS_MAP.water.includes(num)) return "水";
    if (FIVE_ELEMENTS_MAP.fire.includes(num))  return "火";
    return "土";
  }

  // ============================
  // 开奖时间 = API 时间 + 3 分钟
  // ============================
  function getDisplayOpenTimePlus3() {
    const [h, m] = data.officeTime.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m + 3, 0, 0); // 自动进位

    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  const C = {
    bg: '#FFFFFF',
    text: '#111111',
    sub: '#8E8E93',
    title: '#34C759',
    date: '#C7C7CC'
  };

  let data = null;
  const ts = Date.now();

  async function safeGet(url) {
    try {
      const res = await ctx.http.get(url);
      return await res.json();
    } catch (e) {
      return null;
    }
  }
  // ============================
  // 彩种 API（保持不变）
  // ============================
  if (config.type === 'macau2') {
    const raw = await safeGet(`https://macaumarksix.com/api/macaujc2.com?ts=${ts}`);
    data = raw ? parseMac(raw[0], '新澳门') : null;
  }
  else if (config.type === 'macau1') {
    const raw = await safeGet(`https://macaumarksix.com/api/macaujc.com?ts=${ts}`);
    data = raw ? parseMac(raw[0], '澳门') : null;
  }
  else if (config.type === 'macauOld') {
    const raw = await safeGet(`https://api3.marksix6.net/lottery_api.php?type=oldMacau&ts=${ts}`);
    data = raw ? parseHK(raw, '老澳门') : null;
  }
  else if (config.type === 'hk') {
    const raw = await safeGet(`https://api3.marksix6.net/lottery_api.php?type=hk&ts=${ts}`);
    data = raw ? parseHK(raw, '香港') : null;
  }
  else if (config.type === 'newHK') {
    const raw = await safeGet(`https://xg-hk.com/gw/ball/api/getCurrentBall?ts=${ts}`);
    data = raw?.data ? parseNewHK(raw.data, '新香港') : null;
  }

  if (!data) {
    return {
      type: 'widget',
      padding: 20,
      children: [
        { type: 'text', text: '⚠️ 数据获取失败', textColor: '#FF3B30', font: { size: 16, weight: 'bold' } },
        { type: 'text', text: '请稍后再试', textColor: '#8E8E93', font: { size: 14 } }
      ]
    };
  }

  // ============================
  // 原解析函数（保持不变）
  // ============================
  function parseMac(raw, name) {
    const nums = raw.openCode.split(',').map(n => n.trim());
    const zodiacs = raw.zodiac.split(',').map(z => z.trim());
    const dateObj = new Date(raw.openTime.replace(' ', 'T'));
    return {
      issue: raw.expect,
      dateStr: dateObj.toLocaleDateString('zh-CN'),
      weekDay: ['周日','周一','周二','周三','周四','周五','周六'][dateObj.getDay()],
      openCodeArr: nums,
      zodiacArr: zodiacs,
      officeTime: raw.openTime.substring(11, 16),
      lotteryName: name
    };
  }

  function parseHK(raw, name) {
    const nums = raw.openCode.split(',').map(n => n.trim());
    const zodiacs = raw.zodiac.split(',').map(z => z.trim());
    const dateObj = new Date(raw.openTime.replace(' ', 'T'));
    return {
      issue: raw.expect,
      dateStr: dateObj.toLocaleDateString('zh-CN'),
      weekDay: ['周日','周一','周二','周三','周四','周五','周六'][dateObj.getDay()],
      openCodeArr: nums,
      zodiacArr: zodiacs,
      officeTime: raw.openTime.substring(11, 16),
      lotteryName: name
    };
  }

  function parseNewHK(raw, name) {
    const nums = [];
    const zodiacs = [];
    for (let i = 1; i <= 7; i++) {
      const b = raw[`ball${i}`];
      if (!b) continue;
      nums.push(String(b.ballNo).padStart(2, '0'));
      zodiacs.push(ZODIAC_MAP[b.ballbeyond] || "");
    }
    const dateObj = new Date(raw.ballTime.replace(' ', 'T'));
    return {
      issue: raw.periods,
      dateStr: dateObj.toLocaleDateString('zh-CN'),
      weekDay: ['周日','周一','周二','周三','周四','周五','周六'][dateObj.getDay()],
      openCodeArr: nums,
      zodiacArr: zodiacs,
      officeTime: raw.ballTime.substring(11, 16),
      lotteryName: name
    };
  }
  // ============================
  // 倒计时（保持不变）
  // ============================
  function getCountdown() {
    const now = new Date();

    if (data.lotteryName === '香港') {
      const OPEN_HOUR = 21;
      const OPEN_MINUTE = 30;
      const OPEN_DAYS = [2, 4, 6];

      for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() + i);
        const day = d.getDay();

        if (OPEN_DAYS.includes(day)) {
          d.setHours(OPEN_HOUR, OPEN_MINUTE, 0, 0);
          if (d <= now) continue;

          const diff = d - now;
          const hours = Math.floor(diff / 1000 / 3600);
          const minutes = Math.floor((diff / 1000 % 3600) / 60);
          const seconds = Math.floor(diff / 1000 % 60);
          return `${hours}小时 ${minutes}分 ${seconds}秒`;
        }
      }

      return `等待下期开奖`;
    }

    const [h, m] = data.officeTime.split(':').map(Number);
    const next = new Date();
    next.setHours(h, m, 0, 0);
    if (next < now) next.setDate(next.getDate() + 1);
    const diff = next - now;
    const hours = Math.floor(diff / 1000 / 3600);
    const minutes = Math.floor((diff / 1000 % 3600) / 60);
    const seconds = Math.floor(diff / 1000 % 60);
    return `${hours}小时 ${minutes}分 ${seconds}秒`;
  }

  const countdownText = getCountdown();

  const text = (t, opts = {}) => ({
    type: 'text',
    text: t,
    font: { size: opts.size || 14, weight: opts.weight || 'regular' },
    textColor: opts.color || C.text,
    textAlign: opts.align || 'center'
  });

  const ball = (num, isSpecial) => ({
    type: 'stack',
    alignItems: 'center',
    justifyContent: 'center',
    width: isSpecial ? 42 : 36,
    height: isSpecial ? 42 : 36,
    backgroundColor: getWaveColor(num),
    borderRadius: isSpecial ? 21 : 18,
    borderWidth: isSpecial ? 3 : 0,
    borderColor: isSpecial ? '#FFD700' : 'transparent',
    children: [
      text(num, {
        size: isSpecial ? 18 : 16,
        weight: 'bold',
        color: isSpecial ? '#FFD700' : '#FFFFFF'
      })
    ]
  });

  const ballsWithZodiac = {
    type: 'stack',
    direction: 'row',
    gap: 10,
    justifyContent: 'center',
    children: data.openCodeArr.map((num, i) => {
      const isSpecial = (i === data.openCodeArr.length - 1);
      const waveColor = getWaveColor(num);
      const zodiac = data.zodiacArr[i] || '';
      const five = getFiveElement(num);

      return {
        type: 'stack',
        direction: 'column',
        alignItems: 'center',
        children: [
          ball(num, isSpecial),
          { type: 'spacer', length: 3 },
          {
            type: 'text',
            text: `${zodiac}/${five}`,
            font: { size: 15, weight: isSpecial ? 'bold' : 'medium' },
            textColor: waveColor,
            textAlign: 'center'
          }
        ]
      };
    })
  };

  return {
    type: 'widget',
    backgroundColor: C.bg,
    padding: 14,
    scale: 0.88,
    refreshAfter: new Date(Date.now() + 30000).toISOString(),

    children: [
      {
        type: 'stack',
        direction: 'row',
        children: [
          {
            type: 'stack',
            direction: 'row',
            alignItems: 'center',
            children: [
              text('🎰', { size: 16, weight: 'bold', color: C.text }),
              { type: 'spacer', length: 4 },
              text(data.lotteryName, { size: 15, weight: 'bold', color: C.text })
            ]
          },
          { type: 'spacer' },
          text(`第${String(data.issue).slice(-3)}期`, { size: 13, weight: 'bold', color: C.text })
        ]
      },

      { type: 'spacer', length: 6 },

      text(`${data.dateStr} ${data.weekDay}  ${getDisplayOpenTimePlus3()}开奖结果`, { 
        size: 13, 
        weight: 'bold', 
        color: C.text
      }),

      { type: 'spacer', length: 10 },

      ballsWithZodiac,

      { type: 'spacer', length: 10 },

      text(`距离下期开奖：${countdownText}`, { size: 13, weight: 'medium', color: '#FF3B30' })
    ]
  };
}
