/**
 * 全国城市油价（远程城市映射 + 省份缓存 + 调价日历双地址 + 缓存 7 天）
 */

export default async function (ctx) {
  const THEME = {
    text: { light: "#000000", dark: "#FFFFFF" }
  };

  // ⭐ 用户设置城市（环境变量）
  const CITY = ctx.env.CITY || "南宁";

  // ⭐ 本地兜底城市映射（远程失败时使用）
  const LOCAL_CITY_MAP = {
    "北京": ["北京"],
    "上海": ["上海"],
    "天津": ["天津"],
    "重庆": ["重庆"],
    "广东": ["广州","深圳","佛山","东莞","珠海","中山","惠州","汕头","湛江","肇庆","江门","茂名","阳江","清远","潮州","揭阳","梅州","韶关","汕尾"],
    "广西": ["南宁","柳州","桂林","梧州","北海","防城港","钦州","贵港","玉林","百色","河池","来宾","崇左","贺州"]
  };

  // ⭐ 城市映射远程地址（双地址）
  const CITY_MAP_URLS = [
    "https://你的域名/adjust_calendar.json",
    "https://你的域名/adjust_calendar.json"
  ];

  const CITY_MAP_CACHE_KEY = "city_map_cache";
  const CACHE_EXPIRE = 7 * 24 * 60 * 60 * 1000;

  // ⭐ 获取城市映射（远程 + 缓存 + 故障转移）
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
          await ctx.storage.set(CITY_MAP_CACHE_KEY, {
            time: nowTime,
            data: json
          });
          return json;
        }
      } catch (e) {
        continue;
      }
    }

    // 远程失败 → 使用本地兜底
    return LOCAL_CITY_MAP;
  }

  const CITY_MAP = await fetchCityMap();

  // ⭐ 自动识别省份（优先远程）
  const PROVINCE = CITY_MAP[CITY] || CITY;

  // ⭐ 油价缓存 key（按省份）
  const CACHE_KEY = `oil_cache_${PROVINCE}`;

  // ⭐ 读取缓存
  const cache = await ctx.storage.get(CACHE_KEY);
  const nowTime = Date.now();

  let oil = null;
  const cacheValid = cache && nowTime - cache.time < CACHE_EXPIRE;

  if (cacheValid) {
    oil = cache.data;
  } else {
    const API = `https://www.mxnzp.com/api/oil/search?province=${encodeURIComponent(
      PROVINCE
    )}&app_id=lq3kkhsrll7hfaop&app_secret=I4FH8JgwaEZvGj2ZFLYNmtIJ6YZjiD9r`;

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

  // ⭐ 油价格式化
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

  // ⭐ 刷新时间
  const now = new Date();
  const dateStr =
    `${now.getFullYear()}-` +
    `${String(now.getMonth() + 1).padStart(2, "0")}-` +
    `${String(now.getDate()).padStart(2, "0")} ` +
    `${String(now.getHours()).padStart(2, "0")}:` +
    `${String(now.getMinutes()).padStart(2, "0")}`;

  // ⭐ 调价日历远程地址（双地址）
  const CALENDAR_URLS = [
    "https://你的域名/adjust_calendar.json",
    "https://你的域名/adjust_calendar.json"
  ];

  const CALENDAR_CACHE_KEY = "oil_adjust_calendar_cache";

  // ⭐ 获取调价日历（带缓存 + 双地址故障转移）
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
      } catch (e) {
        continue;
      }
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

  function getNextAdjustDate() {
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

  const nextAdjust = getNextAdjustDate();

  const uiDate = new Date(nextAdjust.getTime());
  const uiDateStr = `${uiDate.getMonth() + 1}月${uiDate.getDate()}日`;

  const diff = nextAdjust - now;
  const leftDays = Math.floor(diff / (1000 * 60 * 60 * 24));
  const leftHours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const countdownStr = `${leftDays}天${leftHours}小时`;

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
            text: dateStr,
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
        direction: "row",
        alignItems: "center",
        padding: [4, 0, 0, 2],
        children: [
          {
            type: "text",
            text: `下轮调价：`,
            font: { size: 12, weight: "bold" },
            textColor: THEME.text
          },
          {
            type: "text",
            text: `${uiDateStr}（${countdownStr}）`,
            font: { size: 12, weight: "bold" },
            textColor: "#FF9500"
          }
        ]
      }
    ]
  };
}
