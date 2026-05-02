/**
 * 今日天气（和风天气版） - Egern 小组件
 *
 * 环境变量：
 * - CITY：城市/区县名称
 * - time：刷新间隔（分钟），默认 30
 * - API_KEY：和风天气个人 API Key
 * - API_HOST：个人 API Host (从和风控制台获取)
 * * 必须使用个人API Host：每个开发者账号都有独立的API Host
 * 从控制台复制：登录 https://console.qweather.com/ → 设置 → 复制API Host
 * KEY获取: 开始请求API之前，你需要先创建项目和凭据 前往控制台-项目管理 点击右上角“创建项目”按钮 填写项目名称，项目名称最多20个字符。你可以稍后对名称进行修改。点击“保存”按钮。然后点你刚创建的项目名称 进去就可以看见了。 ⚠️重要提示: 应用限制 你需要选择不限制
 */

const DEFAULT_CITY = '南宁';
const DEFAULT_TIME = 30;

const Colors = {
  bg: { light: '#FFFFFF', dark: '#1C1C1E' },
  cardBg: { light: '#F2F2F7', dark: '#2C2C2E' },
  textPrimary: { light: '#1C1C1E', dark: '#FFFFFF' }, 
  redWarning: '#FF6B6B',    
  orangeWeather: '#F59E0B', 
  greenTemp: '#30D158'      
};

export default async function(ctx) {
  const env = ctx.env || {};
  const widgetFamily = ctx.widgetFamily || 'systemMedium';
  const cityName = String(env.CITY || env.city || DEFAULT_CITY).trim() || DEFAULT_CITY;
  const refreshMinutes = parsePositiveInt(env.time || env.TIME, DEFAULT_TIME, 5, 720);

  try {
    const weather = await fetchWeather(ctx, cityName, env);
    const refreshAfter = nextRefreshISO(refreshMinutes);

    if (isAccessoryFamily(widgetFamily)) return renderAccessory(weather, widgetFamily, refreshAfter);
    if (widgetFamily === 'systemSmall') return renderSmall(weather, refreshAfter);
    if (widgetFamily === 'systemLarge' || widgetFamily === 'systemExtraLarge') return renderLarge(weather, refreshAfter);
    
    return renderMedium(weather, refreshAfter);
  } catch (error) {
    console.error(error);
    return renderError(`天气加载失败\n${String(error.message || error).slice(0, 60)}`);
  }
}

