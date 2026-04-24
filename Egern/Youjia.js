/**
 * ⛽ 全国实时油价小组件
 * 数据源：http://m.qiyoujiage.com/
 * 
 * 📚 使用教程
 * ═══════════════════════════════════════════════════
 *
 * 1️⃣ 环境变量配置
 * ─────────────────────────────────────────────────
 * 在 Egern 小组件配置中添加：
 *
 * 名称：region
 * 值：省份/城市（拼音，用 / 分隔）
 *
 * 名称：SHOW_TREND
 * 值：true（显示调价趋势）或 false（不显示）
 *
 *
 * 2️⃣ 地区代码对照表
 * ─────────────────────────────────────────────────
 * 【直辖市】
 * • 北京：beijing  • 上海：shanghai
 * • 天津：tianjin  • 重庆：chongqing
 *
 * 【省份 - 省会城市】
 * • 广东：guangdong/guangzhou
 * • 江苏：jiangsu/nanjing
 * • 浙江：zhejiang/hangzhou
 * • 山东：shandong/jinan
 * • 河南：henan/zhengzhou
 * • 河北：hebei/shijiazhuang
 * • 四川：sichuan/chengdu
 * • 湖北：hubei/wuhan
 * • 湖南：hunan/changsha
 * • 安徽：anhui/hefei
 * • 福建：fujian/fuzhou
 * • 江西：jiangxi/nanchang
 * • 辽宁：liaoning/shenyang
 * • 陕西：shanxi-3/xian  ⚠️
 * • 海南：hainan/haikou
 * • 山西：shanxi-1/taiyuan  ⚠️
 * • 吉林：jilin/changchun
 * • 黑龙江：heilongjiang/haerbin
 * • 云南：yunnan/kunming
 * • 贵州：guizhou/guiyang
 * • 广西：guangxi/nanning
 * • 甘肃：gansu/lanzhou
 * • 青海：qinghai/xining
 * • 宁夏：ningxia/yinchuan
 * • 新疆：xinjiang/wulumuqi
 * • 西藏：xizang/lasa
 * • 内蒙古：neimenggu/huhehaote
 * • 也可以去 http://m.qiyoujiage.com/shanxi-3.shtml 查看自己省份拼音
 * ═══════════════════════════════════════════════════
 */

