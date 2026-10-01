'use strict';
/**
 * usuarios.service.js — Consulta de dados do usuário e suas corridas.
 * Todos os métodos são async para suportar o repositório PostgreSQL.
 */

const authRepository       = require('../auth/auth.repository');
const corridasRepository   = require('../corridas/corridas.repository');
const motoristasRepository = require('../motoristas/motoristas.repository');
const authService          = require('../auth/auth.service');
const motoristasService    = require('../motoristas/motoristas.service');
const AppError             = require('../utils/AppError');
const {
  validarCPF, validarCelular, validarEmail, validarCEP, validarSenha,
  normalizarCPF, normalizarCelular, normalizarEmail, normalizarCNH, validarCNH
} = require('../utils/validators');
class UsuariosService {
  async buscarPorId(id) {
    const user = await authRepository.encontrarPorId(id);
    if (!user) throw new AppError('Usuário não encontrado.', 404);
    const { senha, ...dadosSeguros } = user;
    return dadosSeguros;
  }

  async listarTodos(filtros = {}) {
    let lista = await authRepository.findAll();

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
    const { senha, ...dadosSeguros } = updated;
    return dadosSeguros;
  }

  async listarCorridas(usuarioId) {
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
