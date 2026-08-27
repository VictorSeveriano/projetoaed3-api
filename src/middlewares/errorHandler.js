const AppError = require('../utils/AppError');

/**
 * Middleware global de tratamento de erros.
 * Captura todos os erros lancados na aplicacao.
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Erro interno do servidor';

  if (err.isOperational) {
    return res.status(statusCode).json({ success: false, message });
  }

  console.error('[ERROR]', err);
  return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
};

module.exports = errorHandler;
