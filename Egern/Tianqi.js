/**
 * 今日天气 - Egern 小组件 (彩色数据定制版)
 *
 * 环境变量：
 * - CITY：城市/区县名称
 * - time：刷新间隔（分钟），默认 30
 *
 * 修复记录：
 * 1. aqi.medium / aqi.low SF Symbol 替换为有效符号
 * 2. formatCurrentTime() 固定使用 Asia/Shanghai 时区
 * 3. renderLarge 中冗余的 slice(0,3) 已移除
 * 4. renderSmall 中 createIconWithSunTimes 改为不含日出日落的轻量版，避免布局挤压
 */

const DEFAULT_CITY = '南宁';
const DEFAULT_TIME = 30;

const Colors = {
  bg: { light: '#FFFFFF', dark: '#1C1C1E' },
  cardBg: { light: '#F2F2F7', dark: '#2C2C2E' },
  textPrimary: { light: '#000000', dark: '#FFFFFF' },
  redWarning: '#FF3B30',   // 定位图标与 PM2.5 专属红色
  orangeWeather: '#FF9500', // 天气状况专属橙色
  greenTemp: '#34C759'      // 主温度专属绿色
};

export default async function(ctx) {
  const env = ctx.env || {};
  const widgetFamily = ctx.widgetFamily || 'systemMedium';
  const cityName = String(env.CITY || env.city || DEFAULT_CITY).trim() || DEFAULT_CITY;
  const refreshMinutes = parsePositiveInt(
    env.time || env.TIME,
    DEFAULT_TIME,
    5,
    720,
  );

  try {
    const weather = await fetchWeather(ctx, cityName);
    const refreshAfter = nextRefreshISO(refreshMinutes);

    if (isAccessoryFamily(widgetFamily)) {
      return renderAccessory(weather, widgetFamily, refreshAfter);
    }

    if (widgetFamily === 'systemSmall') {
      return renderSmall(weather, refreshAfter);
    }

    if (widgetFamily === 'systemLarge' || widgetFamily === 'systemExtraLarge') {
      return renderLarge(weather, refreshAfter);
    }

    return renderMedium(weather, refreshAfter);
  } catch (error) {
    console.error(error);
    return renderError(`天气加载失败\n${String(error.message || error).slice(0, 60)}`);
  }
}

async function fetchWeather(ctx, cityName) {
  const loc = await getCoordinates(ctx, cityName);
  const lat = loc.latitude;
  const lon = loc.longitude;
  const displayCity = cityName;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=Asia%2FShanghai`;
  const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,us_aqi&timezone=Asia%2FShanghai`;

  const [resp, aqiResp] = await Promise.all([
    ctx.http.get(url, { timeout: 6000 }),
    ctx.http.get(aqiUrl, { timeout: 6000 })
  ]);
  const data = await resp.json();
  const aqiData = await aqiResp.json();

  const current = data.current || {};
  const daily = data.daily || {};
  const aqiCurrent = aqiData.current || {};

  const extractTime = (isoStr) => isoStr ? isoStr.split('T')[1] : '--';
  const getDayOfWeek = (dateStr) => {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return days[new Date(dateStr).getDay()] || '';
  };

  const forecast = (daily.time || []).map((t, i) => ({
    date: t,
    week: getDayOfWeek(t),
    sunrise: extractTime(daily.sunrise?.[i]),
    sunset: extractTime(daily.sunset?.[i]),
    weather: getWmoWeather(daily.weather_code?.[i]),
    low: Math.round(daily.temperature_2m_min?.[i] ?? 0),
    high: Math.round(daily.temperature_2m_max?.[i] ?? 0),
  }));

  const today = forecast[0] || {};

  const aqiVal = aqiCurrent.us_aqi ?? 0;
  let quality = '优';
  if (aqiVal > 300) quality = '严重';
  else if (aqiVal > 200) quality = '重度';
  else if (aqiVal > 150) quality = '中度';
  else if (aqiVal > 100) quality = '轻度';
  else if (aqiVal > 50) quality = '良';

  return {
    city: displayCity,
    updateTime: formatCurrentTime(),
    currentTemp: Math.round(current.temperature_2m ?? 0),
    humidity: `${Math.round(current.relative_humidity_2m ?? 0)}%`,
    quality: quality,
    pm25: stringifyValue(aqiCurrent.pm2_5),
    pm10: stringifyValue(aqiCurrent.pm10),
    tips: `当前 AQI ${aqiVal}，温度 ${Math.round(current.temperature_2m ?? 0)}°C。`,
    today: {
      ...today,
      windDir: `${getWindDir(current.wind_direction_10m ?? 0)} ${getWindScale(current.wind_speed_10m ?? 0)}级`,
      windLevel: `${(current.wind_speed_10m ?? 0).toFixed(1)} 公里/时`,
    },
    // FIX 3: 只在 fetchWeather 中 slice，renderLarge 无需再次 slice
    forecast: forecast.slice(0, 3),
  };
}

