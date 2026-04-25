/**
 * 修复点：
 * 1. 东财 f2 直接就是价格，不做除法换算
 * 2. 东财 code 映射：AUTD->AU_TD, AGTD->AG_TD
 *
 *
 */

const OZ_TO_G = 31.1035;
const DEFAULT_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const THEME = {
  text:       { light: "#000000", dark: "#FFFFFF" },
  subtext:    { light: "#666666", dark: "#AAAAAA" },
  errorText:  { light: "#FF3B30", dark: "#FF6B6B" },
  bg:         { light: "#FFFFFF", dark: "#1C1C1E" },
};

const LOCAL_RANGES = {
  AU9999: [150, 2000],
  AG9999: [0.5, 300],
  AU_TD:  [150, 2000],
  AG_TD:  [0.5, 300]
};

const isValid = (v) => typeof v === "number" && v > 0 && isFinite(v);

// 禁用日志输出
function safeLog() { /* no-op */ }

const safeGetText = async (ctx, url, headers = {}) => {
  try {
    const r = await ctx.http.get(url, { headers: { "User-Agent": DEFAULT_UA, ...headers } });
    if (!r) return null;
    if (typeof r.text === "function") return await r.text();
    if (typeof r === "string") return r;
    return null;
  } catch { return null; }
};

const safeGetJson = async (ctx, url, headers = {}) => {
  try {
    const r = await ctx.http.get(url, { headers: { "User-Agent": DEFAULT_UA, ...headers } });
    if (!r) return null;
    if (typeof r.json === "function") return await r.json();
    if (r.json && typeof r.json === "object") return r.json;
    if (typeof r === "object") return r;
    return null;
  } catch { return null; }
};

async function fetchRate(ctx) {
  const RATE_CACHE_KEY = "last_valid_rate_v2";
  const getCachedRate = async () => {
    try {
      const r = await ctx.cache?.get?.(RATE_CACHE_KEY);
      const parsed = r ? parseFloat(r) : NaN;
      return isValid(parsed) ? parsed : 7.25;
    } catch { return 7.25; }
  };

  try {
    const sinaText = await safeGetText(ctx, "https://hq.sinajs.cn/list=fx_susdcny", { Referer: "https://finance.sina.com.cn" });
    if (sinaText) {
      const m = sinaText.match(/"(.+?)"/);
      if (m) {
        const p = m[1].split(",");
        const r = parseFloat(p[3]) || parseFloat(p[1]);
        if (r > 6 && r < 8.5) {
          const cached = await getCachedRate();
          if (!isValid(cached) || Math.abs(r - cached) / cached < 0.05) {
            await ctx.cache?.set?.(RATE_CACHE_KEY, r.toString());
          }
          return r;
        }
      }
    }
  } catch { /* ignore */ }

  const cached = await getCachedRate();
  return cached;
}

const fixAgUnit = (v) => {
  if (!isValid(v)) return null;
  if (v > 1000) return v / 1000;
  return v;
};

async function fetchInternationalSpot(ctx) {
  const map = {};

  try {
    const gp = await safeGetJson(ctx, "https://data-asg.goldprice.org/dbXRates/USD", { Referer: "https://goldprice.org/" });
    if (gp?.items?.[0]) {
      const xau = parseFloat(gp.items[0].xauPrice);
      const xag = parseFloat(gp.items[0].xagPrice);
      if (isValid(xau)) map.XAU_USD = { val: xau, unit: "USD/oz", src: "goldprice" };
      if (isValid(xag)) map.XAG_USD = { val: xag, unit: "USD/oz", src: "goldprice" };
    }
  } catch { /* ignore */ }

  try {
    const sina = await safeGetText(ctx,
      "https://hq.sinajs.cn/list=hf_XAU,hf_XAG,hf_XPT,hf_XPD",
      { Referer: "https://finance.sina.com.cn" }
    );
    if (sina) {
      const parseSina = (code, key) => {
        const m = sina.match(new RegExp(`var hq_str_${code}="([^"]+)"`));
        if (m) {
          const parts = m[1].split(",");
          const val = parseFloat(parts[0]);
          if (isValid(val) && !map[key]) map[key] = { val, unit: "USD/oz", src: "sina" };
        }
      };
      parseSina("hf_XAU", "XAU_USD");
      parseSina("hf_XAG", "XAG_USD");
      parseSina("hf_XPT", "PT_USD");
      parseSina("hf_XPD", "PD_USD");
    }
  } catch { /* ignore */ }

  return map;
}

