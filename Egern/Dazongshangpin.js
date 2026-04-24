/**
 * 大宗商品行情
 */

export default async function (ctx) {
  const THEME = {
    text: { light: "#000000", dark: "#FFFFFF" }
  };

  const API_OIL_FALLBACK = "https://api.exchangerate.host/latest?base=USD&symbols=BRENT,WTI";
  const API_BINANCE = "https://fapi.binance.com/fapi/v1/ticker/24hr";
  const API_FX = "https://open.er-api.com/v6/latest/USD";
  const YAHOO_API = "https://query1.finance.yahoo.com/v8/finance/chart/";

  const ICON_MAP = {
    GOLD: "circle.fill",
    SILVER: "sparkles",
    BRENT: "flame.fill",
    WTI: "drop.fill"
  };

  const ICON_COLOR = {
    GOLD: "#DAA520",
    SILVER: "#C0C0C0",
    BRENT: "#FF4500",
    WTI: "#555555"
  };

  const NAME_CN = {
    GOLD: "黄金",
    SILVER: "白银",
    BRENT: "布伦特原油",
    WTI: "美国原油"
  };

  const fetchJSON = async (url) => {
    try {
      const r = await ctx.http.get(url);
      return await r.json();
    } catch {
      return null;
    }
  };

  const fetchSQ = async (symbol) => {
    try {
      const url = `https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/${symbol}`;
      const resp = await ctx.http.get(url);
      const json = await resp.json();
      if (!Array.isArray(json) || json.length === 0) return null;
      const p = json[0].spreadProfilePrices?.[0];
      if (!p) return null;
      return (p.bid + p.ask) / 2;
    } catch {
      return null;
    }
  };

  const oilFallback = await fetchJSON(API_OIL_FALLBACK);
  const fx = await fetchJSON(API_FX);

  const fetchBinance = async (symbol) => {
    const d = await fetchJSON(`${API_BINANCE}?symbol=${symbol}`);
    return d ? parseFloat(d.lastPrice) : null;
  };

  const fetchYahooOil = async (symbol) => {
    const d = await fetchJSON(`${YAHOO_API}${symbol}`);
    return d?.chart?.result?.[0]?.meta?.regularMarketPrice || null;
  };

  const getOilFallbackPrice = (key) => oilFallback?.rates?.[key] || null;

  const usd = {
    GOLD:
      await fetchSQ("XAU/USD") ||
      await fetchBinance("XAUUSDT"),

    SILVER:
      await fetchSQ("XAG/USD") ||
      await fetchBinance("XAGUSDT"),

    BRENT:
      await fetchSQ("XBR/USD") ||
      getOilFallbackPrice("BRENT") ||
      await fetchYahooOil("BZ=F"),

    WTI:
      await fetchSQ("XTI/USD") ||
      getOilFallbackPrice("WTI") ||
      await fetchYahooOil("CL=F")
  };

  const rateCNY = fx?.rates?.CNY || 7.0;
  const BARREL_PER_TON = 7.33;

  const toCNY = {
    GOLD:   usd.GOLD   ? (usd.GOLD   * rateCNY) / 31.1034768 : null,
    SILVER: usd.SILVER ? (usd.SILVER * rateCNY) / 31.1034768 : null,
    BRENT:  usd.BRENT  ? usd.BRENT * rateCNY * BARREL_PER_TON : null,
    WTI:    usd.WTI    ? usd.WTI   * rateCNY * BARREL_PER_TON : null
  };

  const format = (v) => (v ? Number(v).toFixed(2) : "-");

  const now = new Date();
  const dateStr =
    `${String(now.getMonth() + 1).padStart(2, "0")}-` +
    `${String(now.getDate()).padStart(2, "0")} ` +
    `${String(now.getHours()).padStart(2, "0")}:` +
    `${String(now.getMinutes()).padStart(2, "0")}:` +
    `${String(now.getSeconds()).padStart(2, "0")}`;

  const item = (name) => ({
    type: "stack",
    direction: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    padding: [4, 0, 4, 0],
    children: [
      {
        type: "text",
        text: NAME_CN[name],
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
            src: "sf-symbol:" + ICON_MAP[name],
            width: 28,
            height: 28,
            color: ICON_COLOR[name]
          }
        ]
      },

      { type: "spacer", length: 4 },

      {
        type: "text",
        text: `$${format(usd[name])}`,
        font: { size: 13, weight: "semibold" },
        textColor: THEME.text
      },

      { type: "spacer", length: 2 },

      {
        type: "text",
        text: `¥${format(toCNY[name])}`,
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
        ]
      },

      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 6,
        children: [
          item("GOLD"),
          item("SILVER"),
          item("BRENT"),
          item("WTI")
        ]
      }
    ]
  };
}