async function getCoordinates(ctx, cityName) {
  try {
    const url1 = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=zh`;
    const res1 = await ctx.http.get(url1, { timeout: 3000 });
    const d1 = await res1.json();
    if (d1.results && d1.results.length > 0) return d1.results[0];
  } catch(e) {}

  try {
    const fallbackName = cityName.replace(/[区县市]$/, '');
    if (fallbackName && fallbackName !== cityName) {
      const url2 = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(fallbackName)}&count=1&language=zh`;
      const res2 = await ctx.http.get(url2, { timeout: 3000 });
      const d2 = await res2.json();
      if (d2.results && d2.results.length > 0) return d2.results[0];
    }
  } catch(e) {}

  try {
    const url3 = `https://photon.komoot.io/api/?q=${encodeURIComponent(cityName)}&limit=1`;
    const res3 = await ctx.http.get(url3, { timeout: 4000 });
    const d3 = await res3.json();
    if (d3.features && d3.features.length > 0) {
      const coords = d3.features[0].geometry.coordinates;
      return { latitude: coords[1], longitude: coords[0] };
    }
  } catch(e) {}

  throw new Error(`无法定位: ${cityName}`);
}

// FIX 4: small 尺寸使用轻量版图标，不含日出日落，避免布局挤压
function renderSmall(weather, refreshAfter) {
  const theme = getTheme(weather.today.weather);

  return {
    type: 'widget',
    url: weatherURL(weather.city),
    refreshAfter,
    padding: [14, 16, 14, 16],
    backgroundColor: Colors.bg,
    children: [
      {
        type: 'stack',
        direction: 'column',
        gap: 0,
        children: [
          {
            type: 'stack',
            direction: 'row',
            alignItems: 'center',
            children: [
              createTitleNode(weather.city, 16),
              { type: 'spacer' },
            ],
          },
          {
            type: 'stack',
            direction: 'row',
            alignItems: 'center',
            gap: 8,
            children: [
              // 轻量版：仅显示天气图标，不含日出日落
              {
                type: 'image',
                src: `sf-symbol:${theme.icon}`,
                width: 28,
                height: 28,
                color: theme.iconColor,
              },
              {
                type: 'stack',
                direction: 'column',
                alignItems: 'center',
                gap: 1,
                flex: 1,
                children: [
                  {
                    type: 'text',
                    text: `${weather.currentTemp}°`,
                    font: { size: 26, weight: 'bold' },
                    textColor: Colors.greenTemp,
                  },
                  {
                    type: 'text',
                    text: weather.today.weather,
                    font: { size: 12, weight: 'bold' },
                    textColor: Colors.orangeWeather,
                    maxLines: 1,
                  },
                ],
              },
            ],
          },
        ]
      },
      { type: 'spacer' },
      {
        type: 'stack',
        direction: 'column',
        gap: 4,
        children: [
          createMiniInfo('thermometer.medium', `${weather.today.low}° ~ ${weather.today.high}°`),
          createMiniInfo('humidity.fill', weather.humidity),
          createMiniInfo('wind', `${weather.today.windDir} ${weather.today.windLevel}`),
        ],
      },
    ],
  };
}

