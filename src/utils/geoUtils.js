/**
 * Valida se as coordenadas latitude e longitude são números reais finitos 
 * e se estão dentro dos limites geográficos padrão.
 * 
 * @param {number} lat - Latitude (deve estar entre -90 e 90)
 * @param {number} lng - Longitude (deve estar entre -180 e 180)
 * @returns {boolean} True se válidas, False caso contrário.
 */
const isValidCoord = (lat, lng) => {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
         Number.isFinite(lng) && lng >= -180 && lng <= 180;
};

module.exports = { isValidCoord };
