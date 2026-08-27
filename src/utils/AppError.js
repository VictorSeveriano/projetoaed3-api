/**
 * Classe de erro customizado da aplicacao.
 * Permite diferenciar erros operacionais de erros de programacao.
 */
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
