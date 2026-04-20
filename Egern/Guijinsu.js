/**
 * ================================
 *  贵金属组件最终版（Sam 专用 · 6 分钟缓存）
 *  主源：gold-api.cn（多品种）
 *  辅助源：和讯 + 新浪 + 金投网
 *  外盘：新浪财经（伦敦金银 + COMEX）
 *  全部人民币/克
 * ================================
 */

const OZ_TO_G = 31.1035;

/* 安全 GET */
const safeGet = async (ctx, url) => {
  try {
    const r = await ctx.http.get(url);
    return await r.json();
  } catch {
    return null;
  }
};

/* ================================
 * gold-api 映射表（来自 /varieties）
 * ================================ */
const GOLD_API_MAP = {
  AU9999: "1053",
  AU_TD: "1051",
  AG_TD: "1052",
  PT: "1056",

  XAUUSD: "hf_XAU",
  XAGUSD: "hf_XAG",
  GC00Y: "hf_GC",
  SI00Y: "hf_SI"
};

/* ================================
 * 6 分钟缓存
 * ================================ */
let GOLD_CACHE = {
  timestamp: 0,
  data: null
};

function isCacheValid() {
  return GOLD_CACHE.data && (Date.now() - GOLD_CACHE.timestamp < 360000);
}

/* ================================
 * gold-api 主源（带缓存）
 * ================================ */
async function fetchGoldAPI(ctx) {
  if (isCacheValid()) {
    return GOLD_CACHE.data;
  }

  const map = {};

  for (const key in GOLD_API_MAP) {
    const goldid = GOLD_API_MAP[key];
    const url =
      `https://gold-api.cn/api/v1/gold/realtime?goldid=${goldid}&appkey=SKYQ8GLWNS8L25SVBN3Q`;

    const json = await safeGet(ctx, url);
    if (!json || json.success !== "1") continue;

    const item = json.result?.dtList?.[goldid];
    if (!item || !item.lastPrice) continue;

    map[key] = Number(item.lastPrice);
  }

  GOLD_CACHE = {
    timestamp: Date.now(),
    data: map
  };

  return map;
}

/* ================================
 * 和讯（Hexun）
 * ================================ */
async function fetchHexun(ctx) {
  const url = "https://gold.hexun.com/js/goldprice.js";
  try {
    const r = await ctx.http.get(url);
    const text = await r.text();

    const map = {};
    const pick = (regex, key) => {
      const m = text.match(regex);
      if (m) map[key] = Number(m[1].split(",")[0]);
    };

    pick(/var hq_str_gold_AU9999="([^"]+)"/, "AU9999");
    pick(/var hq_str_gold_AG9999="([^"]+)"/, "AG9999");
    pick(/var hq_str_gold_AUTD="([^"]+)"/, "AU_TD");
    pick(/var hq_str_gold_AGTD="([^"]+)"/, "AG_TD");

    pick(/var hq_str_gold_XAUUSD="([^"]+)"/, "XAUUSD");
    pick(/var hq_str_gold_XAGUSD="([^"]+)"/, "XAGUSD");

    return map;
  } catch {
    return {};
  }
}

/* ================================
 * 新浪财经（外盘 + COMEX）
 * ================================ */
async function fetchSina(ctx) {
  const url =
    "https://hq.sinajs.cn/list=hf_XAU,hf_XAG,hf_GC00Y,hf_SI00Y";
  try {
    const r = await ctx.http.get(url, {
      headers: { Referer: "https://finance.sina.com.cn" }
    });
    const text = await r.text();

    const map = {};
    const parse = (code, key) => {
      const m = text.match(new RegExp(`var hq_str_${code}="([^"]+)"`));
      if (!m) return;
      const arr = m[1].split(",");
      map[key] = Number(arr[0]);
    };

    parse("hf_XAU", "XAUUSD");
    parse("hf_XAG", "XAGUSD");
    parse("hf_GC00Y", "GC00Y");
    parse("hf_SI00Y", "SI00Y");

    return map;
  } catch {
    return {};
  }
}

/* ================================
 * 金投网（CNGold）
 * ================================ */
async function fetchCNGold(ctx) {
  const url = "https://api.cngold.org/price/gold";
  const json = await safeGet(ctx, url);
  if (!json?.data) return {};

  const map = {};
  for (const item of json.data) {
    if (!item.price) continue;

    if (item.name.includes("AU9999")) map.AU9999 = item.price;
    if (item.name.includes("AG9999")) map.AG9999 = item.price;
    if (item.name.includes("黄金") && item.name.includes("T+D"))
      map.AU_TD = item.price;
    if (item.name.includes("白银") && item.name.includes("T+D"))
      map.AG_TD = item.price;
  }
  return map;
}

/* ================================
 * 新浪汇率（USD/CNY）
 * ================================ */
