/**
 * Five Forks Fire Behavior Calculator
 * =====================================
 * 
 * IMPORTANT DISCLAIMER:
 * This is an operational approximation tool for relative fire danger 
 * comparisons. It is NOT a substitute for official fire behavior 
 * predictions using BEHAVE, BehavePlus, FlamMap, or other validated 
 * models. Use for trend analysis and operational planning only.
 * NOT suitable for:
 *   - Tactical fire suppression decisions
 *   - Official burn prescriptions
 *   - Escape route timing calculations
 *   - Legal/liability documentation
 * 
 * METHODOLOGY:
 * - Time-lag drying: Standard NFDRS exponential response model
 * - ROS calculation: Simplified approximation (NOT full Rothermel)
 * - Fuel types: Calibrated to Virginia field conditions
 * 
 * SCIENTIFIC REFERENCES:
 * - Cohen, J.D., & Deeming, J.E. (1985). The National Fire-Danger 
 *   Rating System: basic equations. USDA Forest Service GTR PSW-82.
 * - Rothermel, R.C. (1972). A mathematical model for predicting 
 *   fire spread in wildland fuels. USDA FS Research Paper INT-115.
 * - Scott, J.H., & Burgan, R.E. (2005). Standard fire behavior 
 *   fuel models. USDA Forest Service GTR RMRS-GTR-153.
 * - Anderson, H.E. (1982). Aids to determining fuel models for 
 *   estimating fire behavior. USDA FS GTR INT-122.
 * 
 * Fuel types (calibrated for Virginia):
 *   - pasture_grass: Fast, wind-driven (20 ch/h base)
 *   - hardwood_deadfall: Slower, heavy dead (3.5 ch/h base)
 *   - leaf_pine_litter: Moderate response (6 ch/h base)
 * 
 * Author: James D. Cochran | Five Forks Fire Weather
 * Created: January 2026
 * Version: 1.0-beta (FIELD VALIDATION REQUIRED)
 */

// ========== EMC (Equilibrium Moisture Content) ==========
/**
 * Calculate equilibrium moisture content for dead fuels.
 * Based on operational fire weather approximations.
 * 
 * NOTE: This is a simplified EMC calculation. For higher accuracy,
 * cross-reference with NFDRS EMC tables or Rothermel (1986) formulation.
 * 
 * @param {number} tempF - Air temperature in Fahrenheit
 * @param {number} rh - Relative humidity (0-100%)
 * @returns {number} EMC in percent
 */
function emcPercent(tempF, rh) {
    rh = Math.max(0.0, Math.min(100.0, rh));
    const tC = (tempF - 32.0) * 5.0 / 9.0;
    const r = rh / 100.0;
    
    // Simplified approximation (similar to Simard 1968)
    const emc = r * (4.0 + 0.2 * tC) + (r ** 2) * (0.5 + 0.01 * tC);
    return Math.max(1.0, Math.min(35.0, emc));
}

// ========== Time-lag drying model (NFDRS standard) ==========
/**
 * Update fuel moisture toward EMC using exponential lag response.
 * This is the standard NFDRS time-lag model (Cohen & Deeming 1985).
 * 
 * @param {number} mPrev - Previous moisture content (%)
 * @param {number} emc - Equilibrium moisture content (%)
 * @param {number} dtHours - Time step in hours
 * @param {number} tauHours - Time-lag constant (1, 10, or 100 hours)
 * @returns {number} Updated moisture content (%)
 */
function updateTowardEMC(mPrev, emc, dtHours, tauHours) {
    if (tauHours <= 0) return emc;
    return emc + (mPrev - emc) * Math.exp(-dtHours / tauHours);
}

// ========== Initial moisture from recent rain ==========
/**
 * Estimate starting fuel moisture from recent precipitation.
 * This is a heuristic based on cool-season Virginia conditions.
 * 
 * VALIDATION NEEDED: Compare against actual fuel moisture sampling.
 * 
 * @param {number} rainInches - Recent rainfall in inches
 * @returns {object} Initial moisture values {m1, m10, m100}
 */
