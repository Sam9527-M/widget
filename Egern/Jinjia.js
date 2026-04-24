/**
 * 黄金（XAU/USD）+ 白银（XAG/USD）+ 原油（Brent + WTI）
 * 黄金/白银：Swissquote（价格）+ Yahoo Finance fallback
 * 涨跌幅：Yahoo Finance
 * 原油价格：Yahoo Finance（BZ=F, CL=F）
 * 汇率：open.er-api.com（USD→CNY）
 * UI：图标精致风 + 自动隐藏涨跌幅
 */

export default async function (ctx) {
  const theme = {
    bg: { light: "#FFFFFF", dark: "#1C1C1E" },
    text: { light: "#000000", dark: "#FFFFFF" },
    textSecondary: { light: "#666666", dark: "#AAAAAA" },
    up: "#4CAF50",
    down: "#FF5252"
  };

  const fetchSQ = async (symbol) => {
    try {
      const resp = await ctx.http.get(
        `https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/${symbol}`
      );
      const json = await resp.json();
      if (!Array.isArray(json) || json.length === 0) return null;
      const p = json[0].spreadProfilePrices[0];
      return (p.bid + p.ask) / 2;
    } catch {
      return null;
    }
  };

  const fetchYahooMeta = async (symbol) => {
    try {
      const resp = await ctx.http.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`
      );
      const json = await resp.json();
      return json.chart.result[0].meta;
    } catch {
      return null;
    }
  };

  const fetchRate = async () => {
    try {
      const resp = await ctx.http.get(
        "https://open.er-api.com/v6/latest/USD"
      );
      const json = await resp.json();
      return json.rates.CNY;
    } catch {
      return null;
    }
  };

  // Yahoo meta（价格 + 涨跌幅）
  const goldMeta   = await fetchYahooMeta("XAUUSD=X");
  const silverMeta = await fetchYahooMeta("XAGUSD=X");
  const brentMeta  = await fetchYahooMeta("BZ=F");
  const wtiMeta    = await fetchYahooMeta("CL=F");

  // ✅ Swissquote 价格 + Yahoo fallback
  const gold   = await fetchSQ("XAU/USD") || goldMeta?.regularMarketPrice || null;
  const silver = await fetchSQ("XAG/USD") || silverMeta?.regularMarketPrice || null;

  // 汇率
  const usdToCny = await fetchRate();

  // ✅ 错误判断改为 === null，避免价格为 0 时误判
  if (gold === null || silver === null || !brentMeta || !wtiMeta || usdToCny === null) {
    return {
      type: "widget",
      padding: 16,
      backgroundColor: theme.bg,
      children: [
        { type: "text", text: "⚠️ 数据加载失败", font: { size: 15 }, textColor: theme.textSecondary }
      ]
    };
  }

  const brent = brentMeta.regularMarketPrice;
  const wti   = wtiMeta.regularMarketPrice;

  const goldCnyPerGram   = (gold   / 31.1034768) * usdToCny;
  const silverCnyPerGram = (silver / 31.1034768) * usdToCny;

  const formatChange = (chg) => {
    if (chg === null || chg === undefined) return null;
    const arrow = chg >= 0 ? "▲" : "▼";
    const color = chg >= 0 ? theme.up : theme.down;
    return { arrow, color, text: `${chg.toFixed(2)}%` };
  };

  const goldChg   = goldMeta   ? formatChange(goldMeta.regularMarketChangePercent)   : null;
  const silverChg = silverMeta ? formatChange(silverMeta.regularMarketChangePercent) : null;
  const brentChg  = brentMeta  ? formatChange(brentMeta.regularMarketChangePercent)  : null;
  const wtiChg    = wtiMeta    ? formatChange(wtiMeta.regularMarketChangePercent)    : null;

  const row = (icon, title, value, changeObj) => {
    const children = [
      { type: "text", text: icon,  font: { size: 16, weight: "semibold" }, textColor: theme.text },
      { type: "text", text: title, font: { size: 15, weight: "semibold" }, textColor: theme.text },
      { type: "spacer" },
      { type: "text", text: value, font: { size: 15, weight: "semibold" }, textColor: theme.text }
    ];

    if (changeObj) {
      children.push(
        { type: "text", text: changeObj.arrow, font: { size: 15, weight: "bold" }, textColor: changeObj.color },
        { type: "text", text: changeObj.text,  font: { size: 14 },                textColor: changeObj.color }
      );
    }

    return {
      type: "stack",
      direction: "row",
      gap: 8,   // ✅ spacing → gap，与其他组件统一
      children
    };
  };

  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const timeStr = `${mm}-${dd} ${hh}:${mi}:${ss}`;

  const topBar = {
    type: "stack",
    direction: "row",
    gap: 2,
    children: [
      {
        type: "text",
        text: "📑 大宗商品行情",
        font: { size: 15, weight: "bold" },
        textColor: theme.text
      },
      { type: "spacer" },
      {
        type: "image",
        src: "sf-symbol:clock.arrow.circlepath",
        width: 11,
        height: 11,
        color: theme.text   // ✅ 修复：原 #000000 暗色模式不可见
      },
      {
        type: "text",
        text: timeStr,
        font: { size: 11, weight: "regular" },
        textColor: theme.text   // ✅ 修复：原 #000000 暗色模式不可见
      }
    ]
  };

  return {
    type: "widget",
    padding: 14,
    backgroundColor: theme.bg,
    refreshAfter: new Date(Date.now() + 60000).toISOString(),  // ✅ 统一为时间戳格式
    children: [
      topBar,

      { type: "spacer", length: 5 },

      row("🟡", "黄金（美元/盎司）", `$${gold.toFixed(2)}`, goldChg),
      { type: "spacer", length: 1 },
      row("🟡", "黄金（人民币/克）", `¥${goldCnyPerGram.toFixed(2)}`, goldChg),

      { type: "spacer", length: 5 },

      row("⚪", "白银（美元/盎司）", `$${silver.toFixed(2)}`, silverChg),
      { type: "spacer", length: 1 },
      row("⚪", "白银（人民币/克）", `¥${silverCnyPerGram.toFixed(2)}`, silverChg),

      { type: "spacer", length: 5 },

      row("🛢️", "布伦特原油（美元/桶）", `$${brent.toFixed(2)}`, brentChg),
      { type: "spacer", length: 1 },
      row("🛢️", "美国原油（美元/桶）",   `$${wti.toFixed(2)}`,   wtiChg)
    ]
  };
}
