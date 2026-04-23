/**
 * 贵金属 + 原油组件 - 完整增强版（无日志）
 * 新增：
 *  1. Yahoo Finance 原油（WTI / Brent）
 *  2. 美元价格加粗黑色 + 币种符号
 *  3. 金银类美元/盎司，原油美元/桶
 *  4. 人民币价格元/吨（原油）
 *  5. 图标与字体缩小
 *  6. 删除所有日志输出
 */

const OZ_TO_G = 31.1035;
const BARREL_TO_TON = 7.33;
const DEFAULT_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const THEME = {
  text: { light: "#000000", dark: "#FFFFFF" },
  subtext: { light: "#666666", dark: "#AAAAAA" },
  errorText: { light: "#FF3B30", dark: "#FF6B6B" },
  bg: { light: "#FFFFFF", dark: "#1C1C1E" },
};

const LOCAL_RANGES = {
  AU9999: [150, 2000],
  AG9999: [0.5, 300],
  AU_TD: [150, 2000],
  AG_TD: [0.5, 300],
};

const isValid = (v) => typeof v === "number" && v > 0 && isFinite(v);

/* 日志关闭 */
function safeLog() {}

/* ---------------------- HTTP 安全封装 ---------------------- */
const safeGetText = async (ctx, url, headers = {}) => {
  try {
    const r = await ctx.http.get(url, {
      headers: { "User-Agent": DEFAULT_UA, ...headers },
    });
    if (!r) return null;
    if (typeof r.text === "function") return await r.text();
    if (typeof r === "string") return r;
    return null;
  } catch {
    return null;
  }
};

const safeGetJson = async (ctx, url, headers = {}) => {
  try {
    const r = await ctx.http.get(url, {
      headers: { "User-Agent": DEFAULT_UA, ...headers },
    });
    if (!r) return null;
    if (typeof r.json === "function") return await r.json();
    if (r.json && typeof r.json === "object") return r.json;
    if (typeof r === "object") return r;
    return null;
  } catch {
    return null;
  }
};

/* ---------------------- 汇率 ---------------------- */
async function fetchRate(ctx) {
  const RATE_CACHE_KEY = "last_valid_rate_v2";

  const getCachedRate = async () => {
    try {
      const r = await ctx.cache?.get?.(RATE_CACHE_KEY);
      const parsed = r ? parseFloat(r) : NaN;
      return isValid(parsed) ? parsed : 7.25;
    } catch {
      return 7.25;
    }
  };

  try {
    const sinaText = await safeGetText(
      ctx,
      "https://hq.sinajs.cn/list=fx_susdcny",
      { Referer: "https://finance.sina.com.cn" }
    );
    if (sinaText) {
      const m = sinaText.match(/"(.+?)"/);
      if (m) {
        const p = m[1].split(",");
        const r = parseFloat(p[3]) || parseFloat(p[1]);
        if (r > 6 && r < 8.5) {
          await ctx.cache?.set?.(RATE_CACHE_KEY, r.toString());
          return r;
        }
      }
    }
  } catch {}

  return await getCachedRate();
}

const fixAgUnit = (v) => {
  if (!isValid(v)) return null;
  return v > 1000 ? v / 1000 : v;
};
/* ---------------------- 国际金银 ---------------------- */
async function fetchInternationalSpot(ctx) {
  const map = {};

  try {
    const gp = await safeGetJson(ctx, "https://data-asg.goldprice.org/dbXRates/USD", {
      Referer: "https://goldprice.org/",
    });
    if (gp?.items?.[0]) {
      const xau = parseFloat(gp.items[0].xauPrice);
      const xag = parseFloat(gp.items[0].xagPrice);
      if (isValid(xau)) map.XAU_USD = { val: xau };
      if (isValid(xag)) map.XAG_USD = { val: xag };
    }
  } catch {}

  try {
    const sina = await safeGetText(
      ctx,
      "https://hq.sinajs.cn/list=hf_XAU,hf_XAG,hf_XPT,hf_XPD",
      { Referer: "https://finance.sina.com.cn" }
    );
    if (sina) {
      const pick = (code, key) => {
        const m = sina.match(new RegExp(`var hq_str_${code}="([^"]+)"`));
        if (m) {
          const v = parseFloat(m[1].split(",")[0]);
          if (isValid(v) && !map[key]) map[key] = { val: v };
        }
      };
      pick("hf_XAU", "XAU_USD");
      pick("hf_XAG", "XAG_USD");
      pick("hf_XPT", "PT_USD");
      pick("hf_XPD", "PD_USD");
    }
  } catch {}

  return map;
}

