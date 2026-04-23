/**
 * 贵金属组件 - 修复版
 * 修复点：
 *  1. 东财 f2 直接就是价格，不做除法换算
 *  2. 东财 code 映射：AUTD->AU_TD, AGTD->AG_TD
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

function safeLog(...args) {
  try { console.log("[贵金属]", ...args); } catch { /* ignore */ }
}

const safeGetText = async (ctx, url, headers = {}) => {
  try {
    const r = await ctx.http.get(url, { headers: { "User-Agent": DEFAULT_UA, ...headers } });
    if (!r) { safeLog("safeGetText null response:", url); return null; }
    if (typeof r.text === "function") return await r.text();
    if (typeof r === "string") return r;
    safeLog("safeGetText unknown response type:", url, typeof r);
    return null;
  } catch (e) { safeLog("safeGetText error:", url, e?.message); return null; }
};

const safeGetJson = async (ctx, url, headers = {}) => {
  try {
    const r = await ctx.http.get(url, { headers: { "User-Agent": DEFAULT_UA, ...headers } });
    if (!r) { safeLog("safeGetJson null response:", url); return null; }
    if (typeof r.json === "function") return await r.json();
    if (r.json && typeof r.json === "object") return r.json;
    if (typeof r === "object") return r;
    safeLog("safeGetJson unknown response type:", url, typeof r);
    return null;
  } catch (e) { safeLog("safeGetJson error:", url, e?.message); return null; }
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
        safeLog("汇率原始值:", r);
        if (r > 6 && r < 8.5) {
          const cached = await getCachedRate();
          if (!isValid(cached) || Math.abs(r - cached) / cached < 0.05) {
            await ctx.cache?.set?.(RATE_CACHE_KEY, r.toString());
          }
          return r;
        }
      }
    }
  } catch (e) { safeLog("汇率获取失败:", e?.message); }

  const cached = await getCachedRate();
  safeLog("使用缓存汇率:", cached);
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
      safeLog("goldprice XAU:", xau, "XAG:", xag);
      if (isValid(xau)) map.XAU_USD = { val: xau, unit: "USD/oz", src: "goldprice" };
      if (isValid(xag)) map.XAG_USD = { val: xag, unit: "USD/oz", src: "goldprice" };
    }
  } catch (e) { safeLog("goldprice 失败:", e?.message); }

  try {
    const sina = await safeGetText(ctx,
      "https://hq.sinajs.cn/list=hf_XAU,hf_XAG,hf_XPT,hf_XPD",
      { Referer: "https://finance.sina.com.cn" }
    );
    if (sina) {
      safeLog("新浪国际贵金属原始:", sina.slice(0, 200));
      const parseSina = (code, key) => {
        const m = sina.match(new RegExp(`var hq_str_${code}="([^"]+)"`));
        if (m) {
          const parts = m[1].split(",");
          const val = parseFloat(parts[0]);
          safeLog(`新浪 ${code}:`, val);
          if (isValid(val) && !map[key]) map[key] = { val, unit: "USD/oz", src: "sina" };
        } else {
          safeLog(`新浪 ${code} 未匹配`);
        }
      };
      parseSina("hf_XAU", "XAU_USD");
      parseSina("hf_XAG", "XAG_USD");
      parseSina("hf_XPT", "PT_USD");
      parseSina("hf_XPD", "PD_USD");
    }
  } catch (e) { safeLog("新浪国际 失败:", e?.message); }

  safeLog("国际价汇总:", JSON.stringify(map));
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
      safeLog("新浪SGE原始:", text.slice(0, 300));
      const parse = (code, key, isAg) => {
        const m = text.match(new RegExp(`hq_sge_${code}="([^"]+)"`));
        if (m) {
          const parts = m[1].split(",");
          let v = parseFloat(parts[1] ?? parts[0]);
          if (isAg) v = fixAgUnit(v);
          safeLog(`新浪SGE ${code}:`, v);
          if (isValid(v)) map[key] = { val: v, src: "sinaSGE" };
        } else {
          safeLog(`新浪SGE ${code} 未匹配`);
        }
      };
      parse("au9999", "AU9999", false);
      parse("ag9999", "AG9999", true);
      parse("autd",   "AU_TD",  false);
      parse("agtd",   "AG_TD",  true);
    }
  } catch (e) { safeLog("新浪SGE 失败:", e?.message); }
  return map;
}

