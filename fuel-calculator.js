/* fuel-calculator.js
   Minimal, robust fuel moisture calculator used by index.html and fuel-calculator-test.html
   - computeEMC(tempF, rh): empirical approximation used in many fire-weather tools
   - stepMoisture(initial, emc, hours, timeLag): exponential time-lag model
   - runModel(...) + DOM wiring to populate forecast rows and run the model
   Defensive: only runs UI wiring when expected elements exist.
*/

(function(global){
  'use strict';

  // Compute Equilibrium Moisture Content (EMC) %
  // Empirical approximation (commonly used form)
  function computeEMC(tempF, rh) {
    const T = Number(tempF);
    const RH = Math.max(0, Math.min(100, Number(rh)));
    // Empirical approximation (common form used in many tools)
    const emc = 0.942 * Math.pow(RH, 0.679) +
                11 * Math.exp((RH - 100) / 10) +
                0.18 * (21.1 - T) * (1 - Math.exp(-0.115 * RH));
    return Math.max(0.1, Number(emc.toFixed(1)));
  }

  // Time-lag drying/wetting model:
  // m_t = EMC + (m0 - EMC) * exp(-hours / timeLag)
  function stepMoisture(initial, emc, hours, timeLag) {
    const k = Math.exp(-hours / Math.max(0.0001, timeLag));
    return Number((emc + (initial - emc) * k).toFixed(1));
  }

  // Run model over forecast days (forecastEntries: [{temp, rh, wind, hours}])
  function runModel(initial1hr, initial10hr, forecastEntries) {
    const results = {
      initial1hr: Number(initial1hr),
      initial10hr: Number(initial10hr),
      dailyResults: [],
      summary: {}
    };

    let prev1 = Number(initial1hr);
    let prev10 = Number(initial10hr);

    forecastEntries.forEach((day, i) => {
      const emc = computeEMC(day.temp, day.rh);
      const hours = day.hours || 12;
      const m1 = stepMoisture(prev1, emc, hours, 1);
      const m10 = stepMoisture(prev10, emc, hours, 10);

      results.dailyResults.push({
        day: day.label || (`Day ${i+1}`),
        temp: day.temp,
        rh: day.rh,
        wind: day.wind || 0,
        hours: hours,
        moisture1Hr: m1,
        moisture10Hr: m10
      });

      prev1 = m1;
      prev10 = m10;
    });

    const critIndex = results.dailyResults.findIndex(r => r.moisture1Hr <= 6);
    results.summary.firstCritical1HrDay = critIndex >= 0 ? results.dailyResults[critIndex].day : null;

    return results;
  }

  /* UI helpers: these will run only if the page contains the expected elements.
     Keeps the file safe to include everywhere.
  */
  function populateDefaultForecastTable(rows = 5) {
    const tbody = document.getElementById('forecastDays');
    if (!tbody) return;
    tbody.innerHTML = '';
    for (let i = 0; i < rows; i++) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>Day ${i+1}</td>
        <td><input type="number" class="fc-temp" value="${60 + i}" step="1" min="-20" max="130"></td>
        <td><input type="number" class="fc-rh" value="${60 - i*5}" step="1" min="0" max="100"></td>
        <td><input type="number" class="fc-wind" value="${5 + i}" step="1" min="0" max="100"></td>
        <td><input type="number" class="fc-hours" value="12" step="1" min="0" max="24"></td>
      `;
      tbody.appendChild(tr);
    }
  }

  function readForecastTable() {
    const tbody = document.getElementById('forecastDays');
    if (!tbody) return [];
    const rows = Array.from(tbody.querySelectorAll('tr'));
    return rows.map((tr, idx) => {
      const temp = Number(tr.querySelector('.fc-temp')?.value || 70);
      const rh = Number(tr.querySelector('.fc-rh')?.value || 50);
      const wind = Number(tr.querySelector('.fc-wind')?.value || 5);
      const hours = Number(tr.querySelector('.fc-hours')?.value || 12);
      return { label: `Day ${idx+1}`, temp, rh, wind, hours };
    });
  }

  function showResults(results) {
    const resultsSection = document.getElementById('resultsSection');
    const resultsTable = document.getElementById('resultsTable');
    const warningMessage = document.getElementById('warningMessage');
    if (!resultsSection || !resultsTable) return;

    resultsSection.style.display = 'block';
    let html = '<table><thead><tr><th>Day</th><th>Temp°F</th><th>Min RH%</th><th>1-hr%</th><th>10-hr%</th></tr></thead><tbody>';
    results.dailyResults.forEach(r => {
      html += `<tr>
        <td>${r.day}</td><td>${r.temp}</td><td>${r.rh}</td>
        <td>${r.moisture1Hr}%</td><td>${r.moisture10Hr}%</td>
      </tr>`;
    });
    html += '</tbody></table>';
    resultsTable.innerHTML = html;

    if (warningMessage) {
      if (results.summary.firstCritical1HrDay) {
        warningMessage.style.display = 'block';
        warningMessage.textContent = `⚠️ Critical drying detected first on ${results.summary.firstCritical1HrDay}`;
      } else {
        warningMessage.style.display = 'none';
        warningMessage.textContent = '';
      }
    }
  }

  function wireUI() {
    populateDefaultForecastTable(5);

    const runBtn = document.getElementById('runModelBtn');
    if (runBtn) {
      runBtn.addEventListener('click', () => {
        const initial1 = Number(document.getElementById('initial1hr')?.value || 8);
        const initial10 = Number(document.getElementById('initial10hr')?.value || 10);
        const forecast = readForecastTable();
        try {
          const results = runModel(initial1, initial10, forecast);
          showResults(results);
          console.log('Fuel model results:', results);
        } catch (err) {
          console.error('Fuel model error', err);
        }
      });
    }

    const modalClose = document.getElementById('modalCloseBtn');
    if (modalClose) modalClose.addEventListener('click', () => {
      const modal = document.getElementById('fuelCalcModal');
      if (modal) modal.style.display = 'none';
    });
  }

  // Expose API for tests/pages
  global.computeEMC = computeEMC;
  global.stepMoisture = stepMoisture;
  global.runModel = runModel;

  // On DOM ready, wire UI (safe-guarded)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireUI);
  } else {
    wireUI();
  }

})(window);