async function fetchWeather(ctx, cityName, env) {
  const rawApiKey = env.API_KEY || env.api_key || env.KEY;
  const rawApiHost = env.API_HOST || env.api_host;

  if (!rawApiKey || !rawApiHost) throw new Error("缺少 API_KEY 或 API_HOST 配置");

  let host = String(rawApiHost).trim().replace(/\/+$/, '');
  const baseUrl = host.startsWith('http') ? host : `https://${host}`;
  let token = String(rawApiKey).trim().replace(/^bearer\s+/i, "");

  // 1. 获取经纬度
  const loc = await getCoordinates(ctx, cityName);
  const lat = loc.latitude.toFixed(2);
  const lon = loc.longitude.toFixed(2);
  const locStr = `${lon},${lat}`;

  // 2. 准备所有接口 URL
  const urlNow = `${baseUrl}/v7/weather/now?location=${locStr}&key=${token}`;
  const url3d = `${baseUrl}/v7/weather/3d?location=${locStr}&key=${token}`;
  
  // 空气质量三重备用 URL (加入 OM 的 pm2.5)
  const urlAirV1 = `${baseUrl}/airquality/v1/current/${lat}/${lon}?key=${token}&lang=zh`;
  const urlAirV7 = `${baseUrl}/v7/air/now?location=${locStr}&key=${token}`;
  const urlAirOM = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5,us_aqi&timezone=Asia%2FShanghai`;

  const respNow = await ctx.http.get(urlNow, { timeout: 6000 });
  const textNow = await respNow.text();
  let dataNow;
  try { dataNow = JSON.parse(textNow); } catch (e) { throw new Error(`非JSON响应: ${textNow.slice(0,30)}`); }
  if (dataNow.code !== '200') throw new Error(`API错误:${dataNow.code}`);

  const [resp3d, respAir] = await Promise.all([
    ctx.http.get(url3d, { timeout: 6000 }),
    ctx.http.get(urlAirV1, { timeout: 4000 }).catch(() => null)
  ]);

  const data3d = await resp3d.json();
  let dataAir = respAir ? await respAir.json() : {};

  const now = dataNow.now || {};
  const daily = data3d.daily || [];
  const todayForecast = daily[0] || {};

  // 3. 解析空气数据 (包含 PM2.5 三重保底)
  let aqiVal = '--', quality = '--', pm25Val = '--';
  
  if (dataAir.code === '200' && dataAir.indexes?.length > 0) {
    const cnMee = dataAir.indexes.find(i => i.code === 'cn-mee') || dataAir.indexes[0];
    aqiVal = cnMee.aqi;
    quality = cnMee.category;
    if (dataAir.pollutants && dataAir.pollutants.length > 0) {
      const pm25Obj = dataAir.pollutants.find(p => p.code === 'pm2p5');
      if (pm25Obj) pm25Val = pm25Obj.concentration;
    }
  } else {
    // 方案B: 尝试和风 V7
    try {
      const resV7 = await ctx.http.get(urlAirV7, { timeout: 3000 });
      const dV7 = await resV7.json();
      if (dV7.code === '200') {
        aqiVal = dV7.now.aqi;
        quality = dV7.now.category;
        pm25Val = dV7.now.pm2p5 || '--';
      } else {
        throw new Error('V7 失败');
      }
    } catch(e) {
      // 方案C: Open-Meteo
      try {
        const resOM = await ctx.http.get(urlAirOM, { timeout: 3000 });
        const dOM = await resOM.json();
        aqiVal = Math.round(dOM.current.us_aqi);
        pm25Val = Math.round(dOM.current.pm2_5);
        if (aqiVal <= 50) quality = '优';
        else if (aqiVal <= 100) quality = '良';
        else if (aqiVal <= 150) quality = '轻度';
        else if (aqiVal <= 200) quality = '中度';
        else if (aqiVal <= 300) quality = '重度';
        else quality = '严重';
      } catch(err) {}
    }
  }

  return {
    city: cityName,
    updateTime: formatCurrentTime(),
    currentTemp: Math.round(now.temp ?? 0),
    feelsLike: `${Math.round(now.feelsLike ?? now.temp ?? 0)}°C`,
    humidity: `${now.humidity}%`,
    precip: `${now.precip || '0.0'} mm`,
    aqi: aqiVal,
    quality: quality,
    pm25: pm25Val,
    // 【核心修改点】风向加上了几级风
    windDir: `${now.windDir || '--'} ${now.windScale || '0'}级`,
    windSpeed: `${now.windSpeed || '0'} km/h`,
    tips: `当前 AQI ${aqiVal}，体感 ${now.feelsLike || now.temp}°C。`,
    today: {
      weather: now.text || todayForecast.textDay || '未知',
      sunrise: todayForecast.sunrise || '--:--',
      sunset: todayForecast.sunset || '--:--',
      low: Math.round(todayForecast.tempMin ?? 0),
      high: Math.round(todayForecast.tempMax ?? 0),
    },
    forecast: daily.slice(0, 3).map(t => ({
      week: ['周日','周一','周二','周三','周四','周五','周六'][new Date(t.fxDate).getDay()],
      weather: t.textDay,
      low: Math.round(t.tempMin),
      high: Math.round(t.tempMax)
    }))
  };
}

// UI 渲染 - 中号组件 (核心修改：右侧使用四行列表排版)
function renderMedium(w, refreshAfter) {
  const theme = getTheme(w.today.weather);
  return {
    type: 'widget', url: weatherURL(w.city), refreshAfter, padding: [14, 16], backgroundColor: Colors.bg,
    children: [
      {
        type: 'stack', direction: 'row', alignItems: 'center', children: [
          createTitleNode(w.city, 16),
          { type: 'spacer' },
          createUpdateTimeNode(w.updateTime)
        ],
      },
      {
        type: 'stack', direction: 'row', alignItems: 'center', children: [
          { type: 'stack', direction: 'column', alignItems: 'center', gap: 2, width: 85, children: [
            { type: 'image', src: `sf-symbol:${theme.icon}`, width: 36, height: 36, color: theme.iconColor },
            { type: 'stack', direction: 'column', alignItems: 'start', gap: 2, children: [
              createSunTimeNode('sunrise.fill', `日出 ${w.today.sunrise}`, '#FF9500'),
              createSunTimeNode('sunset.fill', `日落 ${w.today.sunset}`, '#FF6B6B') // 修改为红色
            ]}
          ]},
          { type: 'spacer' },
          { type: 'stack', direction: 'column', alignItems: 'center', gap: 2, children: [
            { type: 'text', text: `${w.currentTemp}°C`, font: { size: 30, weight: 'bold' }, textColor: Colors.greenTemp },
            { type: 'text', text: w.today.weather, font: { size: 12, weight: 'bold' }, textColor: Colors.orangeWeather },
            { type: 'text', text: `${w.today.low}° / ${w.today.high}°`, font: { size: 'caption1', weight: 'bold' }, textColor: Colors.textPrimary },
          ]},
          { type: 'spacer' },
          // 右侧四行平行排版
          { type: 'stack', direction: 'column', alignItems: 'start', gap: 3, width: 85, children: [
            createRightListRow('空气', w.quality, getQualityColor(w.quality)),
            createRightListRow('AQI', w.aqi, getAqiColor(w.aqi)),
            createRightListRow('PM2.5', w.pm25, getPm25Color(w.pm25)),
            createRightListRow('体感', w.feelsLike, getTempColor(w.feelsLike)),
          ]},
        ],
      },
      { type: 'spacer' },
      // 底部 4 个卡片，风向现在显示为“西风 1级”
      { type: 'stack', direction: 'row', gap: 8, children: [
        createInfoCard('humidity.fill', '湿度', w.humidity, '#007AFF'),
        createInfoCard('wind', '风向', w.windDir, '#AF52DE'),
        createInfoCard('gauge.medium', '风速', w.windSpeed, '#FF9500'),
        createInfoCard('drop.fill', '降水', w.precip, '#32ADE6'),
      ]},
    ],
  };
}

// 辅助函数：专门用于右侧四行列表布局
function createRightListRow(label, value, valueColor) {
  return {
    type: 'stack', direction: 'row', alignItems: 'center', gap: 4, children: [
      { type: 'text', text: label, font: { size: 11, weight: 'bold' }, textColor: Colors.textPrimary },
      { type: 'text', text: String(value), font: { size: 12, weight: 'bold' }, textColor: valueColor, maxLines: 1, minScale: 0.8 }
    ]
  };
}

// 其余 UI 辅助函数 (保持完美排版)
async function getCoordinates(ctx, cityName) {
  try {
    const url1 = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=zh`;
    const res1 = await ctx.http.get(url1, { timeout: 3000 });
    const d1 = await res1.json();
    if (d1.results?.[0]) return d1.results[0];
  } catch(e) {}
  try {
    const fb = cityName.replace(/[区县市]$/, '');
    if (fb && fb !== cityName) {
      const res2 = await ctx.http.get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(fb)}&count=1&language=zh`);
      const d2 = await res2.json();
      if (d2.results?.[0]) return d2.results[0];
    }
  } catch(e) {}
  const res3 = await ctx.http.get(`https://photon.komoot.io/api/?q=${encodeURIComponent(cityName)}&limit=1`);
  const d3 = await res3.json();
  if (d3.features?.[0]) {
    const c = d3.features[0].geometry.coordinates;
    return { latitude: c[1], longitude: c[0] };
  }
  throw new Error(`无法定位: ${cityName}`);
}