async function fetchDomesticMaster(ctx) {
  const map = {};

  try {
    const jjh = await safeGetText(ctx, "https://api.jijinhao.com/plus/q.htm?q=sge_au9999,sge_ag9999,sge_autd,sge_agtd");
    safeLog("集金号原始:", jjh?.slice(0, 300));
    if (jjh) {
      const parseJJH = (id, key, isAg) => {
        const re = new RegExp(`${id}="([^"]+)"`);
        const m = jjh.match(re);
        if (m) {
          const parts = m[1].split(",");
          const raw = parts[1] ?? parts[0];
          let v = parseFloat(raw);
          if (isAg) v = fixAgUnit(v);
          safeLog(`集金号 ${id}:`, v, "raw:", raw);
          if (isValid(v)) map[key] = { val: v, src: "jjh", raw };
        } else {
          safeLog(`集金号 ${id} 未匹配`);
        }
      };
      parseJJH("sge_au9999", "AU9999", false);
      parseJJH("sge_ag9999", "AG9999", true);
      parseJJH("sge_autd",   "AU_TD",  false);
      parseJJH("sge_agtd",   "AG_TD",  true);
    }
  } catch (e) { safeLog("集金号 失败:", e?.message); }

  try {
    const dcp = await safeGetJson(ctx,
      "https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f1,f2,f12&secids=118.AU9999,118.AG9999,118.AUTD,118.AGTD"
    );
    safeLog("东财原始:", JSON.stringify(dcp?.data?.diff?.slice(0, 4)));

    // 东财 code -> 本地 key 映射
    const codeMap = { "AUTD": "AU_TD", "AGTD": "AG_TD" };

    dcp?.data?.diff?.forEach(item => {
      try {
        const code = item.f12;
        const key = codeMap[code] || code; // AUTD->AU_TD, AGTD->AG_TD, 其余不变

        // 修复：f2 本身就是最终价格（元/克），不做任何除法
        let v = parseFloat(item.f2);
        const isAg = code.includes("AG");
        if (isAg) v = fixAgUnit(v);

        safeLog(`东财 ${code} -> ${key}:`, v);
        if (isValid(v) && !map[key]) map[key] = { val: v, src: "eastmoney" };
      } catch (ie) { safeLog("东财单项解析失败:", ie?.message); }
    });
  } catch (e) { safeLog("东财 失败:", e?.message); }

  safeLog("国内主源汇总:", JSON.stringify(map));
  return map;
}

async function fetchDomesticOld(ctx) {
  const map = {};

  try {
    const hexun = await safeGetText(ctx, "https://gold.hexun.com/js/goldprice.js");
    safeLog("和讯原始:", hexun?.slice(0, 200));
    if (hexun) {
      const pick = (re, k, isAg) => {
        const m = hexun.match(re);
        if (m) {
          let v = parseFloat(m[1].split(",")[0]);
          if (isAg) v = fixAgUnit(v);
          safeLog(`和讯 ${k}:`, v);
          if (isValid(v) && !map[k]) map[k] = { val: v, src: "hexun" };
        }
      };
      pick(/var hq_str_gold_AU9999="([^"]+)"/, "AU9999", false);
      pick(/var hq_str_gold_AG9999="([^"]+)"/, "AG9999", true);
    }
  } catch (e) { safeLog("和讯 失败:", e?.message); }

  try {
    const cng = await safeGetJson(ctx, "https://api.cngold.org/price/gold");
    safeLog("中金网原始条数:", cng?.data?.length);
    cng?.data?.forEach(i => {
      try {
        let v = parseFloat(i.price);
        const isAg = i.name?.includes("白银");
        if (isAg) v = fixAgUnit(v);
        safeLog(`中金网 ${i.code}:`, v, i.name);
        if (i.code === "au9999" && isValid(v) && !map.AU9999) map.AU9999 = { val: v, src: "cngold" };
        if (i.code === "ag9999" && isValid(v) && !map.AG9999) map.AG9999 = { val: v, src: "cngold" };
      } catch { /* ignore */ }
    });
  } catch (e) { safeLog("中金网 失败:", e?.message); }

  safeLog("旧源汇总:", JSON.stringify(map));
  return map;
}

