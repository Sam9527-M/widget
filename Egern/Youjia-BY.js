/**
 * 全国城市油价（远程省份映射 + 远程调价日历）
 * 使用说明：本脚本需要申请API-KEY，在https://www.mxnzp.com?ic=SR8XUR申请（每天1000次，免费）通过修改变量环境更改
 * 
 * 变量环境配置
 * 
 * 名称：APP_ID
 * 值：你的APP_ID
 * 
 * 名称：APP_SECRET
 * 值：你的APP_SECRET
 * 
 * 名称：CITY
 * 值：省份或城市（汉字）
 * 
 * 下面两个按需添加
 * 
 * 名称：CITY_MAP_URLS
 * 值：你的远程json链接（可补全城市映射）
 * 
 * 名称：CALENDAR_URLS
 * 值：你的远程json链接（维护油价调整日期）
 */

export default async function (ctx) {
  const THEME = {
    text: { light: "#000000", dark: "#FFFFFF" }
  };

  // ⭐ 用户设置城市（环境变量）
  const CITY = ctx.env.CITY || "南宁";

  // ⭐ 远程省份映射 URL（环境变量可覆盖）
  const REMOTE_PROVINCE_URL = ctx.env.PROVINCE_URL || "https://你的域名/province_city_map.json";

  let REMOTE_PROVINCE_MAP = null;

  // ⭐ 优先加载远程省份映射
  try {
    const res = await ctx.http.get(REMOTE_PROVINCE_URL);
    REMOTE_PROVINCE_MAP = await res.json();
  } catch (e) {
    console.log("远程省份映射加载失败，使用本地映射");
  }

  // ⭐ 本地 fallback（防止远程不可用）
  const LOCAL_PROVINCE_MAP = {
    "北京": ["北京"],
    "上海": ["上海"],
    "天津": ["天津"],
    "重庆": ["重庆"],
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

  // ⭐ 自动生成 城市 → 省份 映射
  const CITY_TO_PROVINCE = {};
  for (const [prov, cities] of Object.entries(PROVINCE_CITY_MAP)) {
    cities.forEach(c => CITY_TO_PROVINCE[c] = prov);
  }

  // ⭐ 自动识别省份
  const PROVINCE = CITY_TO_PROVINCE[CITY] || CITY;

  // ⭐ 缓存 key（按省份区分）
  const CACHE_KEY = `oil_cache_${PROVINCE}`;
  // ⭐ 缓存有效期：7 天
  const CACHE_EXPIRE = 7 * 24 * 60 * 60 * 1000;

  // ⭐ 读取缓存
  const cache = await ctx.storage.get(CACHE_KEY);
  const nowTime = Date.now();

  let oil = null;

  // ⭐ 判断缓存是否有效
  const cacheValid = cache && nowTime - cache.time < CACHE_EXPIRE;
  if (cacheValid) {
    oil = cache.data;
  } else {
    // ⭐ app_id / app_secret（环境变量可覆盖）
    const APP_ID = ctx.env.APP_ID || "lq3kkhsrll7hfaop";
    const APP_SECRET = ctx.env.APP_SECRET || "I4FH8JgwaEZvGj2ZFLYNmtIJ6YZjiD9r";

    const API = `https://www.mxnzp.com/api/oil/search?province=${encodeURIComponent(
      PROVINCE
    )}&app_id=${APP_ID}&app_secret=${APP_SECRET}`;

    try {
      const r = await ctx.http.get(API);
      const json = await r.json();

      if (json?.code === 1) {
        oil = json.data;
        await ctx.storage.set(CACHE_KEY, {
          time: nowTime,
          data: oil
        });
      } else if (cache) {
        oil = cache.data;
      }
    } catch (e) {
      if (cache) oil = cache.data;
    }
  }

  // ⭐ 远程调价日历 URL（环境变量可覆盖）
  const REMOTE_CALENDAR_URL = ctx.env.CALENDAR_URL || "https://你的域名/adjust_calendar.json";

  let REMOTE_CALENDAR = null;

  // ⭐ 优先加载远程调价日历
  try {
    const res = await ctx.http.get(REMOTE_CALENDAR_URL);
    REMOTE_CALENDAR = await res.json();
  } catch (e) {
    console.log("远程调价日历加载失败，使用本地日历");
  }

  // ⭐ 本地 fallback
  const LOCAL_CALENDAR = {
    2026: [
      "01-06","01-20","02-03","02-24","03-09","03-23",
      "04-07","04-21","05-08","05-21","06-04","06-18",
      "07-03","07-17","07-31","08-14","08-28","09-11",
      "09-24","10-15","10-29","11-12","11-26","12-10","12-24"
    ]
  };

  const ADJUST_CALENDAR = REMOTE_CALENDAR || LOCAL_CALENDAR;
  // ⭐ 获取当前年份可用的调价日历
  function getCalendarForYear(year) {
    if (ADJUST_CALENDAR[year]) return ADJUST_CALENDAR[year];
    const years = Object.keys(ADJUST_CALENDAR).map(Number).sort();
    return ADJUST_CALENDAR[years[years.length - 1]];
  }

  const now = new Date();
  const year = now.getFullYear();
  const calendar = getCalendarForYear(year);

  // ⭐ 找到下一次调价日期
  function getNextAdjustDate() {
    const today = new Date();

    for (const md of calendar) {
      const [m, d] = md.split("-").map(Number);
      const adjust = new Date(year, m - 1, d, 24, 0, 0);
      if (adjust > today) return adjust;
    }

    const [m, d] = calendar[0].split("-").map(Number);
    return new Date(year + 1, m - 1, d, 24, 0, 0);
  }

  const nextAdjust = getNextAdjustDate();
  const uiDate = new Date(nextAdjust.getTime());
  const uiDateStr = `${uiDate.getMonth() + 1}月${uiDate.getDate()}日`;

  const diff = nextAdjust - now;
  const leftDays = Math.floor(diff / (1000 * 60 * 60 * 24));
  const leftHours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const countdownStr = `${leftDays}天${leftHours}小时`;

  const PRICE = {
    "92": oil?.t92 ? Number(oil.t92) : null,
    "95": oil?.t95 ? Number(oil.t95) : null,
    "98": oil?.t98 ? Number(oil.t98) : null,
    "0": oil?.t0 ? Number(oil.t0) : null
  };

  const ICON_MAP = {
    "92": "fuelpump.fill",
    "95": "fuelpump.fill",
    "98": "fuelpump.fill",
    "0": "fuelpump.fill"
  };

  const ICON_COLOR = {
    "92": "#FFD60A",
    "95": "#FF9500",
    "98": "#FF3B30",
    "0": "#34C759"
  };

  const NAME_CN = {
    "92": "92号汽油",
    "95": "95号汽油",
    "98": "98号汽油",
    "0": "0号柴油"
  };

  const format = (v) => (v ? Number(v).toFixed(2) : "-");

  const dateStr =
    `${now.getFullYear()}-` +
    `${String(now.getMonth() + 1).padStart(2, "0")}-` +
    `${String(now.getDate()).padStart(2, "0")} ` +
    `${String(now.getHours()).padStart(2, "0")}:` +
    `${String(now.getMinutes()).padStart(2, "0")}`;
  const item = (key) => ({
    type: "stack",
    direction: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    padding: [4, 0, 4, 0],
    children: [
      {
        type: "text",
        text: NAME_CN[key],
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
            src: "sf-symbol:" + ICON_MAP[key],
            width: 28,
            height: 28,
            color: ICON_COLOR[key]
          }
        ]
      },
      { type: "spacer", length: 4 },
      {
        type: "text",
        text: `¥${format(PRICE[key])}`,
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
            src: "sf-symbol:fuelpump.fill",
            width: 14,
            height: 14,
            color: THEME.text
          },
          {
            type: "text",
            text: `${CITY}今日油价`,
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
        alignItems: "center",
        justifyContent: "space-between",
        gap: 6,
        children: [item("92"), item("95"), item("98"), item("0")]
      },

      {
        type: "stack",
        direction: "row",
        alignItems: "center",
        padding: [4, 0, 0, 2],
        children: [
          {
            type: "text",
            text: `下轮调价：`,
            font: { size: 12, weight: "bold" },
            textColor: THEME.text
          },
          {
            type: "text",
            text: `${uiDateStr}（${countdownStr}）`,
            font: { size: 12, weight: "bold" },
            textColor: "#FF9500"
          }
        ]
      }
    ]
  };
}
