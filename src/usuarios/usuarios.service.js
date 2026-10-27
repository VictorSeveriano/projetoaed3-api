'use strict';
/**
 * usuarios.service.js — Consulta de dados do usuário e suas corridas.
 * Todos os métodos são async para suportar o repositório PostgreSQL.
 */

const prisma             = require('../database/prisma');
const authRepository     = require('../auth/auth.repository');
const corridasRepository = require('../corridas/corridas.repository');
const authService        = require('../auth/auth.service');
const AppError           = require('../utils/AppError');
const { STATUS_CORRIDA } = require('../utils/constants');
const { invalidarCacheUsuario } = require('../middlewares/auth.middleware');

class UsuariosService {
  async buscarPorId(id, usuarioLogado = null) {
    if (usuarioLogado && usuarioLogado.perfil !== 'ADMINISTRADOR') {
      if (usuarioLogado.id !== id) {
        throw new AppError('Voce nao tem permissao para acessar os dados deste usuario.', 403);
      }
    }
    
    const user = await authRepository.encontrarPorId(id);
    if (!user) throw new AppError('Usuário não encontrado.', 404);
    const { senha, ...dadosSeguros } = user;
    return dadosSeguros;
  }

  async listarTodos(filtros = {}) {
    let lista = await authRepository.findAll();

    lista = lista.filter((u) => u.perfil !== 'INATIVO');

    if (filtros.perfil) {
      lista = lista.filter((u) => u.perfil === filtros.perfil.toUpperCase());
    }

    if (filtros.search) {
      const termo = filtros.search.toLowerCase().trim();
      lista = lista.filter((u) =>
        (u.nome    && u.nome.toLowerCase().includes(termo)) ||
        (u.usuario && u.usuario.toLowerCase().includes(termo))
      );
    }

    // Senha já foi removida pelo findAll (retorna sem senha)
    return lista;
  }

  async removerComSeguranca(id, usuarioLogado = null) {
    if (!usuarioLogado || usuarioLogado.perfil !== 'ADMINISTRADOR') {
      throw new AppError('Acesso negado. Apenas administradores podem remover usuários.', 403);
    }

    const usuario = await authRepository.encontrarPorId(id);
    if (!usuario) {
      throw new AppError('Usuário não encontrado.', 404);
    }

    if (usuario.perfil === 'INATIVO') {
      throw new AppError('Este usuário já foi removido do sistema e mantido apenas no histórico.', 409);
    }

    const motorista = await prisma.motorista.findUnique({ where: { usuarioId: id } });
    const veiculo = await prisma.veiculo.findFirst({ where: { motoristaId: id } });
    const corridasAtivas = await prisma.corrida.count({
      where: {
        OR: [
          { usuarioId: id },
          { motoristaId: id },
        ],
        status: {
          in: [
            STATUS_CORRIDA.SOLICITADA,
            STATUS_CORRIDA.CONFIRMADA,
            STATUS_CORRIDA.EM_ANDAMENTO,
          ],
        },
      },
    });

    if (motorista || veiculo || corridasAtivas > 0) {
      throw new AppError(
        'Não foi possível excluir este usuário porque existem dependências ativas: motorista, veículo ou corrida em andamento.',
        409,
      );
    }

    const usuarioInativo = `${usuario.usuario}-inativo-${id.slice(0, 8)}`;
    const emailInativo = `historico+${id}@inativo.local`;

    const atualizado = await prisma.usuario.update({
      where: { id },
      data: {
        perfil: 'INATIVO',
        usuario: usuarioInativo,
        email: emailInativo,
        atualizadoEm: new Date(),
      },
    });
    invalidarCacheUsuario(id);

    return {
      id: atualizado.id,
      status: atualizado.perfil,
    };
  }

  async atualizar(id, dados, usuarioLogado) {
    if (!usuarioLogado) throw new AppError('Acesso negado.', 401);
    if (usuarioLogado.perfil !== 'ADMINISTRADOR' && usuarioLogado.id !== id) {
      throw new AppError('Acesso negado. Você só pode alterar seus próprios dados.', 403);
    }

    const user = await authRepository.encontrarPorId(id);
    if (!user) throw new AppError('Usuário não encontrado.', 404);

    if (dados.perfil && dados.perfil !== user.perfil) {
      throw new AppError('A alteração de perfil não é permitida por esta rota.', 403);
    }

    if (dados.cpf && dados.cpf !== user.cpf && usuarioLogado.perfil !== 'ADMINISTRADOR') {
      throw new AppError('A alteração de CPF não é permitida para este usuário.', 403);
    }

    // Remove campos que não devem ser editados silenciosamente caso sejam enviados
    delete dados.criadoEm;
    delete dados.atualizadoEm;

    if (dados.usuario && dados.usuario !== user.usuario) {
      const existente = await authRepository.encontrarPorUsuario(dados.usuario);
      if (existente && existente.id !== id) {
        throw new AppError('Este nome de usuário já está em uso.', 409);
      }
    }

    const updated = await authRepository.update(id, dados);
    invalidarCacheUsuario(id);
    const { senha, ...dadosSeguros } = updated;
    return dadosSeguros;
  }

  async listarCorridas(usuarioId, usuarioLogado = null) {
    if (usuarioLogado && usuarioLogado.perfil !== 'ADMINISTRADOR') {
      if (usuarioLogado.id !== usuarioId) {
        throw new AppError('Voce nao tem permissao para acessar as corridas deste usuario.', 403);
      }
    }
    return corridasRepository.findByUsuarioId(usuarioId);
  }

  async criar(dados, usuarioLogado) {
    if (!usuarioLogado || usuarioLogado.perfil !== 'ADMINISTRADOR') {
      throw new AppError('Acesso negado. Apenas administradores podem criar contas por aqui.', 403);
    }

    const novoUsuario = await authService.executarCadastro(dados, ['USUARIO', 'MOTORISTA', 'ADMINISTRADOR']);
    
    const { senha: _, ...dadosSeguros } = novoUsuario;
    return dadosSeguros;
  }
}

module.exports = new UsuariosService();