function renderSmall(w, refreshAfter) {
  const theme = getTheme(w.today.weather);
  return {
    type: 'widget', url: weatherURL(w.city), refreshAfter, padding: [14, 16], backgroundColor: Colors.bg,
    children: [
      { type: 'stack', direction: 'row', children: [createTitleNode(w.city, 16), { type: 'spacer' }] },
      { type: 'stack', direction: 'row', alignItems: 'center', gap: 8, children: [
        { type: 'image', src: `sf-symbol:${theme.icon}`, width: 28, height: 28, color: theme.iconColor },
        { type: 'stack', direction: 'column', alignItems: 'center', flex: 1, children: [
          { type: 'text', text: `${w.currentTemp}°`, font: { size: 26, weight: 'bold' }, textColor: Colors.greenTemp },
          { type: 'text', text: w.today.weather, font: { size: 12, weight: 'bold' }, textColor: Colors.orangeWeather },
        ]}
      ]},
      { type: 'spacer' },
      createMiniInfo('thermometer.medium', `${w.today.low}° ~ ${w.today.high}°`),
      createMiniInfo('humidity.fill', w.humidity),
      createMiniInfo('wind', w.windDir)
    ]
  };
}

function renderLarge(w, refreshAfter) {
  const theme = getTheme(w.today.weather);
  return {
    type: 'widget', url: weatherURL(w.city), refreshAfter, padding: [14, 18], backgroundColor: Colors.bg,
    children: [
      { type: 'stack', direction: 'row', alignItems: 'center', children: [createTitleNode(w.city, 16), { type: 'spacer' }, createUpdateTimeNode(w.updateTime)] },
      { type: 'stack', direction: 'row', alignItems: 'center', gap: 16, children: [
        { type: 'stack', direction: 'column', alignItems: 'center', children: [
          { type: 'image', src: `sf-symbol:${theme.icon}`, width: 44, height: 44, color: theme.iconColor },
          createSunTimeNode('sunrise.fill', `日出 ${w.today.sunrise}`, '#FF9500'),
          createSunTimeNode('sunset.fill', `日落 ${w.today.sunset}`, '#FF6B6B') // 修改为红色
        ]},
        { type: 'stack', direction: 'column', alignItems: 'center', flex: 1, children: [
          { type: 'text', text: `${w.currentTemp}°C`, font: { size: 32, weight: 'bold' }, textColor: Colors.greenTemp },
          { type: 'text', text: `${w.today.weather} · ${w.today.low}° / ${w.today.high}°`, font: { size: 12, weight: 'bold' }, textColor: Colors.orangeWeather }
        ]}
      ]},
      { type: 'spacer' },
      { type: 'stack', direction: 'row', gap: 8, children: [
        createInfoCard('sunrise.fill', '日出', w.today.sunrise, '#FF9500'),
        createInfoCard('sunset.fill', '日落', w.today.sunset, '#FF6B6B'), // 修改为红色
        createInfoCard('thermometer.medium', '体感', w.feelsLike, getTempColor(w.feelsLike), getTempColor(w.feelsLike)),
        createInfoCard('drop.fill', '降水', w.precip, '#32ADE6'),
      ]},
      { type: 'stack', direction: 'column', gap: 8, padding: 10, backgroundColor: Colors.cardBg, borderRadius: 14, children: [
        { type: 'text', text: '未来天气预报', font: { size: 12, weight: 'bold' }, textColor: Colors.textPrimary },
        ...w.forecast.map(item => ({
          type: 'stack', direction: 'row', alignItems: 'center', children: [
            { type: 'text', text: item.week, width: 50, font: { size: 14, weight: 'bold' }, textColor: Colors.textPrimary },
            { type: 'image', src: `sf-symbol:${getTheme(item.weather).icon}`, width: 18, height: 18, color: getTheme(item.weather).iconColor },
            { type: 'text', text: item.weather, flex: 1, font: { size: 14, weight: 'bold' }, textColor: Colors.textPrimary, padding: [0, 8] },
            { type: 'text', text: `${item.low}°/${item.high}°`, font: { size: 14, weight: 'bold' }, textColor: Colors.textPrimary }
          ]
        }))
      ]},
      { type: 'text', text: w.tips, font: { size: 11 }, textColor: Colors.textPrimary, padding: [4, 0] }
    ]
  };
}

