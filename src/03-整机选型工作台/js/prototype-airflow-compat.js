(function (root) {
  'use strict';

  const airflowPattern = /^\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(?:m³\/h|m3\/h|m\^3\/h)?\s*$/i;

  function fromLegacy(value) {
    if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
    if (typeof value !== 'string') return null;
    const match = value.match(airflowPattern);
    if (!match) return null;
    const parsed = Number(match[1].replace(/,/g, ''));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function resolve(unit) {
    const conditions = unit?.designConditions;
    if (conditions && Object.prototype.hasOwnProperty.call(conditions, 'airVolume')) return conditions.airVolume?.value ?? '';
    return fromLegacy(unit?.airflow) ?? '';
  }

  const api = Object.freeze({ fromLegacy, resolve });
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AHUPrototypeAirflowCompat = api;
})(typeof window !== 'undefined' ? window : globalThis);