function renderMedium(weather, refreshAfter) {
  const theme = getTheme(weather.today.weather);

  return {
    type: 'widget',
    url: weatherURL(weather.city),
    refreshAfter,
    padding: [14, 16, 14, 16],
    backgroundColor: Colors.bg,
    children: [
      {
        type: 'stack',
        direction: 'column',
        gap: 0,
        children: [
          {
            type: 'stack',
            direction: 'row',
            alignItems: 'center',
            children: [
              createTitleNode(weather.city, 16),
              { type: 'spacer' },
              createUpdateTimeNode(weather.updateTime)
            ],
          },
          {
            type: 'stack',
            direction: 'row',
            alignItems: 'center',
            children: [
              {
                type: 'stack',
                direction: 'column',
                alignItems: 'center',
                gap: 2,
                width: 85,
                children: [
                  {
                    type: 'image',
                    src: `sf-symbol:${theme.icon}`,
                    width: 32,
                    height: 32,
                    color: theme.iconColor,
                  },
                  {
                    type: 'text',
                    text: `日出 ${weather.today.sunrise}`,
                    font: { size: 12, weight: 'bold' },
                    textColor: Colors.textPrimary,
                    maxLines: 1,
                    minScale: 0.8,
                  },
                  {
                    type: 'text',
                    text: `日落 ${weather.today.sunset}`,
                    font: { size: 12, weight: 'bold' },
                    textColor: Colors.textPrimary,
                    maxLines: 1,
                    minScale: 0.8,
                  }
                ]
              },
              { type: 'spacer' },
              {
                type: 'stack',
                direction: 'column',
                alignItems: 'center',
                gap: 2,
                children: [
                  {
                    type: 'text',
                    text: `${weather.currentTemp}°C`,
                    font: { size: 30, weight: 'bold' },
                    textColor: Colors.greenTemp,
                  },
                  {
                    type: 'text',
                    text: weather.today.weather,
                    font: { size: 12, weight: 'bold' },
                    textColor: Colors.orangeWeather,
                    maxLines: 1,
                  },
                  {
                    type: 'text',
                    text: `${weather.today.low}° / ${weather.today.high}°`,
                    font: { size: 'caption1', weight: 'bold' },
                    textColor: Colors.textPrimary,
                    maxLines: 1,
                  },
                ],
              },
              { type: 'spacer' },
              {
                type: 'stack',
                direction: 'column',
                alignItems: 'end',
                gap: 4,
                width: 85,
                children: [
                  createBadge('空气', weather.quality, getQualityColor(weather.quality)),
                  createBadge('PM2.5', weather.pm25, Colors.redWarning),
                ],
              },
            ],
          },
        ]
      },
      { type: 'spacer' },
      {
        type: 'stack',
        direction: 'row',
        gap: 8,
        children: [
          createInfoCard('humidity.fill', '湿度', weather.humidity, '#007AFF'),
          createInfoCard('wind', '风向', weather.today.windDir, '#AF52DE'),
          createInfoCard('gauge.medium', '风力', weather.today.windLevel, '#FF9500'),
        ],
      },
    ],
  };
}

