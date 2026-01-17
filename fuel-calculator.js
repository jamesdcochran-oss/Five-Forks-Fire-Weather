/*
  fuel-calculator.js
  - Robust, standalone fuel moisture calculator
  - Defensive input parsing, safe DOM wiring, consistent namespace
  - Exposes window.FuelMoistureCalculator and CommonJS module.exports
*/

(function(root){
  'use strict';

  // ---------- Utilities ----------
  function isFiniteNumber(n){ return typeof n === 'number' && Number.isFinite(n); }

  function safeParse(value, fallback = 0) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    if (typeof value === 'string') {
      const t = value.trim();
      if (t === '') return fallback;
      const n = Number(t);
      return Number.isFinite(n) ? n : fallback;
    }
    // try valueOf for weird objects
    try {
      const v = Number(value.valueOf && value.valueOf());
      return Number.isFinite(v) ? v : fallback;
    } catch(e) { return fallback; }
  }

  function clamp(v, min, max){
    const n = safeParse(v, min);
    return Math.min(max, Math.max(min, n));
  }

  function round1(n){ return Number(Number(n).toFixed(1)); }

  // ---------- Core calculations ----------
  // computeEMC: uses Celsius in the (21.1 - T) term (convert from °F -> °C)
  function computeEMC(tempF, rh){
    const T_f = safeParse(tempF, 70);
    const T_c = (T_f - 32) * 5 / 9;
    const H = clamp(rh, 0, 100);

    const term1 = 0.942 * Math.pow(H, 0.679);
    const term2 = 11 * Math.exp((H - 100) / 10);
    const term3 = 0.18 * (21.1 - T_c) * (1 - Math.exp(-0.115 * H));

    let emc = term1 + term2 + term3;
    if (!Number.isFinite(emc) || emc < 0.1) emc = 0.1;
    if (emc > 100) emc = 100;
    return round1(emc);
  }

  // exponential time-lag model
  function stepMoisture(initial, emc, hours, timeLag){
    const m0 = safeParse(initial, safeParse(emc, 5));
    const e = safeParse(emc, 5);
    const h = Math.max(0, safeParse(hours, 0));
    const tau = Math.max(0.0001, safeParse(timeLag, 1));
    const k = Math.exp(-h / tau);
    return round1(e + (m0 - e) * k);
  }

  // runModel over multiple forecast entries
  function runModel(initial1hr, initial10hr, forecastEntries){
    const i1 = safeParse(initial1hr, 8);
    const i10 = safeParse(initial10hr, 10);
    const results = { initial1hr: i1, initial10hr: i10, dailyResults: [], summary: {} };
    let prev1 = i1, prev10 = i10;
    const entries = Array.isArray(forecastEntries) ? forecastEntries : [];

    entries.forEach((day, i) => {
      const temp = safeParse(day?.temp, 70);
      const rh = clamp(day?.rh, 0, 100);
      const wind = safeParse(day?.wind, 0);
      const hours = Math.max(0, safeParse(day?.hours, 12));

      const emc = computeEMC(temp, rh);
      const m1 = stepMoisture(prev1, emc, hours, 1);
      const m10 = stepMoisture(prev10, emc, hours, 10);

      results.dailyResults.push({
        day: day?.label || `Day ${i+1}`,
        temp, rh, wind, hours, emc, moisture1Hr: m1, moisture10Hr: m10
      });

      prev1 = m1; prev10 = m10;
    });

    const critIdx = results.dailyResults.findIndex(d => Number.isFinite(d.moisture1Hr) && d.moisture1Hr <= 6);
    results.summary.firstCritical1HrDay = critIdx >= 0 ? results.dailyResults[critIdx].day : null;
    if (results.dailyResults.length) {
      const last = results.dailyResults[results.dailyResults.length - 1];
      results.summary.final1Hr = last.moisture1Hr;
      results.summary.final10Hr = last.moisture10Hr;
    } else {
      results.summary.final1Hr = prev1;
      results.summary.final10Hr = prev10;
    }
    return results;
  }

  // ---------- UI helpers (safe) ----------
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])); }

  function populateDefaultForecastTable(rows = 5){
    const tbody = document.getElementById('forecastDays');
    if (!tbody) return;
    tbody.innerHTML = '';
    for (let i = 0; i < rows; i++){
      const tempVal = 60 + i * 5;
      const rhVal = Math.max(5, 80 - i * 8);
      const windVal = 5 + i;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>Day ${i+1}</td>
        <td><input type="number" class="fc-temp" value="${tempVal}" step="1" min="-50" max="150" style="width:4.2rem"></td>
        <td><input type="number" class="fc-rh" value="${rhVal}" step="1" min="0" max="100" style="width:4.2rem"></td>
        <td><input type="number" class="fc-wind" value="${windVal}" step="1" min="0" max="200" style="width:4.2rem"></td>
        <td><input type="number" class="fc-hours" value="12" step="1" min="0" max="48" style="width:4.2rem"></td>
      `;
      tbody.appendChild(tr);
    }
  }

  function readForecastTable(){
    const tbody = document.getElementById('forecastDays'); if (!tbody) return [];
    const rows = Array.from(tbody.querySelectorAll('tr'));
    return rows.map((tr, idx) => {
      const tempInput = tr.querySelector('.fc-temp')?.value ?? '';
      const rhInput = tr.querySelector('.fc-rh')?.value ?? '';
      const windInput = tr.querySelector('.fc-wind')?.value ?? '';
      const hoursInput = tr.querySelector('.fc-hours')?.value ?? '';
      return {
        label: `Day ${idx+1}`,
        temp: safeParse(tempInput, 70),
        rh: clamp(rhInput, 0, 100),
        wind: safeParse(windInput, 0),
        hours: Math.max(0, safeParse(hoursInput, 12))
      };
    });
  }

  function showResults(results){
    const resultsSection = document.getElementById('resultsSection');
    const resultsTable = document.getElementById('resultsTable');
    const warningMessage = document.getElementById('warningMessage');
    if (!resultsSection || !resultsTable) return;
    resultsSection.style.display = 'block';
    let html = '<table><thead><tr><th>Day</th><th>Temp°F</th><th>Min RH%</th><th>1-hr%</th><th>10-hr%</th></tr></thead><tbody>';
    results.dailyResults.forEach(r => {
      html += `<tr><td>${escapeHtml(String(r.day))}</td><td>${r.temp}</td><td>${r.rh}</td><td>${r.moisture1Hr}%</td><td>${r.moisture10Hr}%</td></tr>`;
    });
    html += '</tbody></table>';
    resultsTable.innerHTML = html;

    if (!warningMessage) return;
    if (results.summary && results.summary.firstCritical1HrDay) {
      warningMessage.style.display = 'block';
      warningMessage.textContent = `⚠️ Critical drying detected first on ${results.summary.firstCritical1HrDay}`;
    } else {
      warningMessage.style.display = 'none';
      warningMessage.textContent = '';
    }
  }

  function wireUI(){
    // idempotent wiring: check dataset flags to avoid double handlers
    populateDefaultForecastTable(5);

    const runBtn = document.getElementById('runModelBtn');
    if (runBtn && !runBtn.dataset.wired) {
      runBtn.addEventListener('click', () => {
        const initial1Input = document.getElementById('initial1hr')?.value ?? '';
        const initial10Input = document.getElementById('initial10hr')?.value ?? '';
        const initial1 = safeParse(initial1Input, 8);
        const initial10 = safeParse(initial10Input, 10);
        const forecast = readForecastTable();
        try {
          const results = runModel(initial1, initial10, forecast);
          showResults(results);
          if (typeof console !== 'undefined' && console.log) console.log('Fuel model results:', results);
        } catch (err) { console.error('Fuel model error', err); }
      });
      runBtn.dataset.wired = '1';
    }

    const modalClose = document.getElementById('modalCloseBtn');
    if (modalClose && !modalClose.dataset.wired) {
      modalClose.addEventListener('click', () => {
        const modal = document.getElementById('fuelCalcModal');
        if (modal) { modal.setAttribute('aria-hidden','true'); modal.style.display = 'none'; }
      });
      modalClose.dataset.wired = '1';
    }
  }

  // ---------- Expose API ----------
  const API = {
    computeEMC, stepMoisture, runModel,
    populateDefaultForecastTable, readForecastTable, showResults, wireUI,
    safeParse, clamp
  };

  // Browser global namespace
  if (typeof window !== 'undefined') {
    window.FuelMoistureCalculator = window.FuelMoistureCalculator || {};
    Object.assign(window.FuelMoistureCalculator, API);
  }

  // CommonJS export for tests
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  }

  // Auto-wire UI elements if page contains them (safe-guarded)
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { try { wireUI(); } catch (e) { /* ignore */ } });
    } else {
      try { wireUI(); } catch (e) { /* ignore */ }
    }
  }

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