function createTitleNode(city, size) {
  return { type: 'stack', direction: 'row', alignItems: 'center', gap: 4, children: [{ type: 'image', src: 'sf-symbol:location.fill', width: size, height: size, color: Colors.redWarning }, { type: 'text', text: city, font: { size, weight: 'bold' }, textColor: Colors.textPrimary }] };
}
function createUpdateTimeNode(time) {
  return { type: 'stack', direction: 'row', alignItems: 'center', gap: 3, children: [{ type: 'image', src: 'sf-symbol:clock.fill', width: 12, height: 12, color: Colors.textPrimary }, { type: 'text', text: time, font: { size: 12 }, textColor: Colors.textPrimary }] };
}
function createSunTimeNode(icon, text, color) {
  // 核心修改：将宽度和高度都调到10，字体size调到10
  return { type: 'stack', direction: 'row', alignItems: 'center', gap: 4, children: [{ type: 'image', src: `sf-symbol:${icon}`, width: 10, height: 10, color }, { type: 'text', text, font: { size: 10, weight: 'bold' }, textColor: color, minScale: 0.8 }] };
}
function createInfoCard(icon, label, value, iColor, vColor = Colors.textPrimary) {
  return { type: 'stack', direction: 'column', flex: 1, padding: [7, 2], backgroundColor: Colors.cardBg, borderRadius: 14, alignItems: 'center', children: [{ type: 'stack', direction: 'row', gap: 4, alignItems: 'center', children: [{ type: 'image', src: `sf-symbol:${icon}`, width: 12, height: 12, color: iColor }, { type: 'text', text: label, font: { size: 11, weight: 'bold' }, textColor: Colors.textPrimary }] }, { type: 'text', text: value, font: { size: 12, weight: 'bold' }, textColor: vColor, maxLines: 1, minScale: 0.6 }] };
}
function createMiniInfo(icon, text) {
  return { type: 'stack', direction: 'row', alignItems: 'center', gap: 6, children: [{ type: 'image', src: `sf-symbol:${icon}`, width: 12, height: 12, color: Colors.textPrimary }, { type: 'text', text, font: { size: 12, weight: 'bold' }, textColor: Colors.textPrimary }] };
}
function getTheme(t) {
  if (/(雷)/.test(t)) return { icon: 'cloud.bolt.rain.fill', iconColor: '#5856D6' };
  if (/(雪)/.test(t)) return { icon: 'cloud.snow.fill', iconColor: '#5AC8FA' };
  if (/(雨)/.test(t)) return { icon: 'cloud.rain.fill', iconColor: '#007AFF' };
  if (/(雾|霾|沙)/.test(t)) return { icon: 'sun.haze.fill', iconColor: '#8E8E93' };
  if (/(阴)/.test(t)) return { icon: 'cloud.fill', iconColor: '#8E8E93' };
  if (/(多云)/.test(t)) return { icon: 'cloud.sun.fill', iconColor: '#30D158' };
  return { icon: 'sun.max.fill', iconColor: '#FF9500' };
}