/* ---------------------- 上金所（SGE） ---------------------- */
async function fetchSinaSGE(ctx) {
  const map = {};
  try {
    const text = await safeGetText(
      ctx,
      "https://hq.sinajs.cn/list=hq_sge_au9999,hq_sge_ag9999,hq_sge_autd,hq_sge_agtd",
      { Referer: "https://finance.sina.com.cn" }
    );
    if (text) {
      const parse = (code, key, isAg) => {
        const m = text.match(new RegExp(`hq_sge_${code}="([^"]+)"`));
        if (m) {
          let v = parseFloat(m[1].split(",")[1]);
          if (isAg) v = fixAgUnit(v);
          if (isValid(v)) map[key] = { val: v };
        }
      };
      parse("au9999", "AU9999", false);
      parse("ag9999", "AG9999", true);
      parse("autd", "AU_TD", false);
      parse("agtd", "AG_TD", true);
    }
  } catch {}
  return map;
}

/* ---------------------- 国内主源（集金号 + 东财） ---------------------- */
async function fetchDomesticMaster(ctx) {
  const map = {};

  try {
    const jjh = await safeGetText(
      ctx,
      "https://api.jijinhao.com/plus/q.htm?q=sge_au9999,sge_ag9999,sge_autd,sge_agtd"
    );
    if (jjh) {
      const pick = (id, key, isAg) => {
        const m = jjh.match(new RegExp(`${id}="([^"]+)"`));
        if (m) {
          let v = parseFloat(m[1].split(",")[1]);
          if (isAg) v = fixAgUnit(v);
          if (isValid(v)) map[key] = { val: v };
        }
      };
      pick("sge_au9999", "AU9999", false);
      pick("sge_ag9999", "AG9999", true);
      pick("sge_autd", "AU_TD", false);
      pick("sge_agtd", "AG_TD", true);
    }
  } catch {}

  try {
    const dcp = await safeGetJson(
      ctx,
      "https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f12&secids=118.AU9999,118.AG9999,118.AUTD,118.AGTD"
    );

    const codeMap = { AUTD: "AU_TD", AGTD: "AG_TD" };

    dcp?.data?.diff?.forEach((item) => {
      const code = item.f12;
      const key = codeMap[code] || code;
      let v = parseFloat(item.f2);
      if (code.includes("AG")) v = fixAgUnit(v);
      if (isValid(v) && !map[key]) map[key] = { val: v };
    });
  } catch {}

  return map;
}

/* ---------------------- 国内旧源（和讯 + 中金网） ---------------------- */
async function fetchDomesticOld(ctx) {
  const map = {};

  try {
    const hexun = await safeGetText(ctx, "https://gold.hexun.com/js/goldprice.js");
    if (hexun) {
      const pick = (re, key, isAg) => {
        const m = hexun.match(re);
        if (m) {
          let v = parseFloat(m[1].split(",")[0]);
          if (isAg) v = fixAgUnit(v);
          if (isValid(v) && !map[key]) map[key] = { val: v };
        }
      };
      pick(/var hq_str_gold_AU9999="([^"]+)"/, "AU9999", false);
      pick(/var hq_str_gold_AG9999="([^"]+)"/, "AG9999", true);
    }
  } catch {}

  try {
    const cng = await safeGetJson(ctx, "https://api.cngold.org/price/gold");
    cng?.data?.forEach((i) => {
      let v = parseFloat(i.price);
      if (i.name?.includes("白银")) v = fixAgUnit(v);
      if (i.code === "au9999" && isValid(v) && !map.AU9999) map.AU9999 = { val: v };
      if (i.code === "ag9999" && isValid(v) && !map.AG9999) map.AG9999 = { val: v };
    });
  } catch {}

  return map;
}