function initialMoistureFromRain(rainInches) {
    const r = Math.max(0.0, rainInches);
    
    if (r < 0.10) {
        return { m1: 18.0, m10: 15.0, m100: 14.0 };
    } else if (r < 0.30) {
        return { m1: 22.0, m10: 17.0, m100: 14.5 };
    } else if (r < 0.75) {
        return { m1: 26.0, m10: 20.0, m100: 16.0 };
    } else {
        return { m1: 30.0, m10: 25.0, m100: 20.0 };
    }
}

// ========== Fuel Presets (Five Forks specific) ==========
/**
 * Fuel type parameters calibrated to Five Forks District observations.
 * 
 * CALIBRATION STATUS: Initial estimates - field validation in progress.
 * 
 * baseROS: Rate of spread (chains/hour) at reference conditions:
 *   - 1-hr moisture: 9%
 *   - Wind: 5 mph at 20-ft
 *   - Slope: 0%
 * 
 * windSensitivity: How strongly wind increases ROS (higher = more wind-driven)
 * moistureSensitivity: How strongly moisture suppresses ROS (higher = more affected)
 */
const FUEL_PRESETS = {
    pasture_grass: {
        name: 'Pasture Grass',
        description: 'Cured grass, highly wind-driven',
        baseROS: 20.0,              // Similar to Scott & Burgan FM 101
        windSensitivity: 1.30,       // High wind response
        moistureSensitivity: 1.70    // Very moisture-dependent
    },
    hardwood_deadfall: {
        name: 'Hardwood Dead Fall',
        description: 'Heavy dead branches, shaded litter',
        baseROS: 3.5,                // Similar to Scott & Burgan FM 121-124
        windSensitivity: 0.55,       // Low wind coupling
        moistureSensitivity: 1.30    // Moderate moisture effect
    },
    leaf_pine_litter: {
        name: 'Leaf & Pine Litter',
        description: 'Mixed hardwood/pine forest floor',
        baseROS: 6.0,                // Similar to Anderson Model 8-9
        windSensitivity: 0.85,       // Moderate wind response
        moistureSensitivity: 1.40    // Moderate moisture effect
    }
};

// ========== ROS Components (Simplified Approximations) ==========
/**
 * WARNING: These are NOT the full Rothermel equations.
 * They are operational approximations for relative comparisons.
 */

function moistureMultiplier(m1, mRef, k) {
    // Exponential moisture damping (simplified from Rothermel's polynomial)
    const mult = Math.exp(-k * (m1 - mRef) / 10.0);
    return Math.max(0.05, Math.min(2.5, mult));
}

function windMultiplier(windMph, sensitivity) {
    // NOTE: Using 20-ft wind directly (Rothermel uses midflame wind)
    // For more accuracy, multiply input wind by 0.4 before this function
    windMph = Math.max(0.0, windMph);
    const w = Math.max(0.0, windMph - 5.0);
    const mult = 1.0 + sensitivity * Math.pow(w / 25.0, 1.15);
    return Math.max(0.5, Math.min(4.0, mult));
}

function slopeMultiplier(slopePct) {
    // Simple slope effect (linear approximation)
    slopePct = Math.max(0.0, slopePct);
    const mult = 1.0 + 0.02 * slopePct;
    return Math.max(1.0, Math.min(2.5, mult));
}

/**
 * Calculate rate of spread (operational approximation).
 * 
 * @param {object} fuel - Fuel preset from FUEL_PRESETS
 * @param {number} m1 - 1-hour fuel moisture (%)
 * @param {number} windMph - Wind speed at 20-ft (mph)
 * @param {number} slopePct - Slope percent (0-100)
 * @returns {number} Rate of spread in chains/hour
 */
function rosChPerHour(fuel, m1, windMph, slopePct = 0.0) {
    const mRef = 9.0;  // Reference moisture for "dry baseline"
    const mm = moistureMultiplier(m1, mRef, fuel.moistureSensitivity);
    const wm = windMultiplier(windMph, fuel.windSensitivity);
    const sm = slopeMultiplier(slopePct);
    const ros = fuel.baseROS * mm * wm * sm;
    return Math.max(0.1, ros);
}

/**
 * Convert chains per hour to feet per minute.
 * 1 chain = 66 feet, 1 hour = 60 minutes
 */