function renderLarge(weather, refreshAfter) {
  const theme = getTheme(weather.today.weather);
  // FIX 3: 直接使用 weather.forecast，fetchWeather 已 slice(0,3)
  const forecastItems = weather.forecast;

  return {
    type: 'widget',
    url: weatherURL(weather.city),
    refreshAfter,
    padding: [14, 18, 14, 18],
    backgroundColor: Colors.bg,
    children: [
      {
        type: 'stack',
        direction: 'column',
        gap: 0,
        children: [
          {
            type: 'stack',
            direction: 'row',
            alignItems: 'center',
            children: [
              createTitleNode(weather.city, 16),
              { type: 'spacer' },
              createUpdateTimeNode(weather.updateTime)
            ],
          },
          {
            type: 'stack',
            direction: 'row',
            alignItems: 'center',
            gap: 16,
            children: [
              createIconWithSunTimes(theme, weather, 44),
              {
                type: 'stack',
                direction: 'column',
                alignItems: 'center',
                gap: 2,
                flex: 1,
                children: [
                  {
                    type: 'text',
                    text: `${weather.currentTemp}°C`,
                    font: { size: 32, weight: 'bold' },
                    textColor: Colors.greenTemp,
                  },
                  {
                    type: 'text',
                    text: `${weather.today.weather} · ${weather.today.low}° / ${weather.today.high}°`,
                    font: { size: 12, weight: 'bold' },
                    textColor: Colors.orangeWeather,
                    maxLines: 1,
                  },
                  {
                    type: 'text',
                    text: `空气 ${weather.quality} · 湿度 ${weather.humidity}`,
                    font: { size: 'caption1', weight: 'bold' },
                    textColor: Colors.textPrimary,
                    maxLines: 1,
                    minScale: 0.7,
                  },
                ],
              },
            ],
          },
        ]
      },
      { type: 'spacer' },
      {
        type: 'stack',
        direction: 'row',
        gap: 8,
        children: [
          createInfoCard('sunrise.fill', '日出', weather.today.sunrise, '#FF9500'),
          createInfoCard('sunset.fill', '日落', weather.today.sunset, '#FF2D55'),
          // FIX 1: aqi.medium → lungs.fill（PM2.5），aqi.low → wind（PM10）
          createInfoCard('lungs.fill', 'PM2.5', weather.pm25, '#34C759', Colors.redWarning),
          createInfoCard('wind', 'PM10', weather.pm10, '#32ADE6'),
        ],
      },
      {
        type: 'stack',
        direction: 'column',
        gap: 8,
        padding: 10,
        backgroundColor: Colors.cardBg,
        borderRadius: 14,
        children: [
          {
            type: 'text',
            text: '未来天气',
            font: { size: 'footnote', weight: 'bold' },
            textColor: Colors.textPrimary,
          },
          ...forecastItems.map((item) => ({
            type: 'stack',
            direction: 'row',
            alignItems: 'center',
            gap: 8,
            children: [
              {
                type: 'stack',
                width: 52,
                children: [
                  {
                    type: 'text',
                    text: item.week || '--',
                    font: { size: 'callout', weight: 'bold' },
                    textColor: Colors.textPrimary,
                    maxLines: 1,
                    minScale: 0.7,
                  },
                ],
              },
              forecastIcon(item.weather),
              {
                type: 'text',
                text: item.weather,
                flex: 1,
                font: { size: 'callout', weight: 'bold' },
                textColor: Colors.textPrimary,
                maxLines: 1,
                minScale: 0.7,
              },
              {
                type: 'text',
                text: `${item.low}° / ${item.high}°`,
                font: { size: 'callout', weight: 'bold' },
                textColor: Colors.textPrimary,
                maxLines: 1,
              },
            ],
          })),
        ],
      },
      {
        type: 'text',
        text: weather.tips,
        font: { size: 'footnote', weight: 'bold' },
        textColor: Colors.textPrimary,
        maxLines: 2,
        minScale: 0.75,
      },
    ],
  };
}

function renderAccessory(weather, family, refreshAfter) {
  const theme = getTheme(weather.today.weather);
  const base = {
    type: 'widget',
    url: weatherURL(weather.city),
    refreshAfter,
  };

  if (family === 'accessoryInline') {
    return {
      ...base,
      children: [
        {
          type: 'text',
          text: `${weather.city} ${weather.currentTemp}° · ${weather.today.weather}`,
          font: { size: 'caption1', weight: 'bold' },
          maxLines: 1,
          minScale: 0.6,
        },
      ],
    };
  }

  if (family === 'accessoryCircular') {
    return {
      ...base,
      padding: 6,
      gap: 2,
      children: [
        {
          type: 'image',
          src: `sf-symbol:${theme.icon}`,
          width: 24,
          height: 24,
          color: theme.iconColor,
        },
        {
          type: 'text',
          text: `${weather.currentTemp}°`,
          font: { size: 'headline', weight: 'bold' },
          textAlign: 'center',
        },
      ],
    };
  }

  return {
    ...base,
    padding: 10,
    gap: 4,
    children: [
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 6,
        children: [
          {
            type: 'image',
            src: `sf-symbol:${theme.icon}`,
            width: 18,
            height: 18,
            color: theme.iconColor,
          },
          {
            type: 'text',
            text: weather.city,
            font: { size: 'headline', weight: 'bold' },
            maxLines: 1,
            minScale: 0.7,
          },
          { type: 'spacer' },
          {
            type: 'text',
            text: `${weather.currentTemp}°`,
            font: { size: 'headline', weight: 'bold' },
          },
        ],
      },
      {
        type: 'text',
        text: `${weather.today.weather} · ${weather.today.low}°/${weather.today.high}° · ${weather.quality}`,
        font: { size: 'caption1', weight: 'bold' },
        maxLines: 1,
        minScale: 0.6,
      },
    ],
  };
}

