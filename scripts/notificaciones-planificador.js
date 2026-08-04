'use strict';

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const MINIMUM_RANDOM_SEPARATION = 90;

function hash32(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomUnit(seed) {
  return hash32(seed) / 4294967296;
}

function shuffled(values, seed) {
  return [...values]
    .map(value => ({ value, order: randomUnit(`${seed}:${value}`) }))
    .sort((a, b) => a.order - b.order)
    .map(item => item.value);
}

function parseMinutes(value, fallback) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return fallback;
  return hours * 60 + minutes;
}

function formatMinutes(value) {
  const safe = Math.max(0, Math.min(1439, Math.round(value)));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function dateKey(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function currentMinute(parts) {
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function weekKey(parts) {
  const current = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const weekday = WEEKDAYS[parts.weekday];
  const mondayOffset = (weekday + 6) % 7;
  current.setUTCDate(current.getUTCDate() - mondayOffset);
  return current.toISOString().slice(0, 10);
}

function enabledDays(device) {
  const configured = Array.isArray(device.schedule?.days) ? device.schedule.days.map(Number) : [0, 1, 2, 3, 4, 5, 6];
  return [...new Set(configured)].filter(day => day >= 0 && day <= 6);
}

function selectedWeeklyDays(device, category, frequency, parts) {
  const days = enabledDays(device);
  const amount = frequency === 'two_week' ? 2 : 1;
  return shuffled(days, `${device.deviceId}:${category}:${weekKey(parts)}`).slice(0, amount);
}

function coordinatedWeeklyDays(device, category, frequency, parts) {
  const selected = selectedWeeklyDays(device, category, frequency, parts);
  if (category !== 'meditation') return selected;
  const passphraseFrequency = device.categories?.passphrase;
  if (!['weekly', 'two_week'].includes(passphraseFrequency)) return selected;
  const reserved = new Set(selectedWeeklyDays(device, 'passphrase', passphraseFrequency, parts));
  const amount = frequency === 'two_week' ? 2 : 1;
  const alternatives = shuffled(
    enabledDays(device).filter(day => !reserved.has(day)),
    `${device.deviceId}:${category}:${weekKey(parts)}:separated`
  );
  return alternatives.length >= amount ? alternatives.slice(0, amount) : selected;
}

function daysInMonth(parts) {
  return new Date(Date.UTC(Number(parts.year), Number(parts.month), 0)).getUTCDate();
}

function weekdayForDate(parts, day) {
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, day)).getUTCDay();
}

function selectedMonthlyDays(device, category, parts) {
  const allowed = new Set(enabledDays(device));
  const totalDays = daysInMonth(parts);
  const segments = [
    [1, Math.min(7, totalDays)],
    [8, Math.min(17, totalDays)],
    [18, totalDays]
  ];
  return segments.flatMap(([from, to], index) => {
    const candidates = [];
    for (let day = from; day <= to; day += 1) {
      if (allowed.has(weekdayForDate(parts, day))) candidates.push(day);
    }
    return shuffled(candidates, `${device.deviceId}:${category}:${parts.year}-${parts.month}:${index}`).slice(0, 1);
  });
}

function categoryRunsToday(device, category, frequency, parts) {
  const weekday = WEEKDAYS[parts.weekday];
  if (!enabledDays(device).includes(weekday)) return false;
  if (frequency === 'daily') return true;
  if (frequency === 'weekly' || frequency === 'two_week') {
    return coordinatedWeeklyDays(device, category, frequency, parts).includes(weekday);
  }
  if (frequency === 'monthly_cycle') {
    return selectedMonthlyDays(device, category, parts).includes(Number(parts.day));
  }
  return false;
}

function randomMinute(device, category, parts) {
  const from = parseMinutes(device.schedule?.from, 9 * 60);
  const to = parseMinutes(device.schedule?.to, 21 * 60);
  const start = Math.min(from, to - 1);
  const end = Math.max(to, start + 1);
  const span = end - start;
  return start + Math.floor(randomUnit(`${device.deviceId}:${category}:${dateKey(parts)}:time`) * span);
}

function moveAwayFromCollisions(minute, occupied, from, to) {
  if (!occupied.some(other => Math.abs(other - minute) < MINIMUM_RANDOM_SEPARATION)) return minute;
  for (let offset = MINIMUM_RANDOM_SEPARATION; offset <= to - from; offset += MINIMUM_RANDOM_SEPARATION) {
    const later = minute + offset;
    if (later < to && !occupied.some(other => Math.abs(other - later) < MINIMUM_RANDOM_SEPARATION)) return later;
    const earlier = minute - offset;
    if (earlier >= from && !occupied.some(other => Math.abs(other - earlier) < MINIMUM_RANDOM_SEPARATION)) return earlier;
  }
  return minute;
}

function plansForLocalDay(device, parts, categories) {
  const plans = [];
  const occupied = [];
  const from = parseMinutes(device.schedule?.from, 9 * 60);
  const to = parseMinutes(device.schedule?.to, 21 * 60);

  for (const category of categories) {
    const frequency = device.categories?.[category] || 'off';
    if (!categoryRunsToday(device, category, frequency, parts)) continue;
    const fixedTime = device.fixedTimes?.[category];
    const fixed = Boolean(fixedTime);
    let minute = fixed ? parseMinutes(fixedTime, 10 * 60) : randomMinute(device, category, parts);
    if (!fixed) minute = moveAwayFromCollisions(minute, occupied, Math.min(from, to - 1), Math.max(to, from + 1));
    occupied.push(minute);
    plans.push({
      category,
      dateKey: dateKey(parts),
      fixed,
      minute,
      time: formatMinutes(minute)
    });
  }
  return plans;
}

module.exports = {
  WEEKDAYS,
  categoryRunsToday,
  currentMinute,
  dateKey,
  enabledDays,
  plansForLocalDay,
  selectedMonthlyDays,
  selectedWeeklyDays
};
