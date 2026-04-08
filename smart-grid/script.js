const controls = {
  baseDemand: document.getElementById('baseDemand'),
  solarScale: document.getElementById('solarScale'),
  windScale: document.getElementById('windScale'),
  batteryCapacity: document.getElementById('batteryCapacity'),
  batteryPower: document.getElementById('batteryPower'),
  weather: document.getElementById('weather'),
  season: document.getElementById('season'),
  aiLevel: document.getElementById('aiLevel')
};

const valueLabels = {
  baseDemand: document.getElementById('baseDemandValue'),
  solarScale: document.getElementById('solarScaleValue'),
  windScale: document.getElementById('windScaleValue'),
  batteryCapacity: document.getElementById('batteryCapacityValue'),
  batteryPower: document.getElementById('batteryPowerValue'),
  aiLevel: document.getElementById('aiLevelValue')
};

Object.keys(valueLabels).forEach(key => {
  controls[key].addEventListener('input', () => {
    valueLabels[key].textContent = controls[key].value;
  });
});

document.getElementById('runBtn').addEventListener('click', runSimulation);
document.getElementById('randomBtn').addEventListener('click', randomizeScenario);

function randomizeScenario() {
  controls.baseDemand.value = randInt(45, 130);
  controls.solarScale.value = randInt(20, 130);
  controls.windScale.value = randInt(15, 110);
  controls.batteryCapacity.value = randInt(40, 240);
  controls.batteryPower.value = randInt(12, 70);
  controls.aiLevel.value = randInt(3, 10);

  const weathers = ['sunny', 'mixed', 'cloudy'];
  const seasons = ['spring', 'summer', 'winter'];
  controls.weather.value = weathers[randInt(0, weathers.length - 1)];
  controls.season.value = seasons[randInt(0, seasons.length - 1)];

  Object.keys(valueLabels).forEach(key => {
    valueLabels[key].textContent = controls[key].value;
  });

  runSimulation();
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function gaussian(x, mu, sigma) {
  return Math.exp(-Math.pow(x - mu, 2) / (2 * sigma * sigma));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getSettings() {
  return {
    baseDemand: Number(controls.baseDemand.value),
    solarScale: Number(controls.solarScale.value),
    windScale: Number(controls.windScale.value),
    batteryCapacity: Number(controls.batteryCapacity.value),
    batteryPower: Number(controls.batteryPower.value),
    weather: controls.weather.value,
    season: controls.season.value,
    aiLevel: Number(controls.aiLevel.value)
  };
}

function generateScenario(settings) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const weatherFactor = { sunny: 1.1, mixed: 0.85, cloudy: 0.55 }[settings.weather];
  const seasonSolar = { spring: 1.0, summer: 1.15, winter: 0.7 }[settings.season];
  const seasonDemand = { spring: 1.0, summer: 1.1, winter: 1.18 }[settings.season];
  const windSeason = { spring: 1.0, summer: 0.9, winter: 1.15 }[settings.season];

  const demand = [];
  const solar = [];
  const wind = [];
  const gridCarbon = [];
  const gridPrice = [];

  hours.forEach(h => {
    const morningPeak = gaussian(h, 8, 2.2) * 18;
    const eveningPeak = gaussian(h, 19, 3) * 30;
    const nightDip = gaussian(h, 2, 2.8) * -10;
    const demandNoise = (Math.sin(h * 1.7) + Math.cos(h * 0.9)) * 2;
    demand.push(Math.max(15, settings.baseDemand * seasonDemand + morningPeak + eveningPeak + nightDip + demandNoise));

    const daylight = gaussian(h, 12, 3.2);
    solar.push(Math.max(0, settings.solarScale * weatherFactor * seasonSolar * daylight));

    const windBase = settings.windScale * windSeason * (0.75 + 0.25 * Math.sin((h + 3) / 2));
    const windWave = settings.windScale * 0.18 * Math.sin(h * 1.3) + settings.windScale * 0.1 * Math.cos(h * 0.6);
    wind.push(Math.max(4, windBase + windWave));

    gridCarbon.push(0.42 + gaussian(h, 20, 3.5) * 0.18 + gaussian(h, 7, 2.5) * 0.08);
    gridPrice.push(95 + gaussian(h, 18, 3.2) * 65 + gaussian(h, 8, 2.5) * 18);
  });

  return { hours, demand, solar, wind, gridCarbon, gridPrice };
}

function simulateDispatch(data, settings, useAI = false) {
  let battery = settings.batteryCapacity * 0.45;
  const batteryHistory = [];
  const gridUse = [];
  const batteryUse = [];
  const batteryCharge = [];
  const renewableUse = [];
  const unmet = [];

  let totalGrid = 0;
  let totalCost = 0;
  let totalCO2 = 0;
  let totalUnmet = 0;
  let totalDemand = 0;
  let totalRenewableUsed = 0;
  let totalRenewableAvailable = 0;

  for (let t = 0; t < 24; t++) {
    const renewable = data.solar[t] + data.wind[t];
    const demand = data.demand[t];
    totalDemand += demand;
    totalRenewableAvailable += renewable;

    let directRenewable = Math.min(renewable, demand);
    let surplus = Math.max(0, renewable - demand);
    let deficit = Math.max(0, demand - renewable);

    let discharge = 0;
    let charge = 0;
    let grid = 0;
    let shortage = 0;

    if (useAI) {
      const horizon = 3;
      let futureDeficitRisk = 0;
      let futureHighCarbon = 0;

      for (let k = 1; k <= horizon; k++) {
        const idx = Math.min(23, t + k);
        const futureRenewable = data.solar[idx] + data.wind[idx];
        futureDeficitRisk += Math.max(0, data.demand[idx] - futureRenewable);
        futureHighCarbon += data.gridCarbon[idx];
      }

      const aiWeight = settings.aiLevel / 10;
      const reserveRatio = clamp(0.12 + aiWeight * 0.38 + futureHighCarbon * 0.08, 0.12, 0.62);
      const reserveEnergy = settings.batteryCapacity * reserveRatio;

      if (surplus > 0) {
        const proactiveCharge = Math.min(
          surplus,
          settings.batteryPower,
          settings.batteryCapacity - battery
        );
        charge = proactiveCharge;
        battery += charge;
        surplus -= charge;
      }

      if (deficit > 0) {
        const allowedDischarge = Math.max(0, battery - reserveEnergy);
        const futurePressureBoost = clamp(futureDeficitRisk / 120, 0, 0.35);
        const dischargeLimit = useAI
          ? Math.max(0, allowedDischarge * (1.02 - futurePressureBoost))
          : battery;

        discharge = Math.min(deficit, settings.batteryPower, dischargeLimit);
        battery -= discharge;
        deficit -= discharge;
      }

      if (deficit > 0) {
        grid = deficit;
      }

      // 남은 배터리가 많고 지금 탄소강도가 높은 시간에는 추가 방전
      if (grid > 0 && battery > reserveEnergy && data.gridCarbon[t] > 0.55) {
        const extra = Math.min(grid, settings.batteryPower - discharge, battery - reserveEnergy);
        discharge += extra;
        battery -= extra;
        grid -= extra;
      }
    } else {
      if (surplus > 0) {
        charge = Math.min(surplus, settings.batteryPower, settings.batteryCapacity - battery);
        battery += charge;
        surplus -= charge;
      }

      if (deficit > 0) {
        discharge = Math.min(deficit, settings.batteryPower, battery);
        battery -= discharge;
        deficit -= discharge;
      }

      if (deficit > 0) {
        grid = deficit;
      }
    }

    shortage = Math.max(0, demand - directRenewable - discharge - grid);

    battery = clamp(battery, 0, settings.batteryCapacity);

    gridUse.push(round1(grid));
    batteryUse.push(round1(discharge));
    batteryCharge.push(round1(charge));
    renewableUse.push(round1(directRenewable + charge));
    batteryHistory.push(round1(battery));
    unmet.push(round1(shortage));

    totalGrid += grid;
    totalCost += grid * data.gridPrice[t];
    totalCO2 += grid * data.gridCarbon[t];
    totalUnmet += shortage;
    totalRenewableUsed += directRenewable + charge;
  }

  return {
    gridUse,
    batteryUse,
    batteryCharge,
    batteryHistory,
    renewableUse,
    unmet,
    summary: {
      totalGrid: round1(totalGrid),
      totalCost: Math.round(totalCost),
      totalCO2: round1(totalCO2),
      totalUnmet: round1(totalUnmet),
      renewableRatio: round1((totalRenewableUsed / Math.max(totalDemand, 1)) * 100),
      renewableCurtailment: round1(Math.max(0, totalRenewableAvailable - totalRenewableUsed))
    }
  };
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function runSimulation() {
  const settings = getSettings();
  const data = generateScenario(settings);
  const basic = simulateDispatch(data, settings, false);
  const smart = simulateDispatch(data, settings, true);

  renderSummary(basic.summary, smart.summary);
  renderTable(data, basic, smart);
  drawFlowChart(data, basic, smart);
  drawBatteryChart(basic, smart, settings.batteryCapacity);
}

function renderSummary(basic, smart) {
  const savingsCost = basic.totalCost - smart.totalCost;
  const savingsCO2 = basic.totalCO2 - smart.totalCO2;
  const savingsGrid = basic.totalGrid - smart.totalGrid;
  const cardData = [
    {
      title: '계통전력 사용량',
      smart: `${smart.totalGrid} kWh`,
      compare: `${formatSigned(round1(savingsGrid))} kWh`,
      good: savingsGrid >= 0
    },
    {
      title: '총 전력 비용',
      smart: `${smart.totalCost.toLocaleString()} 원`,
      compare: `${formatSigned(Math.round(savingsCost).toLocaleString())} 원`,
      good: savingsCost >= 0
    },
    {
      title: '탄소배출량',
      smart: `${smart.totalCO2} kgCO₂`,
      compare: `${formatSigned(round1(savingsCO2))} kgCO₂`,
      good: savingsCO2 >= 0
    },
    {
      title: '재생에너지 활용률',
      smart: `${smart.renewableRatio}%`,
      compare: `기본 ${basic.renewableRatio}%`,
      good: smart.renewableRatio >= basic.renewableRatio
    },
    {
      title: '재생에너지 버림량',
      smart: `${smart.renewableCurtailment} kWh`,
      compare: `기본 ${basic.renewableCurtailment} kWh`,
      good: smart.renewableCurtailment <= basic.renewableCurtailment
    },
    {
      title: '전력부족량',
      smart: `${smart.totalUnmet} kWh`,
      compare: `기본 ${basic.totalUnmet} kWh`,
      good: smart.totalUnmet <= basic.totalUnmet
    }
  ];

  const container = document.getElementById('summaryCards');
  container.innerHTML = cardData.map(item => `
    <div class="card">
      <h4>${item.title}</h4>
      <div class="metric ${item.good ? 'good' : 'warn'}">${item.smart}
        <small>${item.compare}</small>
      </div>
    </div>
  `).join('');
}

function formatSigned(value) {
  if (typeof value === 'number') {
    return value > 0 ? `-${value}` : `${Math.abs(value)}`;
  }
  const normalized = String(value).replace(/,/g, '');
  const num = Number(normalized);
  if (Number.isNaN(num)) return value;
  const absText = Math.abs(num).toLocaleString();
  return num > 0 ? `-${absText}` : absText;
}

function renderTable(data, basic, smart) {
  const tbody = document.querySelector('#resultTable tbody');
  tbody.innerHTML = '';

  for (let i = 0; i < 24; i++) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${String(i).padStart(2, '0')}:00</td>
      <td>${round1(data.demand[i])}</td>
      <td>${round1(data.solar[i])}</td>
      <td>${round1(data.wind[i])}</td>
      <td>${basic.gridUse[i]}</td>
      <td>${smart.gridUse[i]}</td>
      <td>${basic.batteryHistory[i]}</td>
      <td>${smart.batteryHistory[i]}</td>
    `;
    tbody.appendChild(row);
  }
}

function drawAxes(ctx, width, height, padding, maxY, yLabel) {
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#b8c7d9';
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();

  ctx.fillStyle = '#5f6b7a';
  ctx.font = '12px sans-serif';

  for (let i = 0; i <= 4; i++) {
    const y = height - padding - ((height - padding * 2) / 4) * i;
    const value = Math.round((maxY / 4) * i);
    ctx.strokeStyle = '#edf2f8';
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
    ctx.fillText(String(value), 8, y + 4);
  }

  for (let h = 0; h < 24; h++) {
    const x = padding + ((width - padding * 2) / 23) * h;
    ctx.fillText(String(h), x - 4, height - padding + 18);
  }

  ctx.save();
  ctx.translate(14, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

function drawLine(ctx, values, width, height, padding, maxY, color, dashed = false) {
  ctx.beginPath();
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  values.forEach((value, index) => {
    const x = padding + (plotWidth / 23) * index;
    const y = height - padding - (value / maxY) * plotHeight;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  if (dashed) ctx.setLineDash([6, 5]);
  else ctx.setLineDash([]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawLegend(ctx, items, x, y) {
  ctx.font = '12px sans-serif';
  items.forEach((item, index) => {
    const offsetY = y + index * 18;
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2.5;
    if (item.dashed) ctx.setLineDash([6, 5]);
    else ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, offsetY);
    ctx.lineTo(x + 18, offsetY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#334155';
    ctx.fillText(item.label, x + 24, offsetY + 4);
  });
}

function drawFlowChart(data, basic, smart) {
  const canvas = document.getElementById('flowChart');
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const padding = 48;
  const allValues = [
    ...data.demand,
    ...data.solar,
    ...data.wind,
    ...basic.gridUse,
    ...smart.gridUse
  ];
  const maxY = Math.max(...allValues) * 1.15;

  drawAxes(ctx, width, height, padding, maxY, 'kWh');

  drawLine(ctx, data.demand, width, height, padding, maxY, '#1f2937', false);
  drawLine(ctx, data.solar, width, height, padding, maxY, '#f59e0b', false);
  drawLine(ctx, data.wind, width, height, padding, maxY, '#0ea5e9', false);
  drawLine(ctx, basic.gridUse, width, height, padding, maxY, '#ef4444', true);
  drawLine(ctx, smart.gridUse, width, height, padding, maxY, '#10b981', false);

  drawLegend(ctx, [
    { label: '수요', color: '#1f2937' },
    { label: '태양광', color: '#f59e0b' },
    { label: '풍력', color: '#0ea5e9' },
    { label: '기본 Grid', color: '#ef4444', dashed: true },
    { label: 'AI Grid', color: '#10b981' }
  ], width - 170, 36);
}

function drawBatteryChart(basic, smart, batteryCapacity) {
  const canvas = document.getElementById('batteryChart');
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const padding = 44;
  const maxY = batteryCapacity;

  drawAxes(ctx, width, height, padding, maxY, 'Battery kWh');
  drawLine(ctx, basic.batteryHistory, width, height, padding, maxY, '#f97316', true);
  drawLine(ctx, smart.batteryHistory, width, height, padding, maxY, '#2563eb', false);

  drawLegend(ctx, [
    { label: '기본 배분', color: '#f97316', dashed: true },
    { label: 'AI 배분', color: '#2563eb' }
  ], width - 150, 34);
}

runSimulation();
