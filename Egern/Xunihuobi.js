/**
• 4 列布局（无卡片）+ 图标顶部对齐 + 图标高度统一 + H/L 分行显示 + 图标固定颜色 + 图标上方币种名字
/*使用方法:添加变量环境可修改显示币种
/*变量环境名称：btcType,值：BTC,BNB,ETH,SOL(币种大写字母简写)
*/

export default async function (ctx) {
  const THEME = {
    text: { light: "#000000", dark: "#FFFFFF" },
    up: { light: "#00AA00", dark: "#30D158" },
    down: { light: "#FF0000", dark: "#FF453A" }
  };

  const ICON_COLOR = {
    BTC: "#F7931A", ETH: "#627EEA", BNB: "#F3BA2F", SOL: "#9945FF",
    XRP: "#23292F", ADA: "#0033AD", DOGE: "#C2A633", DOT: "#E6007A",
    POL: "#8247E5", AVAX: "#E84142", LINK: "#2A5ADA", UNI: "#FF007A",
    SHIB: "#F00500", PEPE: "#4CAF50", FLOKI: "#FFCC00", BONK: "#FF9900",
    WIF: "#0099FF", BOME: "#00AA88", TRX: "#C40000", LTC: "#345D9D",
    APT: "#6E6E73"   // ✅ 修复：原 #000000 暗色模式不可见
  };

  const btcType = ctx.env?.btcType || "BTC,ETH,BNB,SOL";
  const API = "https://api.binance.com/api/v3";

  const SYMBOL_MAP = {
    BTC: "BTCUSDT", ETH: "ETHUSDT", BNB: "BNBUSDT", SOL: "SOLUSDT",
    XRP: "XRPUSDT", ADA: "ADAUSDT", DOGE: "DOGEUSDT", DOT: "DOTUSDT",
    POL: "POLUSDT",  // ✅ 修复：MATIC 已改名为 POL
    AVAX: "AVAXUSDT", LINK: "LINKUSDT", UNI: "UNIUSDT",
    SHIB: "SHIBUSDT", PEPE: "PEPEUSDT", FLOKI: "FLOKIUSDT", BONK: "BONKUSDT",
    WIF: "WIFUSDT", BOME: "BOMEUSDT", TRX: "TRXUSDT", LTC: "LTCUSDT",
    APT: "APTUSDT"
  };

  const ICON_MAP = {
    BTC: "bitcoinsign.circle.fill",
    ETH: "atom",
    BNB: "hexagon.fill",
    SOL: "sun.max.fill",
    XRP: "xmark.circle.fill",
    ADA: "circle.grid.3x3.fill",
    DOGE: "pawprint.fill",
    DOT: "circle.hexagonpath.fill",
    POL: "triangle.fill",  // ✅ 修复：MATIC → POL
    AVAX: "flame.fill",
    LINK: "link.circle.fill",
    UNI: "hare.fill",
    SHIB: "tortoise.fill",
    PEPE: "leaf.fill",
    FLOKI: "face.smiling.fill",
    BONK: "bolt.fill",
    WIF: "dog.fill",
    BOME: "book.fill",
    TRX: "tram.fill",
    LTC: "l.circle.fill",
    APT: "a.circle.fill"
  };

  const icon = (systemName, size, tintColor) => ({
    type: "image",
    src: "sf-symbol:" + systemName,
    width: size,
    height: size,
    color: tintColor
  });

  const formatVolume = (v) => {
    if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2).replace(/\.00$/, "") + "B";
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(2).replace(/\.00$/, "") + "M";
    if (v >= 1_000) return (v / 1_000).toFixed(2).replace(/\.00$/, "") + "K";
    return v.toString();
  };

  const parseSymbols = (input) =>
    input.split(",").map((s) => s.trim().toUpperCase()).filter((s) => SYMBOL_MAP[s]).slice(0, 8);

  const formatPrice = (price) => {
    if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2 });
    if (price >= 1) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    if (price >= 0.01) return price.toLocaleString("en-US", { minimumFractionDigits: 4 });
    return price.toLocaleString("en-US", { minimumFractionDigits: 6 });
  };

  const fetchPrices = async () => {
    // ✅ 修复：coins 只解析一次，results.map 直接用 coins[i]
    const coins = parseSymbols(btcType);

    const results = await Promise.all(
      coins.map((coin) =>
        ctx.http.get(`${API}/ticker/24hr?symbol=${SYMBOL_MAP[coin]}`)
          .then((r) => r.json())
          .catch(() => null)
      )
    );

    return results
      .map((d, i) =>
        d
          ? {
              symbol: coins[i],  // ✅ 修复：不再重复调用 parseSymbols
              price: parseFloat(d.lastPrice),
              change: parseFloat(d.priceChangePercent),
              high: parseFloat(d.highPrice),
              low: parseFloat(d.lowPrice),
              volume: parseFloat(d.quoteVolume)
            }
          : null
      )
      .filter(Boolean);
  };

  const dataSource = await fetchPrices();

  const now = new Date();
  const dateStr =
    `${String(now.getMonth() + 1).padStart(2, "0")}-` +
    `${String(now.getDate()).padStart(2, "0")} ` +
    `${String(now.getHours()).padStart(2, "0")}:` +
    `${String(now.getMinutes()).padStart(2, "0")}:` +
    `${String(now.getSeconds()).padStart(2, "0")}`;

  const item = (coin) => {
    const isUp = coin.change >= 0;
    const color = isUp ? THEME.up : THEME.down;

    return {
      type: "stack",
      direction: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      padding: [4, 0, 4, 0],
      children: [
        {
          type: "text",
          text: coin.symbol,
          font: { size: 12, weight: "semibold" },
          textColor: THEME.text
        },

        { type: "spacer", length: 2 },

        {
          type: "stack",
          alignItems: "center",
          justifyContent: "flex-start",
          height: 40,
          children: [icon(ICON_MAP[coin.symbol], 28, ICON_COLOR[coin.symbol])]
        },

        { type: "spacer", length: 4 },

        {
          type: "text",
          text: `$${formatPrice(coin.price)}`,
          font: { size: 13, weight: "semibold" },
          textColor: THEME.text
        },

        {
          type: "text",
          text: `${isUp ? "+" : ""}${coin.change.toFixed(2)}%`,
          font: { size: 12, weight: "semibold" },
          textColor: color
        },

        {
          type: "text",
          text: `H: ${formatPrice(coin.high)}`,
          font: { size: 11 },
          textColor: THEME.text
        },
        {
          type: "text",
          text: `L: ${formatPrice(coin.low)}`,
          font: { size: 11 },
          textColor: THEME.text
        },

        {
          type: "text",
          text: `Vol: ${formatVolume(coin.volume)}`,
          font: { size: 11, weight: "semibold" },
          textColor: "#F7931A"
        }
      ]
    };
  };

  const build4Grid = (items) => {
    const rows = [];
    for (let i = 0; i < items.length; i += 4) {
      rows.push({
        type: "stack",
        direction: "row",
        justifyContent: "space-between",
        gap: 6,
        padding: [6, 0, 6, 0],
        children: [
          { type: "stack", flex: 1, children: [item(items[i])] },
          // ✅ 修复：空位改为 { type: "stack", flex: 1 }，spacer 不支持 flex
          items[i + 1] ? { type: "stack", flex: 1, children: [item(items[i + 1])] } : { type: "stack", flex: 1 },
          items[i + 2] ? { type: "stack", flex: 1, children: [item(items[i + 2])] } : { type: "stack", flex: 1 },
          items[i + 3] ? { type: "stack", flex: 1, children: [item(items[i + 3])] } : { type: "stack", flex: 1 }
        ]
      });
    }
    return rows;
  };

  return {
    type: "widget",
    padding: [10, 8, 10, 8],
    gap: 5,
    children: [
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 4,
        padding: [0, 4, 0, 4],
        children: [
          {
            type: "image",
            src: "sf-symbol:bitcoinsign.circle.fill",
            width: 15,
            height: 15,
            color: THEME.text
          },
          {
            type: "text",
            text: "虚拟货币行情",
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
            font: { size: 12 },
            textColor: THEME.text
          }
        ]
      },

      ...build4Grid(dataSource)
    ]
  };
}