async function fetchSinaSGE(ctx) {
  const map = {};
  try {
    const text = await safeGetText(ctx,
      "https://hq.sinajs.cn/list=hq_sge_au9999,hq_sge_ag9999,hq_sge_autd,hq_sge_agtd",
      { Referer: "https://finance.sina.com.cn" }
    );
    if (text) {
      const parse = (code, key, isAg) => {
        const m = text.match(new RegExp(`hq_sge_${code}="([^"]+)"`));
        if (m) {
          const parts = m[1].split(",");
          let v = parseFloat(parts[1] ?? parts[0]);
          if (isAg) v = fixAgUnit(v);
          if (isValid(v)) map[key] = { val: v, src: "sinaSGE" };
        }
      };
      parse("au9999", "AU9999", false);
      parse("ag9999", "AG9999", true);
      parse("autd",   "AU_TD",  false);
      parse("agtd",   "AG_TD",  true);
    }
  } catch { /* ignore */ }
  return map;
}

async function fetchDomesticMaster(ctx) {
  const map = {};

  try {
    const jjh = await safeGetText(ctx, "https://api.jijinhao.com/plus/q.htm?q=sge_au9999,sge_ag9999,sge_autd,sge_agtd");
    if (jjh) {
      const parseJJH = (id, key, isAg) => {
        const re = new RegExp(`${id}="([^"]+)"`);
        const m = jjh.match(re);
        if (m) {
          const parts = m[1].split(",");
          const raw = parts[1] ?? parts[0];
          let v = parseFloat(raw);
          if (isAg) v = fixAgUnit(v);
          if (isValid(v)) map[key] = { val: v, src: "jjh", raw };
        }
      };
      parseJJH("sge_au9999", "AU9999", false);
      parseJJH("sge_ag9999", "AG9999", true);
      parseJJH("sge_autd",   "AU_TD",  false);
      parseJJH("sge_agtd",   "AG_TD",  true);
    }
  } catch { /* ignore */ }

  try {
    const dcp = await safeGetJson(ctx,
      "https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f1,f2,f12&secids=118.AU9999,118.AG9999,118.AUTD,118.AGTD"
    );

    const codeMap = { "AUTD": "AU_TD", "AGTD": "AG_TD" };

    dcp?.data?.diff?.forEach(item => {
      try {
        const code = item.f12;
        const key = codeMap[code] || code;
        let v = parseFloat(item.f2);
        const isAg = code.includes("AG");
        if (isAg) v = fixAgUnit(v);
        if (isValid(v) && !map[key]) map[key] = { val: v, src: "eastmoney" };
      } catch { /* ignore */ }
    });
  } catch { /* ignore */ }

  return map;
}

/**
 * 使用 Yahoo Finance chart API 获取原油价格
 * - Brent symbol: BZ=F
 * - WTI symbol: CL=F
 */
async function fetchOilPrices(ctx) {
  const parseYahoo = (json) => {
    try {
      if (!json || !json.chart || !json.chart.result || !json.chart.result[0]) return null;
      const res = json.chart.result[0];
      if (res.meta && isValid(res.meta.regularMarketPrice)) return Number(res.meta.regularMarketPrice);
      const closes = res.indicators?.quote?.[0]?.close;
      if (Array.isArray(closes)) {
        for (let i = closes.length - 1; i >= 0; i--) {
          const v = closes[i];
          if (isValid(v)) return Number(v);
        }
      }
    } catch { /* ignore */ }
    return null;
  };

  const result = { BRENT: null, WTI: null };

  try {
    const urlBrent = "https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?range=1d&interval=2m";
    const jb = await safeGetJson(ctx, urlBrent, { Referer: "https://finance.yahoo.com" });
    const brentPrice = parseYahoo(jb);
    if (isValid(brentPrice)) result.BRENT = brentPrice;
  } catch { /* ignore */ }

  try {
    const urlWti = "https://query1.finance.yahoo.com/v8/finance/chart/CL=F?range=1d&interval=2m";
    const jw = await safeGetJson(ctx, urlWti, { Referer: "https://finance.yahoo.com" });
    const wtiPrice = parseYahoo(jw);
    if (isValid(wtiPrice)) result.WTI = wtiPrice;
  } catch { /* ignore */ }

  return result;
}

