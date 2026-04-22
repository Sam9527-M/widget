/**
 * 全国城市油价（远程城市映射 + 调价日期远程json添加）
 * 使用说明：本脚本需要申请API-KEY，在https://www.mxnzp.com?ic=SR8XUR申请（每天1000次，免费）通过修改变量环境更改
 * 
 * 变量环境配置
 * 
 * 名称：APP_ID
 * 值：你的APP_ID
 * 
 * 名称：APP_SECRET
 * 值：你的APP_SECRET
 * 
 * 名称：CITY
 * 值：省份或城市（汉字）
 * 
 * 名称：CITY_MAP_URLS
 * 值：你的远程json链接（补全城市映射）
 * 
 * 名称：CALENDAR_URLS
 * 值：你的远程json链接（维护油价调整日期）
 */

export default async function (ctx) {

  const now = new Date();

  const THEME = {
    text: { light: "#000000", dark: "#FFFFFF" }
  };

  const CITY = ctx.env.CITY || "南宁";

  const LOCAL_CITY_MAP = {
    "北京": ["北京"],
    "上海": ["上海"],
    "天津": ["天津"],
    "重庆": ["重庆"],
    "广东": ["广州","深圳","佛山","东莞","珠海","中山","惠州","汕头","湛江","肇庆","江门","茂名","阳江","清远","潮州","揭阳","梅州","韶关","汕尾"],
  };

  const CITY_MAP_URLS = ctx.env.CITY_MAP_URLS
    ? ctx.env.CITY_MAP_URLS.split(",").map(s => s.trim())
    : ["https://你的域名/adjust_calendar.json"];

  const CITY_MAP_CACHE_KEY = "city_map_cache";
  const CACHE_EXPIRE = 7 * 24 * 60 * 60 * 1000;

  async function fetchCityMap() {
    const cache = await ctx.storage.get(CITY_MAP_CACHE_KEY);
    const nowTime = Date.now();

    if (cache && nowTime - cache.time < CACHE_EXPIRE) {
      return cache.data;
    }

    for (const url of CITY_MAP_URLS) {
      try {
        const r = await ctx.http.get(url);
        const json = await r.json();
        if (json && typeof json === "object") {
          await ctx.storage.set(CITY_MAP_CACHE_KEY, { time: nowTime, data: json });
          return json;
        }
      } catch (e) {}
    }

    return LOCAL_CITY_MAP;
  }

  const CITY_MAP = await fetchCityMap();

  function normalizeCityMap(map) {
    const result = {};
    for (const province in map) {
      const cities = map[province];
      if (Array.isArray(cities)) {
        for (const city of cities) result[city] = province;
      } else if (typeof cities === "string") {
        result[province] = cities;
      }
    }
    return result;
  }

  const CITY_MAP_NORMALIZED = normalizeCityMap(CITY_MAP);
  const PROVINCE = CITY_MAP_NORMALIZED[CITY] || CITY;
  const PROVINCE_PINYIN = {
    "北京": "beijing",
    "上海": "shanghai",
    "天津": "tianjin",
    "重庆": "chongqing",
    "广东": "guangdong",
    "广西": "guangxi",
    "江苏": "jiangsu",
    "浙江": "zhejiang",
    "山东": "shandong",
    "河南": "henan",
    "河北": "hebei",
    "四川": "sichuan",
    "湖北": "hubei",
    "湖南": "hunan",
    "安徽": "anhui",
    "福建": "fujian",
    "江西": "jiangxi",
    "辽宁": "liaoning",
    "陕西": "shanxi-3",
    "山西": "shanxi-1",
    "吉林": "jilin",
    "黑龙江": "heilongjiang",
    "云南": "yunnan",
    "贵州": "guizhou",
    "甘肃": "gansu",
    "青海": "qinghai",
    "宁夏": "ningxia",
    "新疆": "xinjiang",
    "西藏": "xizang",
    "内蒙古": "neimenggu",
    "海南": "hainan"
  };

  const PROVINCE_CODE = PROVINCE_PINYIN[PROVINCE] || PROVINCE;
  async function fetchWebPage(provinceCode) {
    const url = `http://m.qiyoujiage.com/${provinceCode}.shtml`;
    try {
      const resp = await ctx.http.get(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
          "referer": "http://m.qiyoujiage.com/"
        },
        timeout: 15000
      });
      if (resp.status === 200) return resp.text();
    } catch (e) {}
    return null;
  }

  function parseAdjustDate(html) {
    if (!html) return null;
    const reg =
      /(下次调价时间|下一轮油价调整窗口|预计下次调价时间|下次油价调整|下次油价|下轮油价调整窗口)[^0-9]*((\d{4})年)?(\d{1,2})月(\d{1,2})日/;
    const m = html.match(reg);
    if (!m) return null;

    const month = Number(m[4]) - 1;
    const day = Number(m[5]);

    let year;
    if (m[3]) {
      // 网页明确给出了年份，直接用
      year = Number(m[3]);
    } else {
      // 没有年份，先尝试今年
      year = now.getFullYear();
      const date = new Date(year, month, day);
      date.setHours(24, 0, 0, 0);
      // 如果算出来的日期已经过了，说明是明年
      if (date <= now) {
        year = year + 1;
      }
    }

    const date = new Date(year, month, day);
    date.setHours(24, 0, 0, 0);
    return date;
  }

  function parseTrend(html) {
    if (!html) return null;

    const reg1 = /<div class="tishi">[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<br\/>([\s\S]+?)<br\/>/;
    const reg2 = /<div class="ts">[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<br\/>([\s\S]+?)<br\/>/;

    const t = html.match(reg1) || html.match(reg2);
    if (!t) return null;

    const content = t[2].trim();

    if (
      content.includes("不作调整") ||
      content.includes("不做调整") ||
      content.includes("不调整") ||
      content.includes("油价不变") ||
      content.includes("本轮不调价")
    ) {
      return { text: "不作调整", color: "#888888" };
    }

    const isDown = content.includes("下调");
    const arrow = isDown ? "↓" : "↑";
    const color = isDown ? "#34C759" : "#FF3B30";

    const nums = content.match(/([\d\.]+)\s*元\/升/g);
    let amount = "";
    if (nums && nums.length >= 2) {
      const arr = nums.map(x => x.match(/([\d\.]+)/)[1]);
      amount = `${arr[0]}-${arr[1]}`;
    }

    return { text: `${arrow} ${amount} 元/升`, color };
  }

  const CACHE_KEY = `oil_cache_${PROVINCE}`;
  const cache = await ctx.storage.get(CACHE_KEY);
  const nowTime = Date.now();

  let oil = null;
  const cacheValid = cache && nowTime - cache.time < CACHE_EXPIRE;

  const APP_ID = ctx.env.APP_ID || "APP_ID";
  const APP_SECRET = ctx.env.APP_SECRET || "APP_SECRET";

  if (cacheValid) {
    oil = cache.data;
  } else {
    const API = `https://www.mxnzp.com/api/oil/search?province=${encodeURIComponent(
      PROVINCE
    )}&app_id=${APP_ID}&app_secret=${APP_SECRET}`;

    try {
      const r = await ctx.http.get(API);
      const json = await r.json();

      if (json?.code === 1) {
        oil = json.data;
        await ctx.storage.set(CACHE_KEY, {
          time: nowTime,
          data: oil
        });
      } else if (cache) {
        oil = cache.data;
      }
    } catch (e) {
      if (cache) oil = cache.data;
    }
  }
  const html = await fetchWebPage(PROVINCE_CODE);

  let nextAdjustWeb = null;
  if (html) nextAdjustWeb = parseAdjustDate(html);

  let trendInfo = null;
  if (html) trendInfo = parseTrend(html);

  const CALENDAR_URLS = ctx.env.CALENDAR_URLS
    ? ctx.env.CALENDAR_URLS.split(",").map(s => s.trim())
    : ["https://你的域名/adjust_calendar.json"];

  const CALENDAR_CACHE_KEY = "oil_adjust_calendar_cache";

  async function fetchAdjustCalendar() {
    const cache = await ctx.storage.get(CALENDAR_CACHE_KEY);
    const nowTime = Date.now();

    if (cache && nowTime - cache.time < CACHE_EXPIRE) {
      return cache.data;
    }

    for (const url of CALENDAR_URLS) {
      try {
        const r = await ctx.http.get(url);
        const json = await r.json();

        if (json && typeof json === "object") {
          await ctx.storage.set(CALENDAR_CACHE_KEY, {
            time: nowTime,
            data: json
          });
          return json;
        }
      } catch (e) {}
    }

    if (cache) return cache.data;
    return {};
  }

  const calendarData = await fetchAdjustCalendar();
  const year = now.getFullYear();

  function getCalendarForYear(year) {
    if (calendarData[year]) return calendarData[year];

    const years = Object.keys(calendarData).map(Number).sort();
    return calendarData[years[years.length - 1]] || [];
  }

  const calendar = getCalendarForYear(year);

  function getNextAdjustDateFromCalendar() {
    const today = new Date();

    for (const md of calendar) {
      const [m, d] = md.split("-").map(Number);
      const adjust = new Date(year, m - 1, d, 24, 0, 0);

      if (adjust > today) return adjust;
    }

    const nextYear = year + 1;
    const nextCalendar = getCalendarForYear(nextYear);

    if (nextCalendar.length > 0) {
      const [m, d] = nextCalendar[0].split("-").map(Number);
      return new Date(nextYear, m - 1, d, 24, 0, 0);
    }

    return null;
  }

  const nextAdjust = nextAdjustWeb || getNextAdjustDateFromCalendar();
  let adjustUI = null;

  if (nextAdjust) {
    const uiDate = new Date(nextAdjust.getTime());
    const uiDateStr = `${uiDate.getMonth() + 1}月${uiDate.getDate()}日`;

    const diff = nextAdjust - now;
    const leftDays = Math.floor(diff / (1000 * 60 * 60 * 24));
    const leftHours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const countdownStr = `${leftDays}天${leftHours}小时`;

    adjustUI = {
  type: "stack",
  direction: "row",
  alignItems: "center",
  padding: [4, 0, 0, 2],
  children: [
    {
      type: "text",
      text: `下轮调价：`,
      font: { size: 11, weight: "bold" },
      textColor: THEME.text
    },
    {
      type: "text",
      text: `${uiDateStr}（${countdownStr}）`,
      font: { size: 11, weight: "bold" },
      textColor: "#FF9500"
    },

    { type: "spacer" },

      ...(trendInfo ? [
  {
    type: "stack",
    direction: "row",
    alignItems: "center",
    children: [
      {
        type: "text",
        text: "预估：",
        font: { size: 11, weight: "bold" },
        textColor: THEME.text
      },
      {
        type: "text",
        text: trendInfo.text,
        font: { size: 11, weight: "bold" },
        textColor: trendInfo.color
      }
    ]
  }
] : [])
  ]
};
  }
  const PRICE = {
    "92": oil?.t92 ? Number(oil.t92) : null,
    "95": oil?.t95 ? Number(oil.t95) : null,
    "98": oil?.t98 ? Number(oil.t98) : null,
    "0": oil?.t0 ? Number(oil.t0) : null
  };

  const ICON_MAP = {
    "92": "fuelpump.fill",
    "95": "fuelpump.fill",
    "98": "fuelpump.fill",
    "0": "fuelpump.fill"
  };

  const ICON_COLOR = {
    "92": "#FFD60A",
    "95": "#FF9500",
    "98": "#FF3B30",
    "0": "#34C759"
  };

  const NAME_CN = {
    "92": "92号汽油",
    "95": "95号汽油",
    "98": "98号汽油",
    "0": "0号柴油"
  };

  const format = (v) => (v ? Number(v).toFixed(2) : "-");

  const item = (key) => ({
    type: "stack",
    direction: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    padding: [4, 0, 4, 0],
    children: [
      {
        type: "text",
        text: NAME_CN[key],
        font: { size: 12, weight: "semibold" },
        textColor: THEME.text
      },
      { type: "spacer", length: 2 },
      {
        type: "stack",
        height: 34,
        alignItems: "center",
        children: [
          {
            type: "image",
            src: "sf-symbol:" + ICON_MAP[key],
            width: 28,
            height: 28,
            color: ICON_COLOR[key]
          }
        ]
      },
      { type: "spacer", length: 4 },
      {
        type: "text",
        text: `¥${format(PRICE[key])}`,
        font: { size: 13, weight: "semibold" },
        textColor: THEME.text
      }
    ]
  });

  return {
    type: "widget",
    padding: [10, 8, 10, 8],
    gap: 6,
    children: [
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 4,
        children: [
          {
            type: "image",
            src: "sf-symbol:fuelpump.fill",
            width: 14,
            height: 14,
            color: THEME.text
          },
          {
            type: "text",
            text: `${CITY}今日油价`,
            font: { size: 14, weight: "semibold" },
            textColor: THEME.text
          },
          { type: "spacer" },
          {
            type: "image",
            src: "sf-symbol:clock.arrow.circlepath",
            width: 12,
            height: 12,
            color: THEME.text
          },
          {
            type: "text",
            text: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`,
            font: { size: 12 },
            textColor: THEME.text
          }
        ]
      },

      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 6,
        children: [item("92"), item("95"), item("98"), item("0")]
      },

      {
        type: "stack",
        direction: "column",
        padding: [0, 2, 0, 2],
        children: [
          ...(adjustUI ? [adjustUI] : [])
        ]
      }
    ]
  };
}
