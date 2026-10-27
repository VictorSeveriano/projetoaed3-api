const AppError = require('../utils/AppError');

const CODIGOS_PRISMA_INDISPONIBILIDADE = new Set([
  'P1000',
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
]);

const ehIndisponibilidadeDeBanco = (err) =>
  Boolean(err) &&
  (CODIGOS_PRISMA_INDISPONIBILIDADE.has(err.code) ||
    err.name === 'PrismaClientInitializationError');

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

  if (ehIndisponibilidadeDeBanco(err)) {
    console.error(
      '[ERROR] Banco de dados indisponivel:',
      err.code || err.name,
      err.message ? String(err.message).split('\n').pop() : ''
    );
    return res.status(503).json({
      success: false,
      message: 'Servico temporariamente indisponivel. Tente novamente em instantes.',
    });
  }

  console.error('[ERROR]', err);
  return res.status(500).json({ success: false, message: 'Erro interno do servidor' });
};

module.exports = errorHandler;
