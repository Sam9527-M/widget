/**
 * 全国城市油价（远程省份映射 + 远程调价日历）
 * 使用说明：本脚本需要申请API-KEY，在https://www.mxnzp.com?ic=SR8XUR申请（每天1000次，免费）
 *
 * 变量环境配置
 * 名称：APP_ID        值：你的APP_ID
 * 名称：APP_SECRET    值：你的APP_SECRET
 * 名称：CITY          值：省份或城市（汉字）
 * 名称：CITY_MAP_URLS 值：你的远程json链接（可补全城市映射）[可选]
 * 名称：CALENDAR_URLS 值：你的远程json链接（维护油价调整日期）[可选]
 */

export default async function (ctx) {
  const THEME = {
    text: { light: "#000000", dark: "#FFFFFF" }
  };

  // ⭐ 用户设置城市（支持去"市/省"后缀，如"北京市"→"北京"）
  const RAW_CITY = (ctx.env.CITY || "南宁").replace(/[市省]$/, "");
  const CITY = RAW_CITY;

  // ⭐ 远程省份映射 URL
  const REMOTE_PROVINCE_URL =
    ctx.env.CITY_MAP_URLS || "https://你的域名/province_city_map.json";

  let REMOTE_PROVINCE_MAP = null;
  try {
    const res = await ctx.http.get(REMOTE_PROVINCE_URL);
    REMOTE_PROVINCE_MAP = await res.json();
  } catch (e) {
    console.log("远程省份映射加载失败，使用本地映射");
  }

  // ⭐ 本地 fallback
  const LOCAL_PROVINCE_MAP = {
    "北京": ["北京"], "上海": ["上海"], "天津": ["天津"], "重庆": ["重庆"],
    "广东": ["广州","深圳","佛山","东莞","珠海","中山","惠州","汕头","湛江","肇庆","江门","茂名","阳江","清远","潮州","揭阳","梅州","韶关","汕尾"],
    "广西": ["南宁","柳州","桂林","梧州","北海","防城港","钦州","贵港","玉林","百色","河池","来宾","崇左","贺州"],
    "浙江": ["杭州","宁波","温州","嘉兴","湖州","绍兴","金华","衢州","舟山","台州","丽水"],
    "四川": ["成都","绵阳","德阳","自贡","攀枝花","泸州","广元","遂宁","内江","乐山","南充","眉山","宜宾","广安","达州","雅安","巴中","资阳"],
    "湖北": ["武汉","宜昌","襄阳","黄石","荆州","荆门","十堰","鄂州","孝感","黄冈","咸宁","随州"],
    "湖南": ["长沙","株洲","湘潭","衡阳","邵阳","岳阳","常德","张家界","益阳","郴州","永州","怀化","娄底"],
    "云南": ["昆明","大理","曲靖","玉溪","昭通","保山","丽江","普洱","临沧","红河","文山","西双版纳","楚雄","德宏","怒江","迪庆"],
    "新疆": ["乌鲁木齐","喀什","克拉玛依","伊宁","库尔勒","哈密","吐鲁番","阿克苏","和田"],
    "西藏": ["拉萨","日喀则","林芝","昌都","山南","那曲","阿里"],
    "河北": ["石家庄","唐山","秦皇岛","邯郸","邢台","保定","张家口","承德","沧州","廊坊","衡水"],
    "河南": ["郑州","洛阳","开封","南阳","新乡","安阳","焦作","许昌","平顶山","商丘","周口","驻马店","信阳","鹤壁","濮阳","三门峡","济源"],
    "山东": ["济南","青岛","烟台","潍坊","临沂","淄博","济宁","泰安","威海","日照","德州","聊城","滨州","菏泽"],
    "江苏": ["南京","苏州","无锡","常州","扬州","镇江","南通","泰州","盐城","淮安","连云港","宿迁"],
    "安徽": ["合肥","芜湖","蚌埠","淮南","马鞍山","淮北","铜陵","安庆","黄山","滁州","阜阳","宿州","六安","亳州","池州","宣城"],
    "福建": ["福州","厦门","泉州","漳州","莆田","三明","南平","龙岩","宁德"],
    "江西": ["南昌","九江","景德镇","萍乡","新余","鹰潭","赣州","吉安","宜春","抚州","上饶"],
    "山西": ["太原","大同","阳泉","长治","晋城","朔州","晋中","运城","忻州","临汾","吕梁"],
    "陕西": ["西安","咸阳","宝鸡","铜川","渭南","延安","汉中","榆林","安康","商洛"],
    "甘肃": ["兰州","嘉峪关","金昌","白银","天水","武威","张掖","平凉","酒泉","庆阳","定西","陇南"],
    "青海": ["西宁","海东","海北","黄南","海南","果洛","玉树","海西"],
    "贵州": ["贵阳","遵义","安顺","毕节","铜仁","六盘水"],
    "海南": ["海口","三亚","三沙","儋州"],
    "辽宁": ["沈阳","大连","鞍山","抚顺","本溪","丹东","锦州","营口","阜新","辽阳","盘锦","铁岭","朝阳","葫芦岛"],
    "吉林": ["长春","吉林","四平","辽源","通化","白山","松原","白城","延边"],
    "黑龙江": ["哈尔滨","齐齐哈尔","牡丹江","佳木斯","大庆","鸡西","鹤岗","双鸭山","伊春","七台河","黑河","绥化","大兴安岭"],
    "内蒙古": ["呼和浩特","包头","乌海","赤峰","通辽","鄂尔多斯","呼伦贝尔","巴彦淖尔","乌兰察布","兴安盟","锡林郭勒盟","阿拉善盟"]
  };

  const PROVINCE_CITY_MAP = REMOTE_PROVINCE_MAP || LOCAL_PROVINCE_MAP;

  // ⭐ 自动生成 城市→省份 映射（同样去后缀兼容）
  const CITY_TO_PROVINCE = {};
  for (const [prov, cities] of Object.entries(PROVINCE_CITY_MAP)) {
    cities.forEach(c => {
      CITY_TO_PROVINCE[c] = prov;
      CITY_TO_PROVINCE[c.replace(/[市省]$/, "")] = prov;
    });
  }

  // ⭐ 自动识别省份
  const PROVINCE = CITY_TO_PROVINCE[CITY] || CITY;
  // ⭐ 缓存相关常量（7天 = 604800000ms）
  const CACHE_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;
  const CACHE_KEY = `oil_cache_${PROVINCE}`;

  // ⭐ 全局时间（统一使用，避免跨逻辑时间偏差）
  const now = new Date();
  const year = now.getFullYear();
  const todayStr =
    `${String(now.getMonth() + 1).padStart(2, "0")}-` +
    `${String(now.getDate()).padStart(2, "0")}`;

  // ⭐ 远程调价日历
  const REMOTE_CALENDAR_URL =
    ctx.env.CALENDAR_URLS || "https://你的域名/adjust_calendar.json";

  let REMOTE_CALENDAR = null;
  try {
    const res = await ctx.http.get(REMOTE_CALENDAR_URL);
    REMOTE_CALENDAR = await res.json();
  } catch (e) {
    console.log("远程调价日历加载失败，使用本地日历");
  }

  const LOCAL_CALENDAR = {
    2026: [
      "01-06","01-20","02-03","02-24","03-09","03-23",
      "04-07","04-21","05-08","05-21","06-04","06-18",
      "07-03","07-17","07-31","08-14","08-28","09-11",
      "09-24","10-15","10-29","11-12","11-26","12-10","12-24"
    ]
  };

  const ADJUST_CALENDAR = REMOTE_CALENDAR || LOCAL_CALENDAR;

  // ⭐ 兼容字符串/数字年份取日历
  function getCalendarForYear(y) {
    const yStr = String(y);
    if (ADJUST_CALENDAR[yStr]) return ADJUST_CALENDAR[yStr];
    if (ADJUST_CALENDAR[y]) return ADJUST_CALENDAR[y];
    const years = Object.keys(ADJUST_CALENDAR).map(Number).sort();
    const last = years[years.length - 1];
    return ADJUST_CALENDAR[String(last)] || ADJUST_CALENDAR[last] || [];
  }

  const calendar = getCalendarForYear(year);

  // ⭐ 判断今天是否是调价日（用于强制刷新缓存）
  const isTodayAdjustDay = calendar.includes(todayStr);

  // ⭐ 读取缓存
  const cache = await ctx.storage.get(CACHE_KEY);
  const nowTime = Date.now();

  let oil = null;

  // ⭐ 缓存有效条件：未过期 且 今天不是调价日
  const cacheValid =
    cache &&
    nowTime - cache.time < CACHE_EXPIRE_MS &&
    !isTodayAdjustDay;

  if (cacheValid) {
    oil = cache.data;
  } else {
    const APP_ID = ctx.env.APP_ID || "APP_ID";
    const APP_SECRET = ctx.env.APP_SECRET || "APP_SECRET";

    const API = `https://www.mxnzp.com/api/oil/search?province=${encodeURIComponent(
      PROVINCE
    )}&app_id=${APP_ID}&app_secret=${APP_SECRET}`;

    try {
      const r = await ctx.http.get(API);
      const json = await r.json();

      if (json?.code === 1) {
        oil = json.data;
        await ctx.storage.set(CACHE_KEY, { time: nowTime, data: oil });
      } else if (cache) {
        oil = cache.data;
      }
    } catch (e) {
      if (cache) oil = cache.data;
    }
  }

  // ⭐ 省份拼音映射（用于网页抓取）
  const PROVINCE_PINYIN = {
    "北京": "beijing","上海": "shanghai","天津": "tianjin","重庆": "chongqing",
    "广东": "guangdong","广西": "guangxi","江苏": "jiangsu","浙江": "zhejiang",
    "山东": "shandong","河南": "henan","河北": "hebei","四川": "sichuan",
    "湖北": "hubei","湖南": "hunan","安徽": "anhui","福建": "fujian",
    "江西": "jiangxi","辽宁": "liaoning","陕西": "shanxi-3","山西": "shanxi-1",
    "吉林": "jilin","黑龙江": "heilongjiang","云南": "yunnan","贵州": "guizhou",
    "甘肃": "gansu","青海": "qinghai","宁夏": "ningxia","新疆": "xinjiang",
    "西藏": "xizang","内蒙古": "neimenggu","海南": "hainan"
  };

  const PROVINCE_CODE = PROVINCE_PINYIN[PROVINCE] || PROVINCE;

  // ⭐ 抓取网页 HTML（保留 http，该站不支持 https）
  async function fetchWebPage(code) {
    const url = `http://m.qiyoujiage.com/${code}.shtml`;
    try {
      const resp = await ctx.http.get(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
          "referer": "http://m.qiyoujiage.com/"
        },
        timeout: 15000
      });
      if (resp.status === 200) return resp.text();
    } catch (e) {
      console.log("网页抓取失败:", e);
    }
    return null;
  }

  // ⭐ 网页数据统一解析（提取自您的老脚本）
  function parseWebData(html) {
    if (!html) return { prices: null, date: null, trend: null };

    let parsedPrices = null;
    let nextAdjustDate = null;
    let trendInfo = null;

    // 1. 解析油价
    const regPrice = /<dl>[\s\S]+?<dt>(.*油)<\/dt>[\s\S]+?<dd>(.*)\(元\)<\/dd>/gm;
    const priceList = [];
    let m = null;
    while ((m = regPrice.exec(html)) !== null) {
      if (m.index === regPrice.lastIndex) regPrice.lastIndex++;
      priceList.push({ name: m[1].trim(), value: m[2].trim() });
    }
    if (priceList.length > 0) {
      const nameMap = { "92 号": "t92", "92": "t92", "95 号": "t95", "95": "t95", "98 号": "t98", "98": "t98", "0 号": "t0", "柴油": "t0" };
      let tempPrices = {};
      priceList.forEach(item => {
        const key = Object.keys(nameMap).find(k => item.name.includes(k));
        if (key) {
          const priceVal = parseFloat(item.value);
          if (!isNaN(priceVal)) tempPrices[nameMap[key]] = priceVal;
        }
      });
      if (Object.keys(tempPrices).length > 0) parsedPrices = tempPrices;
    }

    // 2. 解析调价趋势与日期
    const regTrend = /<div class="tishi">[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<br\/>([\s\S]+?)<br\/>/;
    const trendMatch = html.match(regTrend);

    if (trendMatch && trendMatch.length >= 3) {
      // 提取日期
      const dateStrMatch = trendMatch[1].match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      if (dateStrMatch) {
        // 设置到当天24点，对齐倒计时逻辑
        nextAdjustDate = new Date(Number(dateStrMatch[1]), Number(dateStrMatch[2]) - 1, Number(dateStrMatch[3]), 24, 0, 0);
      }

      // 提取趋势
      const valuePart = trendMatch[2];
      if (valuePart.includes("不作调整") || valuePart.includes("不做调整") || valuePart.includes("搁浅")) {
        trendInfo = { text: "不作调整", color: "#888888" };
      } else {
        const trend = (valuePart.includes('下调') || valuePart.includes('下跌')) ? '↓' : '↑';
        const color = trend === '↓' ? "#34C759" : "#FF3B30";
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
        trendInfo = { text: amount ? `${trend} ${amount} 元/升` : `${trend} 元/升`, color };
      }
    }

    return { prices: parsedPrices, date: nextAdjustDate, trend: trendInfo };
  }

  // ⭐ 本地/远程日历兜底（修复跨年）
  function getNextAdjustDate() {
    const today = new Date();

    for (const md of calendar) {
      const [m, d] = md.split("-").map(Number);
      const adjust = new Date(year, m - 1, d, 24, 0, 0);
      if (adjust > today) return adjust;
    }

    // 当年全部已过，查次年日历
    const nextYearCalendar = getCalendarForYear(year + 1);
    if (nextYearCalendar && nextYearCalendar.length > 0) {
      const [m, d] = nextYearCalendar[0].split("-").map(Number);
      return new Date(year + 1, m - 1, d, 24, 0, 0);
    }

    // 终极兜底
    const [m, d] = calendar[0].split("-").map(Number);
    return new Date(year + 1, m - 1, d, 24, 0, 0);
  }

  // ⭐ 获取网页数据进行解析
  const html = await fetchWebPage(PROVINCE_CODE);
  const webData = parseWebData(html);

  // ⭐ 油价数据兜底：若 API 无数据，则尝试使用解析好的网页油价数据
  if (!oil || (!oil.t92 && !oil.t95)) {
    if (webData.prices) {
      oil = webData.prices;
    }
  }

  const nextAdjustWeb = webData.date;
  const trendInfo = webData.trend;

  // ⭐ 最终调价日期（网页优先，日历兜底，保留原有顺序）
  const nextAdjust = nextAdjustWeb || getNextAdjustDate();

  // ⭐ 倒计时计算
  const uiDate = new Date(nextAdjust.getTime());
  const uiDateStr = `${uiDate.getMonth() + 1}月${uiDate.getDate()}日`;

  const diff = nextAdjust - now;
  const leftDays = Math.floor(diff / (1000 * 60 * 60 * 24));
  const leftHours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const countdownStr = `${leftDays}天${leftHours}小时`;

  // ⭐ 顶部时间字符串
  const dateStr =
    `${now.getFullYear()}-` +
    `${String(now.getMonth() + 1).padStart(2, "0")}-` +
    `${String(now.getDate()).padStart(2, "0")} ` +
    `${String(now.getHours()).padStart(2, "0")}:` +
    `${String(now.getMinutes()).padStart(2, "0")}`;

  // ⭐ 四种油价
  const PRICE = {
    "92": oil?.t92 ? Number(oil.t92) : null,
    "95": oil?.t95 ? Number(oil.t95) : null,
    "98": oil?.t98 ? Number(oil.t98) : null,
    "0":  oil?.t0  ? Number(oil.t0)  : null
  };

  const ICON_MAP   = { "92": "fuelpump.fill", "95": "fuelpump.fill", "98": "fuelpump.fill", "0": "fuelpump.fill" };
  const ICON_COLOR = { "92": "#FFD60A", "95": "#FF9500", "98": "#FF3B30", "0": "#34C759" };
  const NAME_CN    = { "92": "92号汽油", "95": "95号汽油", "98": "98号汽油", "0": "0号柴油" };

  const format = (v) => (v !== null && v !== undefined ? Number(v).toFixed(2) : "-");

  // ⭐ 底部调价信息行
  const adjustUI = {
    type: "stack",
    direction: "row",
    alignItems: "center",
    padding: [4, 0, 0, 2],
    children: [
      { type: "text", text: "下轮调价：", font: { size: 12, weight: "bold" }, textColor: THEME.text },
      { type: "text", text: `${uiDateStr}（${countdownStr}）`, font: { size: 12, weight: "bold" }, textColor: "#FF9500" },
      { type: "spacer" },
      ...(trendInfo
        ? [
            { type: "text", text: "预估：", font: { size: 12, weight: "bold" }, textColor: THEME.text },
            { type: "text", text: trendInfo.text, font: { size: 12, weight: "bold" }, textColor: trendInfo.color }
          ]
        : [])
    ]
  };

  // ⭐ 单个油价卡片
  const item = (key) => ({
    type: "stack",
    direction: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    padding: [4, 0, 4, 0],
    children: [
      { type: "text", text: NAME_CN[key], font: { size: 12, weight: "semibold" }, textColor: THEME.text },
      { type: "spacer", length: 2 },
      {
        type: "stack",
        height: 34,
        alignItems: "center",
        children: [
          { type: "image", src: "sf-symbol:" + ICON_MAP[key], width: 28, height: 28, color: ICON_COLOR[key] }
        ]
      },
      { type: "spacer", length: 4 },
      { type: "text", text: `¥${format(PRICE[key])}`, font: { size: 13, weight: "semibold" }, textColor: THEME.text }
    ]
  });

  // ⭐ 最终输出
  return {
    type: "widget",
    padding: [10, 8, 10, 8],
    gap: 6,
    children: [
      // 标题栏
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        gap: 4,
        children: [
          { type: "image", src: "sf-symbol:fuelpump.fill", width: 15, height: 15, color: THEME.text },
          { type: "text", text: `${CITY}今日油价`, font: { size: 15, weight: "semibold" }, textColor: THEME.text },
          { type: "spacer" },
          { type: "image", src: "sf-symbol:clock.arrow.circlepath", width: 11, height: 11, color: THEME.text },
          { type: "text", text: dateStr, font: { size: 11 }, textColor: THEME.text }
        ]
      },
      // 四格
      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 6,
        children: [item("92"), item("95"), item("98"), item("0")]
      },
      // 底部调价信息
      adjustUI
    ]
  };
}
