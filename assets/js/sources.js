// Override-ready source registry

export const SOURCES = {
  // Weather Underground PWS pages (anchors for current obs)
  wunderground: {
    amelia: "https://www.wunderground.com/weather/us/va/amelia-court-house",
    dinwiddie: "https://www.wunderground.com/weather/us/va/dinwiddie",
    emporia: "https://www.wunderground.com/weather/us/va/emporia",
    princeGeorge: "https://www.wunderground.com/weather/us/va/prince-george",
  },
  // NWS AKQ products and alerts (CAP/XML/JSON endpoints)
  nws: {
    office: "AKQ",
    homepage: "https://www.weather.gov/akq/",
    alertsApi: "https://api.weather.gov/alerts/active?area=VA", // filter client-side for AKQ counties
    fireWeatherFWF: "https://forecast.weather.gov/product.php?site=NWS&issuedby=AKQ&product=FWF&format=CI&version=1&glossary=1&highlight=off",
  },
  // Context layers
  drought: "https://droughtmonitor.unl.edu/CurrentMap/StateDroughtMonitor.aspx?VA",
  landfire: "https://www.landfire.gov/viewer/",
  wfas: "https://www.wfas.net/index.php?option=com_content&view=article&id=86&Itemid=487",
  // Hotspots (replace if you prefer offline assets)
  firms: "https://firms.modaps.eosdis.nasa.gov/api/area/csv", // placeholder (requires token); alternatively ship daily geojson
};
