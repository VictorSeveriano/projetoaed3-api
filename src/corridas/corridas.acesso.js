'use strict';

const corridasRepository = require('./corridas.repository');
const Corrida = require('./Corrida');
const AppError = require('../utils/AppError');

/**
 * Busca uma corrida por ID, envolve na entidade de domínio `Corrida` e valida
 * autorização de acesso para o usuário autenticado.
 *
 * @returns {Promise<{ registro: object, corrida: Corrida }>}
 */
async function buscarCorridaAutorizada(id, usuarioLogado = null) {
  const registro = await corridasRepository.findById(id);
  if (!registro) throw new AppError('Corrida ' + id + ' nao encontrada.', 404);

  const corrida = Corrida.garantirInstancia(registro);
  if (!corrida.podeSerAcessadaPor(usuarioLogado)) {
    throw new AppError('Voce nao tem permissao para acessar esta corrida.', 403);
  }

  return { registro, corrida };
}

module.exports = { buscarCorridaAutorizada };