async function loadMetalData(ctx) {
  const [rate, inter, domesticMap, domesticOldMap, sinaSGEMap] = await Promise.all([
    fetchRate(ctx),
    fetchInternationalSpot(ctx),
    fetchDomesticMaster(ctx),
    fetchDomesticOld(ctx),
    fetchSinaSGE(ctx),
  ]);

  safeLog("汇率:", rate);

  const localRaw = {};
  const pickIf = (target, srcMap) => {
    for (const k of Object.keys(srcMap || {})) {
      if (!target[k] && srcMap[k] && isValid(srcMap[k].val)) target[k] = srcMap[k];
    }
  };
  pickIf(localRaw, domesticMap);
  pickIf(localRaw, sinaSGEMap);
  pickIf(localRaw, domesticOldMap);

  safeLog("合并后国内源:", JSON.stringify(localRaw));

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
    safeLog(`${code} 超出范围 [${r}]:`, entry.val);
    return null;
  };

  const resolvePrice = (code, intlItem) => {
    const localEntry = localRaw[code];
    const localVal = validateLocal(code, localEntry);
    if (localVal != null) {
      safeLog(`${code} 使用本地价:`, localVal, "来源:", localEntry?.src);
      return localVal;
    }
    const intlVal = toG(intlItem);
    safeLog(`${code} 回退国际换算:`, intlVal);
    return intlVal ?? null;
  };

  const final = {};
  final.AU9999 = resolvePrice("AU9999", inter.XAU_USD);
  final.AG9999 = resolvePrice("AG9999", inter.XAG_USD);
  final.AU_TD  = resolvePrice("AU_TD",  inter.XAU_USD);
  final.AG_TD  = resolvePrice("AG_TD",  inter.XAG_USD);
  final.XAUUSD = toG(inter.XAU_USD);
  final.XAGUSD = toG(inter.XAG_USD);
  final.PT = toG(inter.PT_USD);
  final.PD = toG(inter.PD_USD);

  safeLog("最终价格:", JSON.stringify(final));
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
    AG_TD:  "clock"
  };

  const ICON_COLOR = {
    AU9999: { light: "#D4AF37", dark: "#D4AF37" },
    AG9999: { light: "#C0C0C0", dark: "#C0C0C0" },
    XAUUSD: { light: "#1E90FF", dark: "#1E90FF" },
    XAGUSD: { light: "#6495ED", dark: "#6495ED" },
    PT:     { light: "#708090", dark: "#708090" },
    PD:     { light: "#8A2BE2", dark: "#8A2BE2" },
    AU_TD:  { light: "#FF8C00", dark: "#FF8C00" },
    AG_TD:  { light: "#20B2AA", dark: "#20B2AA" }
  };

  const NAME_CN = {
    AU9999: "黄金",
    AG9999: "白银",
    XAUUSD: "伦敦金",
    XAGUSD: "伦敦银",
    PT:     "铂金",
    PD:     "钯金",
    AU_TD:  "黄金T+D",
    AG_TD:  "白银T+D"
  };

  const currencies = ["AU9999","AG9999","XAUUSD","XAGUSD","PT","PD","AU_TD","AG_TD"];
  const format = (v) => (v != null ? `¥${Number(v).toFixed(2)}` : "-");

  const item = (code) => ({
    type: "stack",
    direction: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    padding: [4, 0, 4, 0],
    children: [
      { type: "text", text: NAME_CN[code], font: { size: 12, weight: "semibold" }, textColor: THEME.text },
      { type: "spacer", length: 2 },
      { type: "image", src: "sf-symbol:" + ICON_MAP[code], width: 20, height: 20, color: ICON_COLOR[code] },
      { type: "spacer", length: 3 },
      { type: "text", text: format(data[code]), font: { size: 13, weight: "semibold" }, textColor: THEME.text }
    ]
  });

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const monthDayTime = `${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const half = Math.ceil(currencies.length / 2);
  const row1 = currencies.slice(0, half);
  const row2 = currencies.slice(half);

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
          { type: "image", src: "sf-symbol:chart.line.uptrend.xyaxis.circle.fill", width: 13, height: 13, color: { light: THEME.text.light, dark: THEME.text.dark } },
          { type: "text", text: "贵金属行情", font: { size: 14, weight: "semibold" }, textColor: THEME.text },
          { type: "spacer" },
          {
            type: "stack",
            direction: "row",
            alignItems: "center",
            gap: 4,
            children: [
              { type: "image", src: "sf-symbol:clock.arrow.circlepath", width: 12, height: 12, color: { light: THEME.text.light, dark: THEME.text.dark } },
              { type: "text", text: monthDayTime, font: { size: 12 }, textColor: THEME.text }
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

      { type: "spacer", length: 18 },

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