function chPerHourToFtPerMin(chph) {
    return chph * 66.0 / 60.0;
}

// ========== 24-hour drying simulation ==========
/**
 * Simulate dead fuel drying over 24 hours with day/night weather.
 * 
 * @param {number} dayTempF - Daytime high temperature (F)
 * @param {number} dayRHmin - Daytime minimum RH (%)
 * @param {number} nightTempF - Nighttime low temperature (F)
 * @param {number} nightRHmax - Nighttime maximum RH (%)
 * @param {number} rainInches - Recent rainfall (inches)
 * @param {number} windMph - Wind speed (mph)
 * @param {string} fuelType - Fuel preset key
 * @returns {object} Hourly results and summary statistics
 */
function simulate24HourDrying(dayTempF, dayRHmin, nightTempF, nightRHmax, rainInches, windMph, fuelType = 'leaf_pine_litter') {
    const fuel = FUEL_PRESETS[fuelType];
    if (!fuel) return null;
    
    // Get initial moisture from rain
    const initial = initialMoistureFromRain(rainInches);
    let m1 = initial.m1;
    let m10 = initial.m10;
    let m100 = initial.m100;
    
    const results = [];
    
    // Day period (10 hours at max temp, min RH)
    for (let h = 0; h < 10; h++) {
        const emc = emcPercent(dayTempF, dayRHmin);
        m1 = updateTowardEMC(m1, emc, 1.0, 1.0);
        m10 = updateTowardEMC(m10, emc, 1.0, 10.0);
        m100 = updateTowardEMC(m100, emc, 1.0, 100.0);
        
        const ros = rosChPerHour(fuel, m1, windMph, 0.0);
        results.push({
            hour: h,
            period: 'day',
            emc: emc.toFixed(1),
            m1: m1.toFixed(1),
            m10: m10.toFixed(1),
            m100: m100.toFixed(1),
            rosChPerHour: ros.toFixed(2),
            rosFtPerMin: chPerHourToFtPerMin(ros).toFixed(2)
        });
    }
    
    // Night period (14 hours at min temp, max RH)
    for (let h = 10; h < 24; h++) {
        const emc = emcPercent(nightTempF, nightRHmax);
        m1 = updateTowardEMC(m1, emc, 1.0, 1.0);
        m10 = updateTowardEMC(m10, emc, 1.0, 10.0);
        m100 = updateTowardEMC(m100, emc, 1.0, 100.0);
        
        const ros = rosChPerHour(fuel, m1, windMph, 0.0);
        results.push({
            hour: h,
            period: 'night',
            emc: emc.toFixed(1),
            m1: m1.toFixed(1),
            m10: m10.toFixed(1),
            m100: m100.toFixed(1),
            rosChPerHour: ros.toFixed(2),
            rosFtPerMin: chPerHourToFtPerMin(ros).toFixed(2)
        });
    }
    
    // Find minimum m1 (most critical period)
    const minM1Result = results.reduce((min, cur) => 
        parseFloat(cur.m1) < parseFloat(min.m1) ? cur : min
    );
    
    return {
        hourly: results,
        summary: {
            minM1Hour: minM1Result.hour,
            minM1Value: minM1Result.m1,
            maxROSchPerHour: minM1Result.rosChPerHour,
            maxROSFtPerMin: minM1Result.rosFtPerMin,
            endOfDayM1: results[9].m1,
            endOf24hM1: results[23].m1,
            fuelType: fuel.name
        }
    };
}

// ========== Quick calculation for current conditions ==========
/**
 * Calculate fire behavior for current weather conditions.
 * 
 * @param {number} tempF - Current temperature (F)
 * @param {number} rh - Current relative humidity (%)
 * @param {number} windMph - Current wind speed (mph)
 * @param {string} fuelType - Fuel preset key
 * @param {number} initialM1 - Starting 1-hr moisture (%)
 * @returns {object} Fire behavior metrics and danger level
 */
function calculateFireBehavior(tempF, rh, windMph, fuelType = 'leaf_pine_litter', initialM1 = 15.0) {
    const fuel = FUEL_PRESETS[fuelType];
    if (!fuel) return null;
    
    const emc = emcPercent(tempF, rh);
    const m1
