/**
 * 离岸人民币（CNH）汇率 + 在岸人民币（CNY）
 */

export default async function (ctx) {
  const THEME = {
    text:       { light: "#000000", dark: "#FFFFFF" },
    subtext:    { light: "#666666", dark: "#AAAAAA" },
    errorText:  { light: "#FF3B30", dark: "#FF6B6B" },
    bg:         { light: "#FFFFFF", dark: "#1C1C1E" },
  };

  const API_FX = "https://open.er-api.com/v6/latest/USD";
  const CACHE_KEY = "cnh_rates_v1";

  // 刷新间隔：30 分钟
  const refreshAfter = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  // 增加了多种常用货币的图标配置（包含越南盾和伊朗里亚尔）
  const ICON_MAP = {
    CNY: "yensign.circle.fill",
    USD: "dollarsign.circle.fill",
    EUR: "eurosign.circle.fill",
    JPY: "yensign.circle.fill",
    GBP: "sterlingsign.circle.fill",
    CAD: "dollarsign.circle.fill",
    CHF: "francsign.circle.fill",
    HKD: "dollarsign.circle.fill",
    SGD: "dollarsign.circle.fill",
    KRW: "wonsign.circle.fill",
    AUD: "dollarsign.circle.fill",
    NZD: "dollarsign.circle.fill",
    THB: "bahtsign.circle.fill",
    RUB: "rublesign.circle.fill",
    TWD: "dollarsign.circle.fill",
    MOP: "dollarsign.circle.fill",
    MYR: "dollarsign.circle.fill",
    PHP: "pesosign.circle.fill",
    IDR: "rupiahsign.circle.fill",
    INR: "indianrupeesign.circle.fill",
    VND: "dongsign.circle.fill", // 越南盾
    IRR: "banknote.fill"         // 伊朗里亚尔 (使用纸币通用图标作为 fallback)
  };

  // 增加了对应图标颜色的 dark / light 配置
  const ICON_COLOR = {
    CNY: { light: "#D60000", dark: "#FF4444" },
    USD: { light: "#4CAF50", dark: "#66BB6A" },
    EUR: { light: "#1E90FF", dark: "#64B5F6" },
    JPY: { light: "#FF6347", dark: "#FF8A65" },
    GBP: { light: "#8A2BE2", dark: "#BA68C8" },
    CAD: { light: "#DC143C", dark: "#EF5350" },
    CHF: { light: "#708090", dark: "#90A4AE" },
    HKD: { light: "#B22222", dark: "#EF5350" },
    SGD: { light: "#2E8B57", dark: "#66BB6A" },
    KRW: { light: "#4169E1", dark: "#7986CB" },
    AUD: { light: "#008B8B", dark: "#4DB6AC" },
    NZD: { light: "#556B2F", dark: "#AED581" },
    THB: { light: "#FFA500", dark: "#FFCC80" },
    RUB: { light: "#8B0000", dark: "#E57373" },
    TWD: { light: "#4682B4", dark: "#81D4FA" },
    MOP: { light: "#9ACD32", dark: "#DCE775" },
    MYR: { light: "#DAA520", dark: "#FFD54F" },
    PHP: { light: "#0000CD", dark: "#5C6BC0" },
    IDR: { light: "#CD5C5C", dark: "#EF5350" },
    INR: { light: "#FF8C00", dark: "#FFB74D" },
    VND: { light: "#00BCD4", dark: "#4DD0E1" },
    IRR: { light: "#009688", dark: "#4DB6AC" }
  };

  // 增加了对应中文名称映射
  const NAME_CN = {
    CNY: "在岸人民币",
    USD: "美元",
    EUR: "欧元",
    JPY: "日元",
    GBP: "英镑",
    CAD: "加元",
    CHF: "瑞郎",
    HKD: "港币",
    SGD: "新加坡元",
    KRW: "韩元",
    AUD: "澳元",
    NZD: "新西兰元",
    THB: "泰铢",
    RUB: "俄罗斯卢布",
    TWD: "新台币",
    MOP: "澳门元",
    MYR: "马来西亚林吉特",
    PHP: "菲律宾比索",
    IDR: "印尼盾",
    INR: "印度卢比",
    VND: "越南盾",
    IRR: "伊朗里亚尔"
  };

  // 默认显示的货币
  let displayCurrencies = ["CNY", "USD", "EUR", "JPY", "GBP", "CAD", "CHF", "HKD", "SGD", "KRW"];

  // 读取环境变量配置“币种”：允许逗号或空格分割，如 "CNY, USD, AUD, VND, IRR"
  const envStr = ctx.env?.["币种"];
  if (envStr) {
    displayCurrencies = envStr.split(/[,，\s]+/).filter(c => c).map(c => c.toUpperCase());
  }

  // ── 读缓存 ──────────────────────────────────────────────
  let cachedRates = null;
  let hasCacheData = false;
  try {
    const cached = ctx.storage.getJSON(CACHE_KEY);
    if (cached?.rateMap) {
      cachedRates = cached.rateMap;
      hasCacheData = true;
    }
  } catch (_) {}

  // ── 请求 API ────────────────────────────────────────────
  let rateMap = {};
  let fetchError = false;

  try {
    const r = await ctx.http.get(API_FX);
    if (!r || r.status !== 200) throw new Error("请求失败");

    let fx = null;
    try { fx = await r.json(); } catch (_) { throw new Error("JSON解析失败"); }

    if (!fx?.rates) throw new Error("数据结构异常");

    const usdToCnh = fx.rates.CNH;
    if (!usdToCnh) throw new Error("CNH汇率缺失");

    displayCurrencies.forEach((c) => {
      const rate = fx.rates[c];
      if (!rate) {
        rateMap[c] = null;
      } else {
        // 计算"1单位该货币 = 多少CNH"
        rateMap[c] = usdToCnh / rate;
      }
    });

    // 写缓存
    ctx.storage.setJSON(CACHE_KEY, { rateMap });

  } catch (_) {
    fetchError = true;
    // 请求失败时使用缓存
    if (hasCacheData) rateMap = cachedRates;
  }

  // ── 工具函数 ────────────────────────────────────────────
  const format = (v) => (v != null ? Number(v).toFixed(4) : "-");

  const now = new Date();
  const dateStr =
    `${String(now.getMonth() + 1).padStart(2, "0")}-` +
    `${String(now.getDate()).padStart(2, "0")} ` +
    `${String(now.getHours()).padStart(2, "0")}:` +
    `${String(now.getMinutes()).padStart(2, "0")}:` +
    `${String(now.getSeconds()).padStart(2, "0")}`;

  // ── 货币卡片 ────────────────────────────────────────────
  const item = (code) => {
    // 增加 fallback 兜底机制以防填错未知币种
    const iconName = ICON_MAP[code] || "dollarsign.circle.fill";
    const iconColor = ICON_COLOR[code] || { light: "#888888", dark: "#AAAAAA" };
    const displayName = NAME_CN[code] || code;

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
          text: displayName,
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
              src: "sf-symbol:" + iconName,
              width: 22,
              height: 22,
              color: iconColor
            }
          ]
        },
        { type: "spacer", length: 3 },
        {
          type: "text",
          text: rateMap[code] != null ? `¥${format(rateMap[code])}` : "-",
          font: { size: 13, weight: "semibold" },
          textColor: THEME.text
        }
      ]
    };
  };

  // 动态计算分组，适配任何数量的配置币种
  const half = Math.ceil(displayCurrencies.length / 2);
  const row1 = displayCurrencies.slice(0, half);
  const row2 = displayCurrencies.slice(half);

  // ── 渲染 ────────────────────────────────────────────────
  return {
    type: "widget",
    padding: [10, 8, 10, 8],
    gap: 6,
    backgroundColor: THEME.bg,
    refreshAfter,
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
            src: "sf-symbol:globe.asia.australia.fill",
            width: 15,
            height: 15,
            color: THEME.text
          },
          {
            type: "text",
            text: "离岸人民币汇率（CNH）",
            font: { size: 15, weight: "semibold" },
            textColor: THEME.text
          },
          { type: "spacer" },
          // 网络失败时显示错误提示
          ...(fetchError ? [
            {
              type: "text",
              text: hasCacheData ? "已缓存" : "获取失败",
              font: { size: 11 },
              textColor: hasCacheData ? THEME.subtext : THEME.errorText
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

      // 第一行货币
      {
        type: "stack",
        direction: "row",
        justifyContent: "space-between",
        gap: 6,
        children: row1.map(item)
      },

      // 第二行货币 (如果环境变量中只配了一行数量的货币，第二行将会自动隐藏)
      ...(row2.length > 0 ? [{
        type: "stack",
        direction: "row",
        justifyContent: "space-between",
        gap: 6,
        children: row2.map(item)
      }] : [])

    ]
  };
}
