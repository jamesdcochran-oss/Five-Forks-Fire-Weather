/*
  fuel-calculator.js
  Standalone fuel moisture calculator (EMC + time-lag model)
  - Defensive parsing and validation
  - Works in browser (global FuelMoistureCalculator), Node (module.exports), Deno/Bun
  - Safe to include on pages that do not include the calculator UI (no DOM assumptions)
*/

/* eslint-disable no-var */
(function universalFuelCalculator(root) {
  'use strict';

  // ---------- Utility helpers ----------
  function isFiniteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }

  function safeParse(value, fallback = 0) {
    // Accept numbers or numeric strings; preserve 0
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return fallback;
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : fallback;
    }
    // fallback for other types
    return fallback;
  }

  function clamp(v, min, max) {
    const n = safeParse(v, min);
    return Math.min(max, Math.max(min, n));
  }

  function round1(v) {
    return Number(Number(v).toFixed(1));
  }

  // ---------- Calculator core ----------
  // Equilibrium Moisture Content (EMC) calculation (empirical approximation)
  // EMC = 0.942 × RH^0.679 + 11 × e^((RH-100)/10) + 0.18 × (21.1 - T) × (1 - e^(-0.115×RH))
  // Inputs: tempF (°F), rh (%) — outputs EMC in percent (one decimal, min 0.1)
  function computeEMC(tempF, rh) {
    const T = safeParse(tempF, 70); // °F
    const H = clamp(rh, 0, 100);

    // Convert to numeric safe values
    const term1 = 0.942 * Math.pow(H, 0.679);
    const term2 = 11 * Math.exp((H - 100) / 10);
    const term3 = 0.18 * (21.1 - (T - 32) * (5 / 9)) * (1 - Math.exp(-0.115 * H));
    // Note: formula mixes C in the original form; we convert T to C for term3 calculation
    let emc = term1 + term2 + term3;

    // Defensive bounds: EMC should be >= 0.1 and realistically below 100
    if (!Number.isFinite(emc) || emc < 0.1) emc = 0.1;
    if (emc > 100) emc = 100;

    return round1(emc);
  }

  // Exponential time-lag model
  // M(t) = EMC + (M0 - EMC) * exp(-t / tau)
  // initial: initial moisture (%), emc: equilibrium moisture (%), hours: t, timeLag: tau
  function stepMoisture(initial, emc, hours, timeLag) {
    const M0 = safeParse(initial, safeParse(emc, 5));
    const E = safeParse(emc, 5);
    const t = Math.max(0, safeParse(hours, 0));
    const tau = Math.max(0.0001, safeParse(timeLag, 1)); // avoid division by zero
    const k = Math.exp(-t / tau);
    const result = E + (M0 - E) * k;
    return round1(result);
  }

  // Run multi-day model
  // initial1hr, initial10hr: starting moisture %
  // forecastEntries: [{ label?, temp, rh, wind?, hours? }, ...]
  function runModel(initial1hr, initial10hr, forecastEntries) {
    const start1 = safeParse(initial1hr, 8);
    const start10 = safeParse(initial10hr, 10);

    const results = {
      initial1hr: start1,
      initial10hr: start10,
      dailyResults: [],
      summary: {
        firstCritical1HrDay: null,
        final1Hr: start1,
        final10Hr: start10
      }
    };

    const entries = Array.isArray(forecastEntries) ? forecastEntries : [];

    let prev1 = start1;
    let prev10 = start10;

    entries.forEach((day, idx) => {
      const temp = safeParse(day && day.temp, 70);
      const rh = clamp(day && day.rh, 0, 100);
      // wind currently not used by model but preserved for reporting
      const wind = safeParse(day && day.wind, 0);
      const hours = Math.max(0, safeParse(day && day.hours, 12));

      const emc = computeEMC(temp, rh);

      const m1 = stepMoisture(prev1, emc, hours, 1);
      const m10 = stepMoisture(prev10, emc, hours, 10);

      const label = (day && day.label) || `Day ${idx + 1}`;

      results.dailyResults.push({
        day: label,
        temp,
        rh,
        wind,
        hours,
        emc,
        moisture1Hr: m1,
        moisture10Hr: m10
      });

      prev1 = m1;
      prev10 = m10;
    });

    // summary fields
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

  // ---------- Small helpers ----------
  function celsiusToFahrenheit(c) {
    return round1(safeParse(c, 0) * 9 / 5 + 32);
  }
  function fahrenheitToCelsius(f) {
    return round1((safeParse(f, 32) - 32) * 5 / 9);
  }

  // ---------- UI wiring (safe to include on any page) ----------
  // IDs used by modal/UI:
  // forecastDays (table body), initial1hr, initial10hr, runModelBtn, resultsSection, resultsTable, warningMessage
  function populateDefaultForecastTable(rows = 5) {
    const tbody = document.getElementById('forecastDays');
    if (!tbody) return;
    tbody.innerHTML = '';
    for (let i = 0; i < rows; i++) {
      const tempVal = 60 + i * 5;
      const rhVal = Math.max(5, 80 - i * 8);
      const windVal = 5 + i;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>Day ${i + 1}</td>
        <td><input type="number" class="fc-temp" value="${tempVal}" step="1" min="-50" max="150" style="width:4.2rem"></td>
        <td><input type="number" class="fc-rh" value="${rhVal}" step="1" min="0" max="100" style="width:4.2rem"></td>
        <td><input type="number" class="fc-wind" value="${windVal}" step="1" min="0" max="200" style="width:4.2rem"></td>
        <td><input type="number" class="fc-hours" value="12" step="1" min="0" max="48" style="width:4.2rem"></td>
      `;
      tbody.appendChild(tr);
    }
  }

  function readForecastTable() {
    const tbody = document.getElementById('forecastDays');
    if (!tbody) return [];
    const rows = Array.from(tbody.querySelectorAll('tr'));
    return rows.map((tr, idx) => {
      const tempInput = tr.querySelector('.fc-temp')?.value ?? '';
      const rhInput = tr.querySelector('.fc-rh')?.value ?? '';
      const windInput = tr.querySelector('.fc-wind')?.value ?? '';
      const hoursInput = tr.querySelector('.fc-hours')?.value ?? '';
      return {
        label: `Day ${idx + 1}`,
        temp: safeParse(tempInput, 70),
        rh: clamp(rhInput, 0, 100),
        wind: safeParse(windInput, 0),
        hours: Math.max(0, safeParse(hoursInput, 12))
      };
    });
  }

  function showResults(results) {
    const resultsSection = document.getElementById('resultsSection');
    const resultsTable = document.getElementById('resultsTable');
    const warningMessage = document.getElementById('warningMessage');
    if (!resultsSection || !resultsTable) return;

    resultsSection.style.display = 'block';
    let html = '<table style="width:100%;border-collapse:collapse;"><thead><tr style="text-align:left"><th>Day</th><th>Temp°F</th><th>Min RH%</th><th>1-hr%</th><th>10-hr%</th></tr></thead><tbody>';
    results.dailyResults.forEach(r => {
      html += `<tr>
        <td style="padding-right:.5rem">${escapeHtml(String(r.day))}</td>
        <td>${r.temp}</td>
        <td>${r.rh}</td>
        <td>${r.moisture1Hr}%</td>
        <td>${r.moisture10Hr}%</td>
      </tr>`;
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

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  function wireUI() {
    // Populate forecast inputs if present
    populateDefaultForecastTable(5);

    const runBtn = document.getElementById('runModelBtn');
    if (runBtn) {
      runBtn.addEventListener('click', () => {
        const initial1Input = document.getElementById('initial1hr')?.value ?? '';
        const initial10Input = document.getElementById('initial10hr')?.value ?? '';
        const initial1 = safeParse(initial1Input, 8);
        const initial10 = safeParse(initial10Input, 10);
        const forecast = readForecastTable();
        try {
          const results = runModel(initial1, initial10, forecast);
          showResults(results);
          // Also emit a console log for debugging
          if (typeof console !== 'undefined' && console.log) console.log('Fuel model results:', results);
        } catch (err) {
          console.error('Fuel model error', err);
        }
      });
    }

    // In case the modal provides a close button with id 'modalCloseBtn', let it hide the modal
    const modalClose = document.getElementById('modalCloseBtn');
    if (modalClose) modalClose.addEventListener('click', () => {
      const modal = document.getElementById('fuelCalcModal');
      if (modal) modal.style.display = 'none';
    });
  }

  // ---------- Expose API ----------
  const API = {
    computeEMC,
    stepMoisture,
    runModel,
    populateDefaultForecastTable,
    readForecastTable,
    showResults,
    wireUI,
    celsiusToFahrenheit,
    fahrenheitToCelsius,
    safeParse,
    clamp
  };

  // Browser global
  try {
    if (typeof window !== 'undefined') {
      // attach a single namespace
      window.FuelMoistureCalculator = window.FuelMoistureCalculator || {};
      Object.assign(window.FuelMoistureCalculator, API);
    }
  } catch (e) {
    // ignore
  }

  // Node / CommonJS export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  }

  // Deno / ESM: export named if supported (best-effort; consumers can import the file)
  if (typeof root !== 'undefined') {
    // nothing extra needed; root is the global object passed in by the IIFE
  }

  // Auto-wire when DOM is ready (safe-guarded)
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        try { wireUI(); } catch (e) { /* ignore wiring errors */ }
      });
    } else {
      try { wireUI(); } catch (e) { /* ignore wiring errors */ }
    }
  }

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