function renderError(message) {
  return {
    type: 'widget',
    padding: 16,
    backgroundColor: Colors.bg,
    children: [
      {
        type: 'text',
        text: '今日天气',
        font: { size: 'headline', weight: 'bold' },
        textColor: Colors.textPrimary,
      },
      {
        type: 'text',
        text: message,
        font: { size: 'footnote', weight: 'bold' },
        textColor: '#FF3B30',
        maxLines: 3,
        minScale: 0.7,
      },
    ],
  };
}

// medium/large 尺寸专用：含日出日落的图标组合
function createIconWithSunTimes(theme, weather, iconSize) {
  return {
    type: 'stack',
    direction: 'column',
    alignItems: 'center',
    gap: 2,
    children: [
      {
        type: 'image',
        src: `sf-symbol:${theme.icon}`,
        width: iconSize,
        height: iconSize,
        color: theme.iconColor,
      },
      {
        type: 'text',
        text: `日出 ${weather.today.sunrise}`,
        font: { size: 12, weight: 'bold' },
        textColor: Colors.textPrimary,
        maxLines: 1,
        minScale: 0.8,
      },
      {
        type: 'text',
        text: `日落 ${weather.today.sunset}`,
        font: { size: 12, weight: 'bold' },
        textColor: Colors.textPrimary,
        maxLines: 1,
        minScale: 0.8,
      }
    ]
  };
}

function createTitleNode(cityName, fontSize = 16) {
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 4,
    children: [
      {
        type: 'image',
        src: 'sf-symbol:location.fill',
        width: fontSize,
        height: fontSize,
        color: Colors.redWarning,
      },
      {
        type: 'text',
        text: cityName,
        font: { size: fontSize, weight: 'bold' },
        textColor: Colors.textPrimary,
        maxLines: 1,
      }
    ]
  };
}

function createUpdateTimeNode(updateTime) {
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 3,
    children: [
      {
        type: 'image',
        src: 'sf-symbol:clock.fill',
        width: 12,
        height: 12,
        color: Colors.textPrimary,
      },
      {
        type: 'text',
        text: updateTime,
        font: { size: 12 },
        textColor: Colors.textPrimary,
        maxLines: 1,
      }
    ]
  };
}

function createMiniInfo(icon, value) {
  return {
    type: 'stack',
    direction: 'row',
    alignItems: 'center',
    gap: 6,
    children: [
      {
        type: 'image',
        src: `sf-symbol:${icon}`,
        width: 12,
        height: 12,
        color: Colors.textPrimary,
      },
      {
        type: 'text',
        text: value,
        font: { size: 'caption1', weight: 'bold' },
        textColor: Colors.textPrimary,
        maxLines: 1,
        minScale: 0.7,
      },
    ],
  };
}

function createInfoCard(icon, label, value, iconColor, valueColor = Colors.textPrimary) {
  return {
    type: 'stack',
    direction: 'column',
    alignItems: 'center',
    gap: 3,
    flex: 1,
    padding: [7, 4],
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    children: [
      {
        type: 'stack',
        direction: 'row',
        alignItems: 'center',
        gap: 4,
        children: [
          {
            type: 'image',
            src: `sf-symbol:${icon}`,
            width: 14,
            height: 14,
            color: iconColor,
          },
          {
            type: 'text',
            text: label,
            font: { size: 12, weight: 'bold' },
            textColor: Colors.textPrimary,
            maxLines: 1,
            minScale: 0.7,
          },
        ],
      },
      {
        type: 'text',
        text: value,
        font: { size: 13, weight: 'bold' },
        textColor: valueColor,
        maxLines: 1,
        minScale: 0.8,
      },
    ],
  };
}

function createBadge(label, value, valueColor) {
  return {
    type: 'stack',
    direction: 'column',
    alignItems: 'end',
    gap: 1,
    children: [
      {
        type: 'text',
        text: label,
        font: { size: 'caption2', weight: 'bold' },
        textColor: Colors.textPrimary,
        maxLines: 1,
      },
      {
        type: 'text',
        text: value,
        font: { size: 'subheadline', weight: 'bold' },
        textColor: valueColor,
        maxLines: 1,
        minScale: 0.7,
      },
    ],
  };
}

