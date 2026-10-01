/**
 * Helpers para padronizar respostas da API.
 */

const success = (res, data, message = 'Operacao realizada com sucesso', statusCode = 200, meta = null) => {
  const body = { success: true, message, data };
  if (meta !== null) body.meta = meta;
  return res.status(statusCode).json(body);
};

const error = (res, message = 'Erro interno do servidor', statusCode = 500) => {
  return res.status(statusCode).json({
    success: false,
    message,
  });
};

module.exports = { success, error };
