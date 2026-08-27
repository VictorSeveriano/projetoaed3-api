const AppError = require('../utils/AppError');

/**
 * Factory para validacao de campos obrigatorios no body da requisicao.
 */
const validateFields = (fields) => {
  return (req, res, next) => {
    const missing = fields.filter((field) => {
      const value = req.body[field];
      return value === undefined || value === null || value === '';
    });

    if (missing.length > 0) {
      return next(new AppError(`Campos obrigatorios ausentes: ${missing.join(', ')}`, 400));
    }

    next();
  };
};

module.exports = { validateFields };