// === 新增：颜色跟随等级计算函数 ===
function getQualityColor(q) {
  if (/优/.test(q)) return '#30D158';
  if (/良/.test(q)) return '#F59E0B';
  if (/轻/.test(q)) return '#FF9500';
  return Colors.redWarning;
}
function getAqiColor(aqi) {
  const val = parseInt(aqi);
  if (isNaN(val)) return Colors.textPrimary;
  if (val <= 50) return '#30D158';
  if (val <= 100) return '#F59E0B';
  if (val <= 150) return '#FF9500';
  return Colors.redWarning;
}
function getPm25Color(pm25) {
  const val = parseInt(pm25);
  if (isNaN(val)) return Colors.textPrimary;
  if (val <= 35) return '#30D158';
  if (val <= 75) return '#F59E0B';
  if (val <= 115) return '#FF9500';
  return Colors.redWarning;
}
function getTempColor(tempStr) {
  const val = parseInt(tempStr);
  if (isNaN(val)) return Colors.orangeWeather;
  if (val < 10) return '#32ADE6';
  if (val <= 26) return '#30D158';
  if (val <= 32) return '#FF9500';
  return Colors.redWarning;
}

function formatCurrentTime() {
  const d = new Date();
  const f = (n) => String(n).padStart(2, '0');
  return `${f(d.getMonth()+1)}-${f(d.getDate())} ${f(d.getHours())}:${f(d.getMinutes())}:${f(d.getSeconds())}`;
}
function weatherURL(city) { return `https://www.bing.com/search?q=${encodeURIComponent(city + '天气')}`; }
function nextRefreshISO(m) { return new Date(Date.now() + m * 60000).toISOString(); }
function parsePositiveInt(v, f, min, max) { const n = parseInt(v); return isNaN(n) ? f : Math.min(max, Math.max(min, n)); }
function stringifyValue(v) { return (v === undefined || v === null || v === '') ? '--' : String(v); }
function isAccessoryFamily(f) { return String(f).startsWith('accessory'); }
function renderError(msg) { return { type: 'widget', padding: 16, backgroundColor: Colors.bg, children: [{ type: 'text', text: '加载失败', font: { weight: 'bold' } }, { type: 'text', text: msg, textColor: '#FF3B30' }] }; }
function renderAccessory(w, family, refreshAfter) { return { type: 'widget', children: [{ type: 'text', text: `${w.currentTemp}° ${w.city}` }] }; }