/* ---------------------- Yahoo Finance 原油（WTI / Brent） ---------------------- */
async function fetchOil(ctx) {
  const map = {};

  const fetchOne = async (symbol, key) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
    const json = await safeGetJson(ctx, url);
    const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (isValid(price)) map[key] = price;
  };

  await fetchOne("CL=F", "WTI_USD");
  await fetchOne("BZ=F", "BRENT_USD");

  return map;
}
/* ---------------------- 数据整合 ---------------------- */
async function loadMetalData(ctx) {
  const [
    rate,
    inter,
    domesticMap,
    domesticOldMap,
    sinaSGEMap,
    oil
  ] = await Promise.all([
    fetchRate(ctx),
    fetchInternationalSpot(ctx),
    fetchDomesticMaster(ctx),
    fetchDomesticOld(ctx),
    fetchSinaSGE(ctx),
    fetchOil(ctx)
  ]);

  const localRaw = {};
  const pickIf = (target, srcMap) => {
    for (const k of Object.keys(srcMap || {})) {
      if (!target[k] && srcMap[k] && isValid(srcMap[k].val)) {
        target[k] = srcMap[k];
      }
    }
  };

  pickIf(localRaw, domesticMap);
  pickIf(localRaw, sinaSGEMap);
  pickIf(localRaw, domesticOldMap);

  const toG = (item) => {
    if (!item) return null;
    const val = typeof item === "object" ? item.val : item;
    if (!isValid(val)) return null;
    return (val * rate) / OZ_TO_G;
  };

  const validateLocal = (code, entry) => {
    if (!entry || !isValid(entry.val)) return null;
    const r = LOCAL_RANGES[code];
    if (!r) return entry.val;
    if (entry.val >= r[0] && entry.val <= r[1]) return entry.val;
    return null;
  };

  const resolvePrice = (code, intlItem) => {
    const localEntry = localRaw[code];
    const localVal = validateLocal(code, localEntry);
    if (localVal != null) return localVal;
    return toG(intlItem) ?? null;
  };

  const final = {};

  /* 上金所 / 国内价 */
  final.AU9999 = resolvePrice("AU9999", inter.XAU_USD);
  final.AG9999 = resolvePrice("AG9999", inter.XAG_USD);
  final.AU_TD  = resolvePrice("AU_TD",  inter.XAU_USD);
  final.AG_TD  = resolvePrice("AG_TD",  inter.XAG_USD);

  /* 国际金银美元价（美元/盎司） */
  final.AU_USD = inter.XAU_USD?.val ?? null;
  final.AG_USD = inter.XAG_USD?.val ?? null;

  /* 国际金银人民币价（元/克） */
  final.XAUUSD = toG(inter.XAU_USD);
  final.XAGUSD = toG(inter.XAG_USD);

  /* 铂金钯金（人民币/克） */
  final.PT = toG(inter.PT_USD);
  final.PD = toG(inter.PD_USD);

  /* 原油美元价（美元/桶） */
  final.WTI_USD = oil.WTI_USD ?? null;
  final.BRENT_USD = oil.BRENT_USD ?? null;

  /* 原油人民币价（元/吨） */
  final.WTI_CNY = oil.WTI_USD ? oil.WTI_USD * rate * BARREL_TO_TON : null;
  final.BRENT_CNY = oil.BRENT_USD ? oil.BRENT_USD * rate * BARREL_TO_TON : null;

  return final;
}
/* ---------------------- UI + 布局 ---------------------- */
export default async function (ctx) {
  const data = await loadMetalData(ctx);

  const ICON_MAP = {
    AU9999: "sun.max.fill",
    AG9999: "moon.fill",
    AU_TD:  "clock.fill",
    AG_TD:  "clock",
    XAUUSD: "globe",
    XAGUSD: "globe.europe.africa",
    PT:     "sparkles",
    PD:     "diamond.fill",
    WTI_CNY:   "flame.fill",
    BRENT_CNY: "flame"
  };

  const ICON_COLOR = {
    AU9999: { light: "#D4AF37", dark: "#D4AF37" },
    AG9999: { light: "#C0C0C0", dark: "#C0C0C0" },
    AU_TD:  { light: "#FF8C00", dark: "#FF8C00" },
    AG_TD:  { light: "#20B2AA", dark: "#20B2AA" },
    XAUUSD: { light: "#1E90FF", dark: "#1E90FF" },
    XAGUSD: { light: "#6495ED", dark: "#6495ED" },
    PT:     { light: "#708090", dark: "#708090" },
    PD:     { light: "#8A2BE2", dark: "#8A2BE2" },
    WTI_CNY:   { light: "#FF4500", dark: "#FF4500" },
    BRENT_CNY: { light: "#FF6347", dark: "#FF6347" }
  };

  const NAME_CN = {
    AU9999: "黄金9999",
    AG9999: "白银9999",
    AU_TD:  "黄金T+D",
    AG_TD:  "白银T+D",
    XAUUSD: "伦敦金",
    XAGUSD: "伦敦银",
    PT:     "铂金",
    PD:     "钯金",
    WTI_CNY:   "WTI原油",
    BRENT_CNY: "布伦特原油"
  };

  /* 两行五个 */
  const currencies = [
    "AU9999","AG9999","AU_TD","AG_TD","XAUUSD",
    "XAGUSD","PT","PD","WTI_CNY","BRENT_CNY"
  ];

  const format = (v) => (v != null ? Number(v).toFixed(2) : "-");

  /* UI item：美元在上（加粗黑色），人民币在下 */
  const item = (code) => {
    const usdKey = code.replace("_CNY", "_USD");
    const usdVal = data[usdKey];

    return {
      type: "stack",
      direction: "column",
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
      padding: [2, 0, 2, 0],
      children: [
        {
          type: "text",
          text: NAME_CN[code],
          font: { size: 11, weight: "semibold" },
          textColor: THEME.text
        },

        { type: "spacer", length: 1 },

        {
          type: "image",
          src: "sf-symbol:" + ICON_MAP[code],
          width: 17,
          height: 17,
          color: ICON_COLOR[code]
        },

        { type: "spacer", length: 2 },

        /* 美元价格（加粗黑色） */
        usdVal != null
          ? {
              type: "text",
              text: "$" + Number(usdVal).toFixed(2),
              font: { size: 11, weight: "bold" },
              textColor: { light: "#000000", dark: "#000000" }
            }
          : null,

        /* 人民币价格 */
        {
          type: "text",
          text: "¥" + format(data[code]),
          font: { size: 12, weight: "semibold" },
          textColor: THEME.text
        }
      ].filter(Boolean)
    };
  };

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const monthDayTime =
    `${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const row1 = currencies.slice(0, 5);
  const row2 = currencies.slice(5, 10);

  return {
    type: "widget",
    padding: [10, 8, 10, 8],
    gap: 6,
    backgroundColor: THEME.bg,
    refreshAfter: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    children: [
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 6,
        children: [
          {
            type: "image",
            src: "sf-symbol:chart.line.uptrend.xyaxis.circle.fill",
            width: 12,
            height: 12,
            color: { light: THEME.text.light, dark: THEME.text.dark }
          },
          {
            type: "text",
            text: "贵金属行情",
            font: { size: 14, weight: "semibold" },
            textColor: THEME.text
          },
          { type: "spacer" },
          {
            type: "stack",
            direction: "row",
            alignItems: "center",
            gap: 4,
            children: [
              {
                type: "image",
                src: "sf-symbol:clock.arrow.circlepath",
                width: 11,
                height: 11,
                color: { light: THEME.text.light, dark: THEME.text.dark }
              },
              {
                type: "text",
                text: monthDayTime,
                font: { size: 11 },
                textColor: THEME.text
              }
            ]
          }
        ]
      },

      { type: "spacer", length: 4 },

      {
        type: "stack",
        direction: "row",
        justifyContent: "space-between",
        gap: 6,
        children: row1.map(item)
      },

      { type: "spacer", length: 14 },

      {
        type: "stack",
        direction: "row",
        justifyContent: "space-between",
        gap: 6,
        children: row2.map(item)
      }
    ]
  };
}