async function loadMetalData(ctx) {
  const [rate, inter, domesticMap, sinaSGEMap, oil] = await Promise.all([
    fetchRate(ctx),
    fetchInternationalSpot(ctx),
    fetchDomesticMaster(ctx),
    fetchSinaSGE(ctx),
    fetchOilPrices(ctx)
  ]);

  const localRaw = {};
  const pickIf = (target, srcMap) => {
    for (const k of Object.keys(srcMap || {})) {
      if (!target[k] && srcMap[k] && isValid(srcMap[k].val)) target[k] = srcMap[k];
    }
  };
  pickIf(localRaw, domesticMap);
  pickIf(localRaw, sinaSGEMap);

  const toG = (item) => {
    if (!item) return null;
    const val = (typeof item === "object") ? item.val : item;
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
    const intlVal = toG(intlItem);
    return intlVal ?? null;
  };

  const final = {};
  final.AU9999 = resolvePrice("AU9999", inter.XAU_USD);
  final.AG9999 = resolvePrice("AG9999", inter.XAG_USD);
  final.XAUUSD = toG(inter.XAU_USD);
  final.XAGUSD = toG(inter.XAG_USD);
  final.PT = toG(inter.PT_USD);
  final.PD = toG(inter.PD_USD);
  final.AU_TD  = resolvePrice("AU_TD",  inter.XAU_USD);
  final.AG_TD  = resolvePrice("AG_TD",  inter.XAG_USD);

  // 原油价格（美元/桶）
  final.BRENT = isValid(oil.BRENT) ? oil.BRENT : null;
  final.WTI   = isValid(oil.WTI)   ? oil.WTI   : null;

  return final;
}

export default async function (ctx) {
  const data = await loadMetalData(ctx);

  const ICON_MAP = {
    AU9999: "sun.max.fill",
    AG9999: "moon.fill",
    XAUUSD: "globe",
    XAGUSD: "globe.europe.africa",
    PT:     "sparkles",
    PD:     "diamond.fill",
    AU_TD:  "clock.fill",
    AG_TD:  "clock",
    BRENT:  "drop.fill",
    WTI:    "flame.fill"
  };

  const ICON_COLOR = {
    AU9999: { light: "#D4AF37", dark: "#D4AF37" },
    AG9999: { light: "#C0C0C0", dark: "#C0C0C0" },
    XAUUSD: { light: "#1E90FF", dark: "#1E90FF" },
    XAGUSD: { light: "#6495ED", dark: "#6495ED" },
    PT:     { light: "#708090", dark: "#708090" },
    PD:     { light: "#8A2BE2", dark: "#8A2BE2" },
    AU_TD:  { light: "#FF8C00", dark: "#FF8C00" },
    AG_TD:  { light: "#20B2AA", dark: "#20B2AA" },
    BRENT:  { light: "#FF4500", dark: "#FF4500" },
    WTI:    { light: "#1E90FF", dark: "#1E90FF" }
  };

  const NAME_CN = {
    AU9999: "黄金9999",
    AG9999: "白银9999",
    XAUUSD: "伦敦金",
    XAGUSD: "伦敦银",
    PT:     "铂金",
    PD:     "钯金",
    AU_TD:  "黄金TD",
    AG_TD:  "白银TD",
    BRENT:  "布伦特原油",
    WTI:    "美国原油"
  };

  const currencies = ["AU9999","AG9999","XAUUSD","XAGUSD","PT","PD","AU_TD","AG_TD","BRENT","WTI"];

  const formatMetal = (v) => (v != null ? `¥${Number(v).toFixed(2)}` : "-");
  const formatOil = (v) => (v != null ? `$${Number(v).toFixed(2)}` : "-");

  const item = (code) => {
    const isOil = code === "BRENT" || code === "WTI";
    const display = isOil ? formatOil(data[code]) : formatMetal(data[code]);
    return {
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
          text: display,
          font: { size: 12, weight: "semibold" }, 
          textColor: THEME.text
        }
      ]
    };
  };

  const hasAnyData = currencies.some(c => data[c] != null);
  const fetchError = !hasAnyData;

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr =
    `${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const half = Math.ceil(currencies.length / 2);
  const row1 = currencies.slice(0, half);
  const row2 = currencies.slice(half);

  return {
    type: "widget",
    padding: [10, 8, 10, 8],
    gap: 6, // 统一使用外层的间距处理方式
    backgroundColor: THEME.bg,
    refreshAfter: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    children: [

      // 顶部标题栏
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 4,
        children: [
          {
            type: "image",
            src: "sf-symbol:chart.line.uptrend.xyaxis.circle.fill",
            width: 15, 
            height: 15,
            color: THEME.text
          },
          {
            type: "text",
            text: "大宗商品行情",
            font: { size: 15, weight: "semibold" }, 
            textColor: THEME.text
          },
          { type: "spacer" },
          ...(fetchError ? [
            {
              type: "text",
              text: "- 获取失败 -",
              font: { size: 11 }, 
              textColor: THEME.errorText
            }
          ] : [
            {
              type: "image",
              src: "sf-symbol:clock.arrow.circlepath",
              width: 11,
              height: 11,
              color: THEME.text
            },
            {
              type: "text",
              text: dateStr,
              font: { size: 11 },
              textColor: THEME.text
            }
          ])
        ]
      },

      // 第一行
      {
        type: "stack",
        direction: "row",
        justifyContent: "space-between",
        gap: 6,
        children: row1.map(item)
      },

      // 第二行
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