export default async function (ctx) {
  const regionParam = ctx.env.region || "guangxi/nanning";
  const SHOW_TREND = (ctx.env.SHOW_TREND || "true").trim() !== "false";

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const timeStr = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  const refreshTime = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

  // --- 调价日历配置区 ---
  // 本地日历兜底
  const LOCAL_CALENDAR = {
    2026: [
      "01-06","01-20","02-03","02-24","03-09","03-23",
      "04-07","04-21","05-08","05-21","06-04","06-18",
      "07-03","07-17","07-31","08-14","08-28","09-11",
      "09-24","10-15","10-29","11-12","11-26","12-10","12-24"
    ]
  };

  // 远程 JSON 地址
  const CALENDAR_URLS = (ctx.env.CALENDAR_URLS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  // 加载远程 JSON 并合并
  async function loadRemoteCalendar() {
    for (const url of CALENDAR_URLS) {
      try {
        const resp = await ctx.http.get(url, { timeout: 15000 });
        if (resp.status !== 200) continue;

        const text = await resp.text();
        let data = null;
        try { data = JSON.parse(text); } catch (_) { continue; }

        if (data && typeof data === "object" && !Array.isArray(data)) {
          for (const year of Object.keys(data)) {
            if (Array.isArray(data[year])) {
              LOCAL_CALENDAR[year] = data[year];
            }
          }
        }
      } catch (_) {}
    }
  }

  await loadRemoteCalendar();

  // 从日历获取下次调价日
  function getNextAdjustDateFromCalendar() {
    const yearKey = String(now.getFullYear());
    const list = LOCAL_CALENDAR[yearKey] || [];
    for (const d of list) {
      const target = new Date(`${yearKey}-${d}T23:59:59`);
      if (target > now) return target;
    }
    return null;
  }
  // ------------------------

  const COLORS = {
    primary:    { light: "#1A1A1A",  dark: "#FFFFFF"  },
    secondary:  { light: "#666666",  dark: "#CCCCCC"  },
    tertiary:   { light: "#999999",  dark: "#888888"  },
    card:       { light: "#F5F5F7",  dark: "#2C2C2E"  },
    cardBorder: { light: "#E0E0E0",  dark: "#3A3A3C"  },
    header:     { light: "#1A1A1A",  dark: "#FFFFFF"  },
    clock:      { light: "#1A1A1A",  dark: "#FFFFFF"  },
    label:      { light: "#1A1A1A",  dark: "#FFFFFF"  },
    nextDate:   { light: "#FF9500",  dark: "#FFB340"  },
    error:      { light: "#FF3B30",  dark: "#FF6B6B"  },
    p92:        { light: "#FF9F0A",  dark: "#FFB347"  },
    p95:        { light: "#FF6B35",  dark: "#FF8A5C"  },
    p98:        { light: "#FF3B30",  dark: "#FF6B6B"  },
    diesel:     { light: "#30D158",  dark: "#5CD67D"  },
    trendUp:    { light: "#FF3B30",  dark: "#FF6B6B"  },
    trendDown:  { light: "#30D158",  dark: "#5CD67D"  },
    trendFlat:  { light: "#666666",  dark: "#CCCCCC"  },
  };

  const CACHE_KEY = `oil_price_${regionParam}`;
  let prices = { p92: null, p95: null, p98: null, diesel: null };
  let regionName = "";
  let trendInfo = "";
  let nextAdjustDate = null;
  let hasCache = false;

  // 读取缓存，包括调价日期时间戳
  try {
    const cached = ctx.storage.getJSON(CACHE_KEY);
    if (cached) {
      prices = cached.prices || prices;
      regionName = cached.regionName || "";
      trendInfo = cached.trendInfo || "";
      if (cached.nextAdjustDateTimestamp) {
        nextAdjustDate = new Date(cached.nextAdjustDateTimestamp);
      }
      hasCache = true;
    }
  } catch (_) {}

  let fetchError = false;

  // 网页抓取与解析逻辑
  try {
    const queryAddr = `http://m.qiyoujiage.com/${regionParam}.shtml`;
    
    const resp = await ctx.http.get(queryAddr, {
      headers: {
        'referer': 'http://m.qiyoujiage.com/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      timeout: 15000
    });
    
    if (resp.status !== 200) throw new Error("页面不存在");
    
    const html = await resp.text();

    // 1. 从网页标题解析地区名
    const titleMatch = html.match(/<title>([^_]+)_/);
    if (titleMatch && titleMatch[1]) {
      let rawName = titleMatch[1].trim();
      regionName = rawName.replace(/(油价|实时|今日|最新|查询|价格)/g, '').trim();
    }

    // 2. 解析油价
    const regPrice = /<dl>[\s\S]+?<dt>(.*油)<\/dt>[\s\S]+?<dd>(.*)\(元\)<\/dd>/gm;
    const priceList = [];
    let m = null;
    
    while ((m = regPrice.exec(html)) !== null) {
      if (m.index === regPrice.lastIndex) regPrice.lastIndex++;
      priceList.push({ name: m[1].trim(), value: m[2].trim() });
    }

    if (priceList.length > 0) {
      const nameMap = { 
        "92 号": "p92", "92": "p92",
        "95 号": "p95", "95": "p95",
        "98 号": "p98", "98": "p98",
        "0 号": "diesel", "柴油": "diesel"
      };
      
      prices = {p92:null, p95:null, p98:null, diesel:null};
      
      priceList.forEach(item => {
        const key = Object.keys(nameMap).find(k => item.name.includes(k));
        if (key) {
          const priceVal = parseFloat(item.value);
          if (!isNaN(priceVal)) prices[nameMap[key]] = priceVal;
        }
      });
    } else {
      throw new Error("价格解析失败");
    }

    // 3. 解析调价趋势与日期
    const regTrend = /<div class="tishi">[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<br\/>([\s\S]+?)<br\/>/;
    const trendMatch = html.match(regTrend);
    
    // 优先级 1 & 2：尝试使用日历（远程+本地）获取调价日期
    nextAdjustDate = getNextAdjustDateFromCalendar();

    if (trendMatch && trendMatch.length >= 3) {
      // 优先级 3：如果日历里没匹配到未来的日期，尝试从网页提取
      if (!nextAdjustDate) {
        const dateStrMatch = trendMatch[1].match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (dateStrMatch) {
           nextAdjustDate = new Date(`${dateStrMatch[1]}-${dateStrMatch[2].padStart(2, '0')}-${dateStrMatch[3].padStart(2, '0')}T23:59:59`);
        }
      }

      // 提取趋势
      if (SHOW_TREND) {
        const valuePart = trendMatch[2];
        if (valuePart.includes("不作调整") || valuePart.includes("不做调整") || valuePart.includes("搁浅")) {
          trendInfo = "不作调整";
        } else {
          const trend = (valuePart.includes('下调') || valuePart.includes('下跌')) ? '↓' : '↑';
          let amount = "";
          
          const allPrices = valuePart.match(/([\d\.]+)\s*元\/升/g);
          if (allPrices && allPrices.length >= 2) {
            const nums = allPrices.map(p => p.match(/([\d\.]+)/)[1]);
            amount = `${nums[0]}-${nums[nums.length - 1]}`;
          } else {
            const allTons = valuePart.match(/([\d]+)\s*元(?:\/吨)?/g);
            if (allTons && allTons.length >= 2) {
              const nums = allTons.map(p => p.match(/([\d]+)/)[1]);
              amount = `${nums[0]}-${nums[nums.length - 1]}`;
            } else {
              const singleMatch = valuePart.match(/([\d\.]+)\s*元\/升/);
              if (singleMatch) {
                amount = singleMatch[1];
              }
            }
          }
          trendInfo = amount ? `${trend} ${amount}` : trend;
        }
      }
    }

    ctx.storage.setJSON(CACHE_KEY, { 
      prices, 
      regionName, 
      trendInfo,
      nextAdjustDateTimestamp: nextAdjustDate ? nextAdjustDate.getTime() : null 
    });

  } catch (e) {
    if (!hasCache) fetchError = true;
  }

  // 兜底：如果所有方法都获取不到未来日期，提供一个未来的安全期
  if (!nextAdjustDate) {
    nextAdjustDate = new Date(now.getTime() + 10 * 24 * 3600 * 1000);
  }

  // 生效点 = 当天24点
  const displayAdjustDate = nextAdjustDate;

  // UI 显示次日 0 点
  const uiDate = new Date(displayAdjustDate.getTime());
  uiDate.setDate(uiDate.getDate() + 1);

  const nextAdjustText =
    `${String(uiDate.getMonth()+1).padStart(2,"0")}-${String(uiDate.getDate()).padStart(2,"0")}`;

  function calcCountdown(target) {
    const diff = target - now;
    if (diff <= 0) return "今日已调";

    const days = Math.floor(diff / (24 * 3600 * 1000));
    const hours = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));

    return `${days}天${hours}小时`;
  }

  const countdownText = calcCountdown(displayAdjustDate);

  function getTrendColor(info) {
    if (!info) return COLORS.trendFlat;
    if (info.trim().startsWith("↑")) return COLORS.trendUp;
    if (info.trim().startsWith("↓")) return COLORS.trendDown;
    return COLORS.trendFlat;
  }

  const rows = [
    { label: "92 号", price: prices.p92,    color: COLORS.p92    },
    { label: "95 号", price: prices.p95,    color: COLORS.p95    },
    { label: "98 号", price: prices.p98,    color: COLORS.p98    },
    { label: "0 号",  price: prices.diesel, color: COLORS.diesel }
  ].filter(r => r.price !== null);

  function priceCard(row) {
    return {
      type: "stack",
      direction: "column",
      alignItems: "center",
      flex: 1,
      padding: [8, 4, 8, 4],
      backgroundColor: COLORS.card,
      borderRadius: 12,
      borderWidth: 0.5,
      borderColor: COLORS.cardBorder,
      children: [
        {
          type: "stack",
          direction: "row",
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          height: 22,
          backgroundColor: {
            light: row.color.light + "28",
            dark:  row.color.dark  + "28"
          },
          borderRadius: 6,
          children: [
            {
              type: "text",
              text: row.label,
              font: { size: "caption2", weight: "bold" },
              textColor: row.color
            }
          ]
        },
        {
          type: "text",
          text: row.price.toFixed(2),
          font: { size: "title3", weight: "semibold" },
          textColor: COLORS.primary
        }
      ]
    };
  }

  return {
    type: "widget",
    padding: [10, 8, 10, 8],
    backgroundColor: { light: "#FFFFFF", dark: "#1C1C1E" },
    refreshAfter: refreshTime,
    children: [

      // 顶部标题栏
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 4,
        padding: [0, 4, 0, 4],
        children: [
          {
            type: "image",
            src: "sf-symbol:fuelpump.circle.fill",
            width: 15,
            height: 15,
            color: COLORS.header
          },
          {
            type: "text",
            text: `${regionName || "查询中"}今日油价`,
            font: { size: 15, weight: "heavy" },
            textColor: COLORS.header
          },
          { type: "spacer" },
          {
            type: "stack",
            direction: "row",
            alignItems: "center",
            children: [
              {
                type: "image",
                src: "sf-symbol:clock.arrow.circlepath",
                width: 11,
                height: 11,
                color: COLORS.clock
              },
              {
                type: "text",
                text: ` ${dateStr} ${timeStr}`,
                font: { size: "caption2", weight: "bold" },
                textColor: COLORS.header
              }
            ]
          },
          ...(fetchError ? [{
            type: "text",
            text: "数据获取失败",
            font: { size: "caption2" },
            textColor: COLORS.error
          }] : [])
        ]
      },

      // 中间油价卡片区
      rows.length > 0
        ? {
            type: "stack",
            direction: "row",
            justifyContent: "space-between",
            gap: 6,
            padding: [6, 0, 6, 0],
            children: rows.map(priceCard)
          }
        : {
            type: "stack",
            direction: "column",
            alignItems: "center",
            padding: [20, 10, 20, 10],
            children: [
              {
                type: "image",
                src: "sf-symbol:exclamationmark.triangle.fill",
                width: 24,
                height: 24,
                color: COLORS.error
              },
              {
                type: "text",
                text: fetchError ? "数据获取失败" : "暂无数据",
                font: { size: "body" },
                textColor: COLORS.secondary
              }
            ]
          },

      // 底部调价信息栏
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        padding: [0, 4, 0, 4],
        children: [
          {
            type: "text",
            text: "下轮调价：",
            font: { size: "caption2", weight: "bold" },
            textColor: COLORS.label
          },
          {
            type: "text",
            text: `${nextAdjustText}（${countdownText}）`,
            font: { size: "caption2", weight: "bold" },
            textColor: COLORS.nextDate
          },
          { type: "spacer" },

          ...(SHOW_TREND && trendInfo ? [{
            type: "stack",
            direction: "row",
            alignItems: "center",
            children: [
              {
                type: "text",
                text: "预估：",
                font: { size: "caption2", weight: "bold" },
                textColor: COLORS.label
              },
              {
                type: "text",
                text: trendInfo === "不作调整"
                  ? "不作调整"
                  : `${trendInfo} 元/升`,
                font: { size: "caption2", weight: "bold" },
                textColor: trendInfo === "不作调整"
                  ? COLORS.trendFlat
                  : getTrendColor(trendInfo)
              }
            ]
          }] : [])
        ]
      }
    ]
  };
}