function forecastIcon(weatherText) {
  const theme = getTheme(weatherText);
  return {
    type: 'image',
    src: `sf-symbol:${theme.icon}`,
    width: 18,
    height: 18,
    color: theme.iconColor,
  };
}

function getTheme(weatherText = '') {
  const text = String(weatherText);
  let icon = 'sun.max.fill';
  let iconColor = '#FF9500';

  if (/(雷|暴雨|大暴雨|特大暴雨)/.test(text)) {
    icon = 'cloud.bolt.rain.fill';
    iconColor = '#5856D6';
  } else if (/(冻雨|雨夹雪)/.test(text)) {
    icon = 'cloud.sleet.fill';
    iconColor = '#32ADE6';
  } else if (/(雪|冰雹|冰粒)/.test(text)) {
    icon = 'cloud.snow.fill';
    iconColor = '#5AC8FA';
  } else if (/(雨|阵雨|毛毛雨)/.test(text)) {
    icon = 'cloud.rain.fill';
    iconColor = '#007AFF';
  } else if (/(雾|霾|扬沙|浮尘|沙尘)/.test(text)) {
    icon = 'sun.haze.fill';
    iconColor = '#8E8E93';
  } else if (/(阴)/.test(text)) {
    icon = 'cloud.fill';
    iconColor = '#8E8E93';
  } else if (/(多云)/.test(text)) {
    icon = 'cloud.sun.fill';
    iconColor = '#34C759';
  }

  return { icon, iconColor };
}

function getWmoWeather(code) {
  const map = {
    0: '晴', 1: '晴间多云', 2: '多云', 3: '阴',
    45: '雾', 48: '沉积雾',
    51: '毛毛雨', 53: '中等毛毛雨', 55: '大毛毛雨',
    56: '冻雨', 57: '冻雨',
    61: '小雨', 63: '中雨', 65: '大雨',
    66: '冻雨', 67: '冻雨',
    71: '小雪', 73: '中雪', 75: '大雪',
    77: '冰粒',
    80: '阵雨', 81: '强阵雨', 82: '暴雨',
    85: '阵雪', 86: '暴雪',
    95: '雷阵雨', 96: '雷雨伴冰雹', 99: '强雷雨伴冰雹'
  };
  return map[code] || '未知';
}

function getWindScale(speedKmh) {
  const s = speedKmh;
  if (s < 2) return 0;
  if (s < 6) return 1;
  if (s < 12) return 2;
  if (s < 20) return 3;
  if (s < 29) return 4;
  if (s < 39) return 5;
  if (s < 50) return 6;
  if (s < 62) return 7;
  if (s < 75) return 8;
  if (s < 89) return 9;
  if (s < 103) return 10;
  if (s < 118) return 11;
  return 12;
}

function getWindDir(degree) {
  const val = Math.floor((degree / 22.5) + 0.5);
  const arr = ["北风", "东北风", "东北风", "东风", "东风", "东南风", "东南风", "南风", "南风", "西南风", "西南风", "西风", "西风", "西北风", "西北风", "北风"];
  return arr[(val % 16)];
}

function getQualityColor(quality = '') {
  const text = String(quality);
  if (/优/.test(text)) return '#34C759';
  if (/良/.test(text)) return '#FFCC00';
  if (/轻度/.test(text)) return '#FF9500';
  if (/中度/.test(text)) return '#FF3B30';
  if (/重度|严重/.test(text)) return '#C10015';
  return '#8E8E93';
}

// FIX 2: 固定使用 Asia/Shanghai 时区，避免非中国设备时间错误
function formatCurrentTime() {
  const now = new Date();
  const opts = {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };
  // toLocaleString 在部分环境格式不一，手动拼装保证格式统一
  const parts = new Intl.DateTimeFormat('zh-CN', opts).formatToParts(now);
  const get = (type) => parts.find(p => p.type === type)?.value ?? '00';
  return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function weatherURL(cityName) {
  return `https://www.bing.com/search?q=${encodeURIComponent(cityName + '天气')}`;
}

function nextRefreshISO(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function parsePositiveInt(value, fallback, min, max) {
  const num = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function stringifyValue(value) {
  return value === undefined || value === null || value === '' ? '--' : String(value);
}

function isAccessoryFamily(family) {
  return String(family).startsWith('accessory');
}