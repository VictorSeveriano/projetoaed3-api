'use strict';

const auditoriaRepository = require('./auditoria.repository');
const AppError = require('../utils/AppError');

class AuditoriaService {
  /**
   * Registra um evento de auditoria no sistema.
   * Não dispara exceção em caso de erro para não quebrar a operação principal.
   * @param {Object} dados
   * @param {string} dados.usuarioId - ID do usuário responsável (via req.usuario)
   * @param {string} dados.perfil - Perfil do usuário logado (ex. ADMINISTRADOR)
   * @param {string} dados.acao - Ação executada (ex. APROVACAO_MOTORISTA)
   * @param {string} dados.modulo - Módulo do sistema (ex. MOTORISTAS)
   * @param {string} dados.resultado - SUCESSO ou FALHA
   * @param {Object} req - Objeto de request do Express para extrair IP, Rota, etc.
   * @param {Object} [detalhes] - Opicionais: entidade, entidadeId, descricao, dadosAnteriores, dadosNovos, statusHttp
   */
  async registrar(dados, req = null, detalhes = {}) {
    try {
      const registro = {
        usuarioId: dados.usuarioId || null,
        perfil: dados.perfil || null,
        acao: dados.acao,
        modulo: dados.modulo,
        resultado: dados.resultado,
        entidade: detalhes.entidade || null,
        entidadeId: detalhes.entidadeId || null,
        descricao: detalhes.descricao || null,
        dadosAnteriores: detalhes.dadosAnteriores ? JSON.parse(JSON.stringify(detalhes.dadosAnteriores)) : null,
        dadosNovos: detalhes.dadosNovos ? JSON.parse(JSON.stringify(detalhes.dadosNovos)) : null,
        statusHttp: detalhes.statusHttp || null,
        rota: req ? req.originalUrl : null,
        metodoHttp: req ? req.method : null,
        ip: req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress) : null,
        userAgent: req ? req.headers['user-agent'] : null,
      };

      // Ocultar dados sensíveis se presentes
      ['dadosAnteriores', 'dadosNovos'].forEach(campo => {
        if (registro[campo]) {
          delete registro[campo].senha;
          delete registro[campo].token;
        }
      });

      await auditoriaRepository.create(registro);
    } catch (e) {
      console.error('[AuditoriaService] Falha ao registrar auditoria:', e.message);
      // Nunca lança erro para cima, preserva a operação principal.
    }
  }

  async listar(filtros = {}, paginacao = { page: 1, limit: 20 }) {
    const skip = (paginacao.page - 1) * paginacao.limit;
    const take = parseInt(paginacao.limit, 10);
    const orderBy = { criadoEm: 'desc' };
    const where = {};

    if (filtros.usuarioId) where.usuarioId = filtros.usuarioId;

    const result = await auditoriaRepository.findAll({ skip, take, orderBy, where });
    return {
      data: result.registros,
      meta: {
        total: result.total,
        page: paginacao.page,
        limit: take,
        totalPages: Math.ceil(result.total / take)
      }
    };
  }

  async buscarPorId(id) {
    const reg = await auditoriaRepository.findById(id);
    if (!reg) throw new AppError('Registro de auditoria não encontrado.', 404);
    return reg;
  }
}

module.exports = new AuditoriaService();
