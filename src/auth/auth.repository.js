'use strict';
/**
 * auth.repository.js — Repositório de usuários com Prisma ORM.
 */

const prisma = require('../database/prisma');

// O schema.prisma possui @map para que propriedades do banco
// já retornem em camelCase (ex: criado_em -> criadoEm).
// Endereco também já tem a mesma estrutura, mas o sistema legado
// utilizava "rua" ao invés de "logradouro", então ainda precisamos
// fazer o mapeamento do logradouro para rua.

function formatarUsuario(usuarioPrisma) {
  if (!usuarioPrisma) return null;
  const { endereco, ...resto } = usuarioPrisma;
  
  if (endereco) {
    resto.endereco = {
      ...endereco,
      rua: endereco.logradouro,
      latitude: endereco.latitude ? endereco.latitude.toNumber() : null,
      longitude: endereco.longitude ? endereco.longitude.toNumber() : null
    };
  } else {
    resto.endereco = null;
  }
  
  return resto;
}

function formatarUsuarioSemSenha(usuarioPrisma) {
  const u = formatarUsuario(usuarioPrisma);
  if (!u) return null;
  const { senha, ...resto } = u;
  return resto;
}

function enderecoParaPrisma(endereco) {
  if (!endereco) return undefined;
  return {
    logradouro:  endereco.rua        || endereco.logradouro || null,
    numero:      endereco.numero      || null,
    complemento: endereco.complemento || null,
    bairro:      endereco.bairro      || null,
    cidade:      endereco.cidade      || null,
    estado:      endereco.estado      || null,
    uf:          endereco.uf          || null,
    cep:         endereco.cep         ? endereco.cep.replace(/\D/g, '') : null,
    pais:        endereco.pais        || 'Brasil',
    latitude:    endereco.latitude    || null,
    longitude:   endereco.longitude   || null
  };
}

class AuthRepository {
  async findAll() {
    const usuarios = await prisma.usuario.findMany({
      include: { endereco: true },
      orderBy: { criadoEm: 'asc' }
    });
    return usuarios.map(formatarUsuarioSemSenha);
  }

  async encontrarPorUsuario(usuario) {
    const u = await prisma.usuario.findUnique({
      where: { usuario },
      include: { endereco: true }
    });
    return formatarUsuario(u);
  }

  async encontrarPorId(id) {
    const u = await prisma.usuario.findUnique({
      where: { id },
      include: { endereco: true }
    });
    return formatarUsuario(u);
  }

  async existsByCpf(cpf) {
    const count = await prisma.usuario.count({
      where: { cpf }
    });
    return count > 0;
  }

  async existsByEmail(email) {
    const count = await prisma.usuario.count({
      where: { email }
    });
    return count > 0;
  }

  async create(dados) {
    const novoUsuario = await prisma.usuario.create({
      data: {
        nome: dados.nome,
        cpf: dados.cpf,
        celular: dados.celular,
        email: dados.email,
        usuario: dados.usuario,
        senha: dados.senha,
        perfil: dados.perfil,
        endereco: dados.endereco ? {
          create: enderecoParaPrisma(dados.endereco)
        } : undefined
      },
      include: { endereco: true }
    });
    return formatarUsuario(novoUsuario);
  }

  async update(id, dados) {
    const dataUpdate = {};

    if (dados.nome !== undefined) dataUpdate.nome = dados.nome;
    if (dados.usuario !== undefined) dataUpdate.usuario = dados.usuario;
    if (dados.cpf !== undefined) dataUpdate.cpf = dados.cpf;
    if (dados.celular !== undefined) dataUpdate.celular = dados.celular;
    if (dados.email !== undefined) dataUpdate.email = dados.email;
    dataUpdate.atualizadoEm = new Date();

    if (dados.endereco) {
      const u = await prisma.usuario.findUnique({ where: { id }, select: { enderecoId: true } });
      if (u && u.enderecoId) {
        dataUpdate.endereco = {
          update: enderecoParaPrisma(dados.endereco)
        };
      } else {
        dataUpdate.endereco = {
          create: enderecoParaPrisma(dados.endereco)
        };
      }
    }

    try {
      const atualizado = await prisma.usuario.update({
        where: { id },
        data: dataUpdate,
        include: { endereco: true }
      });
      return formatarUsuario(atualizado);
    } catch (error) {
      if (error.code === 'P2025') return null; // Record to update not found
      throw error;
    }
  }
}

module.exports = new AuthRepository();