async function fetchSinaFX(ctx) {
  const url = "https://hq.sinajs.cn/list=fx_susdcny";
  try {
    const r = await ctx.http.get(url, {
      headers: { Referer: "https://finance.sina.com.cn" }
    });
    const text = await r.text();
    const match = text.match(/"(.+?)"/);
    if (!match) return 7.2;
    const parts = match[1].split(",");
    return Number(parts[1]) || 7.2;
  } catch {
    return 7.2;
  }
}

/* ================================
 * 外盘美元/盎司 → 人民币/克
 * ================================ */
function convertToCNYPerGram(usdPerOunce, usdToCny) {
  if (!usdPerOunce) return null;
  return (usdPerOunce * usdToCny) / OZ_TO_G;
}

/* ================================
 * 四源合并 + 故障转移
 * ================================ */
async function loadMetalData(ctx) {
  const usdToCny = await fetchSinaFX(ctx);

  const sources = [
    await fetchGoldAPI(ctx),      // ⭐ 主源（带缓存）
    await fetchHexun(ctx),
    await fetchSina(ctx),
    await fetchCNGold(ctx)
  ];

  const data = {
    AU9999: null,
    AG9999: null,
    AU_TD: null,
    AG_TD: null,
    PT: null,
    PD: null,
    XAUUSD: null,
    XAGUSD: null,
    GC00Y: null,
    SI00Y: null
  };

  for (const src of sources) {
    for (const k in src) {
      if (src[k] != null) data[k] = src[k];
    }
  }

  data.XAUUSD = convertToCNYPerGram(data.XAUUSD, usdToCny);
  data.XAGUSD = convertToCNYPerGram(data.XAGUSD, usdToCny);
  data.GC00Y = convertToCNYPerGram(data.GC00Y, usdToCny);
  data.SI00Y = convertToCNYPerGram(data.SI00Y, usdToCny);

  return data;
}

export default async function (ctx) {
  const data = await loadMetalData(ctx);

  const THEME = {
    text: { light: "#000000", dark: "#FFFFFF" }
  };

  const now = new Date();
  const dateStr =
    `${String(now.getMonth() + 1).padStart(2, "0")}-` +
    `${String(now.getDate()).padStart(2, "0")} ` +
    `${String(now.getHours()).padStart(2, "0")}:` +
    `${String(now.getMinutes()).padStart(2, "0")}:` +
    `${String(now.getSeconds()).padStart(2, "0")}`;

  const ICON_MAP = {
    AU9999: "sun.max.fill",
    AG9999: "moon.fill",
    XAUUSD: "globe",
    XAGUSD: "globe.europe.africa",
    PT: "sparkles",
    PD: "diamond.fill",
    AU_TD: "clock.fill",
    AG_TD: "clock",
    GC00Y: "chart.line.uptrend.xyaxis",
    SI00Y: "chart.xyaxis.line"
  };

  const ICON_COLOR = {
    AU9999: "#D4AF37",
    AG9999: "#C0C0C0",
    XAUUSD: "#1E90FF",
    XAGUSD: "#6495ED",
    PT: "#708090",
    PD: "#8A2BE2",
    AU_TD: "#FF8C00",
    AG_TD: "#20B2AA",
    GC00Y: "#DC143C",
    SI00Y: "#2E8B57"
  };

  const NAME_CN = {
    AU9999: "黄金",
    AG9999: "白银",
    XAUUSD: "伦敦金",
    XAGUSD: "伦敦银",
    PT: "铂金",
    PD: "钯金",
    AU_TD: "黄金T+D",
    AG_TD: "白银T+D",
    GC00Y: "COMEX金",
    SI00Y: "COMEX银"
  };

  const metals = [
    "AU9999",
    "AG9999",
    "XAUUSD",
    "XAGUSD",
    "PT",
    "PD",
    "AU_TD",
    "AG_TD",
    "GC00Y",
    "SI00Y"
  ];

  const format = (v) => (v ? Number(v).toFixed(2) : "-");

  const item = (code) => ({
    type: "stack",
    direction: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    padding: [4, 0, 4, 0],
    children: [
      {
        type: "text",
        text: NAME_CN[code],
        font: { size: 12, weight: "semibold" },
        textColor: THEME.text
      },
      { type: "spacer", length: 2 },
      {
        type: "stack",
        height: 26,
        alignItems: "center",
        children: [
          {
            type: "image",
            src: "sf-symbol:" + ICON_MAP[code],
            width: 22,
            height: 22,
            color: ICON_COLOR[code]
          }
        ]
      },
      { type: "spacer", length: 3 },
      {
        type: "text",
        text: `¥${format(data[code])}`,
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
            src: "sf-symbol:globe.asia.australia.fill",
            width: 13,
            height: 13,
            color: THEME.text
          },
          {
            type: "text",
            text: "贵金属行情（人民币/克）",
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
        justifyContent: "space-between",
        gap: 6,
        children: metals.slice(0, 5).map(item)
      },
      {
        type: "stack",
        direction: "row",
        justifyContent: "space-between",
        gap: 6,
        children: metals.slice(5, 10).map(item)
      }
    ]
  };
}
