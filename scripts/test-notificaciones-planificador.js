'use strict';

const assert = require('node:assert/strict');
const {
  plansForLocalDay,
  selectedMonthlyDays,
  selectedWeeklyDays
} = require('./notificaciones-planificador');

const device = {
  deviceId: 'device-test',
  categories: { wordOfLife: 'monthly_cycle', passphrase: 'two_week', meditation: 'weekly' },
  schedule: { days: [1, 2, 3, 4, 5], from: '09:00', to: '21:00' },
  fixedTimes: {}
};
const parts = { year: '2026', month: '07', day: '30', weekday: 'Thu', hour: '12', minute: '00' };

assert.deepEqual(
  selectedWeeklyDays(device, 'passphrase', 'two_week', parts),
  selectedWeeklyDays(device, 'passphrase', 'two_week', parts),
  'La selección semanal debe ser estable.'
);
assert.equal(selectedWeeklyDays(device, 'passphrase', 'two_week', parts).length, 2);
assert.equal(selectedMonthlyDays(device, 'wordOfLife', parts).length, 3);

const dailyDevice = {
  ...device,
  categories: { passphrase: 'daily', meditation: 'daily' }
};
const dailyPlans = plansForLocalDay(dailyDevice, parts, ['passphrase', 'meditation']);
assert.equal(dailyPlans.length, 2);
assert.ok(dailyPlans.every(plan => plan.minute >= 9 * 60 && plan.minute < 21 * 60));
assert.ok(Math.abs(dailyPlans[0].minute - dailyPlans[1].minute) >= 90);

const weeklyPassphraseDays = selectedWeeklyDays(device, 'passphrase', 'two_week', parts);
const weeklyMeditationPlans = [1, 2, 3, 4, 5].filter(weekday => {
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return plansForLocalDay(device, { ...parts, weekday: weekdayNames[weekday] }, ['meditation']).length > 0;
});
assert.ok(
  weeklyMeditationPlans.every(day => !weeklyPassphraseDays.includes(day)),
  'Meditación debe usar días distintos de Pasapalabra cuando haya disponibilidad.'
);

const fixedDevice = {
  ...dailyDevice,
  fixedTimes: { passphrase: '07:30' }
};
const fixedPlan = plansForLocalDay(fixedDevice, parts, ['passphrase'])[0];
assert.equal(fixedPlan.time, '07:30', 'La hora fija debe ignorar la franja general.');
assert.equal(fixedPlan.fixed, true);

console.log('Planificador de notificaciones verificado.');
