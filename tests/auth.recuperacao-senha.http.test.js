'use strict';

const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');

jest.mock('../src/auth/auth.repository', () => ({
  create: jest.fn(),
  existsByCpf: jest.fn(),
  existsByEmail: jest.fn(),
  encontrarPorUsuario: jest.fn(),
  encontrarPorId: jest.fn(),
  encontrarResumoAuthPorId: jest.fn(),
  atualizarSenha: jest.fn(),
}));

jest.mock('../src/auditoria/auditoria.service', () => ({
  registrar: jest.fn().mockResolvedValue(undefined),
}));

const authRepository = require('../src/auth/auth.repository');
const auditoriaService = require('../src/auditoria/auditoria.service');
const app = require('../src/app');

describe('Fluxo HTTP de Recuperação e Redefinição de Senha (/api/auth)', () => {
  let oldSecret;
  let bancoMemoria;

  beforeAll(() => {
    oldSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'jwt_secret_integracao_redefinicao';
  });

  afterAll(() => {
    process.env.JWT_SECRET = oldSecret;
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const hashInicial = await bcrypt.hash('Antiga@2025', 4);
    bancoMemoria = {
      anasilva: {
        id: '11111111-1111-4111-8111-111111111111',
        nome: 'Ana Silva',
        usuario: 'anasilva',
        cpf: '52998224725',
        email: 'ana@ucl.br',
        celular: '27999991111',
        perfil: 'USUARIO',
        senha: hashInicial,
      },
      inativouser: {
        id: '22222222-2222-4222-8222-222222222222',
        nome: 'Carlos Inativo',
        usuario: 'inativouser',
        cpf: '12345678901',
        email: 'carlos@ucl.br',
        celular: '27999992222',
        perfil: 'INATIVO',
        senha: hashInicial,
      },
    };

    authRepository.encontrarPorUsuario.mockImplementation(async (login) => {
      const registro = bancoMemoria[login];
      return registro ? { ...registro } : null;
    });

    authRepository.atualizarSenha.mockImplementation(async (id, novaSenhaHash) => {
      const chave = Object.keys(bancoMemoria).find((k) => bancoMemoria[k].id === id);
      if (!chave) throw new Error('Registro não encontrado');
      bancoMemoria[chave].senha = novaSenhaHash;
      bancoMemoria[chave].atualizadoEm = new Date();
      return { id };
    });
  });

  test('fluxo completo: valida identidade (com/sem máscara), redefine senha, rejeita senha antiga e autentica com nova senha sem vazar dados', async () => {
    // 1. Validar identidade com CPF formatado
    const resIdentidade = await request(app)
      .post('/api/auth/verificar-identidade-redefinicao')
      .send({ usuario: 'anasilva', cpf: '529.982.247-25' });

    expect(resIdentidade.statusCode).toBe(200);
    expect(resIdentidade.body).toEqual({
      success: true,
      message: 'Identidade verificada com sucesso.',
      data: { valido: true },
    });
    expect(JSON.stringify(resIdentidade.body)).not.toContain('52998224725');
    expect(JSON.stringify(resIdentidade.body)).not.toContain('$2');
    expect(JSON.stringify(resIdentidade.body)).not.toContain('ana@ucl.br');

    // 2. Redefinir senha (revalidando identidade no próprio endpoint)
    const resRedefinir = await request(app)
      .post('/api/auth/redefinir-senha')
      .send({
        usuario: 'anasilva',
        cpf: '52998224725',
        novaSenha: 'Nova#2026Segura',
      });

    expect(resRedefinir.statusCode).toBe(200);
    expect(resRedefinir.body).toEqual({
      success: true,
      message: 'Senha redefinida com sucesso! Você já pode fazer login com sua nova senha.',
      data: { redefinida: true },
    });
    expect(resRedefinir.body.data).not.toHaveProperty('token');
    expect(JSON.stringify(resRedefinir.body)).not.toContain('52998224725');
    expect(JSON.stringify(resRedefinir.body)).not.toContain('Nova#2026Segura');
    expect(JSON.stringify(resRedefinir.body)).not.toContain('$2');

    // Verifica que auditoria não registrou CPF nem senha em texto/hash
    const payloadsAuditoria = JSON.stringify(
      auditoriaService.registrar.mock.calls.map(([dados, , detalhes]) => ({ dados, detalhes }))
    );
    expect(payloadsAuditoria).not.toContain('52998224725');
    expect(payloadsAuditoria).not.toContain('529.982.247-25');
    expect(payloadsAuditoria).not.toContain('Nova#2026Segura');

    // 3. Senha antiga deve ser rejeitada no login
    const resLoginAntiga = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'anasilva', senha: 'Antiga@2025' });

    expect(resLoginAntiga.statusCode).toBe(401);

    // 4. Nova senha deve autenticar normalmente e retornar JWT
    const resLoginNova = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'anasilva', senha: 'Nova#2026Segura' });

    expect(resLoginNova.statusCode).toBe(200);
    expect(resLoginNova.body.success).toBe(true);
    expect(resLoginNova.body.data.token).toEqual(expect.any(String));
    expect(resLoginNova.body.data.usuario).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      usuario: 'anasilva',
      perfil: 'USUARIO',
    });
  });

  test('rejeita tentativa direta em /redefinir-senha com CPF divergente, login inexistente, CPF inválido, campos ausentes ou conta INATIVO', async () => {
    // Campos obrigatórios ausentes (validateFields)
    const resAusente = await request(app)
      .post('/api/auth/verificar-identidade-redefinicao')
      .send({ usuario: 'anasilva' });
    expect(resAusente.statusCode).toBe(400);

    const resAusenteRedef = await request(app)
      .post('/api/auth/redefinir-senha')
      .send({ usuario: 'anasilva', cpf: '52998224725' });
    expect(resAusenteRedef.statusCode).toBe(400);

    // CPF em formato inválido
    const resCpfInvalido = await request(app)
      .post('/api/auth/verificar-identidade-redefinicao')
      .send({ usuario: 'anasilva', cpf: '000.000.000-00' });
    expect(resCpfInvalido.statusCode).toBe(400);
    expect(resCpfInvalido.body.message).toBe('CPF inválido.');

    // Login inexistente vs CPF divergente na etapa final (revalidação obrigatória)
    const resLoginInex = await request(app)
      .post('/api/auth/redefinir-senha')
      .send({ usuario: 'fantasma', cpf: '52998224725', novaSenha: 'Nova#2026Segura' });
    const resCpfDiv = await request(app)
      .post('/api/auth/redefinir-senha')
      .send({ usuario: 'anasilva', cpf: '98765432109', novaSenha: 'Nova#2026Segura' });

    expect(resLoginInex.statusCode).toBe(400);
    expect(resCpfDiv.statusCode).toBe(400);
    expect(resLoginInex.body.message).toBe(resCpfDiv.body.message);

    // Conta INATIVO bloqueada
    const resInativo = await request(app)
      .post('/api/auth/redefinir-senha')
      .send({ usuario: 'inativouser', cpf: '123.456.789-01', novaSenha: 'Nova#2026Segura' });
    expect(resInativo.statusCode).toBe(403);

    // Senha fraca bloqueada
    const resFraca = await request(app)
      .post('/api/auth/redefinir-senha')
      .send({ usuario: 'anasilva', cpf: '52998224725', novaSenha: '12345678!' });
    expect(resFraca.statusCode).toBe(400);

    expect(authRepository.atualizarSenha).not.toHaveBeenCalled();
  });

  test('trata falha na persistência da senha com erro 500 seguro e registro técnico interno', async () => {
    const spyError = jest.spyOn(console, 'error').mockImplementation(() => {});
    authRepository.atualizarSenha.mockRejectedValueOnce(new Error('Disk full on DB'));

    try {
      const res = await request(app)
        .post('/api/auth/redefinir-senha')
        .send({
          usuario: 'anasilva',
          cpf: '52998224725',
          novaSenha: 'Nova#2026Segura',
        });

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({
        success: false,
        message: 'Erro interno do servidor',
      });
      expect(spyError).toHaveBeenCalled();
    } finally {
      spyError.mockRestore();
    }
  });

  test('aplica limitação de tentativas (rate limit 429) nas rotas de recuperação de senha', async () => {
    let appIsolado;
    jest.isolateModules(() => {
      const errorHandler = require('../src/middlewares/errorHandler');
      const authRoutesIsoladas = require('../src/auth/auth.routes');
      appIsolado = express();
      appIsolado.use(express.json());
      appIsolado.use('/api/auth', authRoutesIsoladas);
      appIsolado.use(errorHandler);
    });

    for (let i = 0; i < 10; i++) {
      const r = await request(appIsolado)
        .post('/api/auth/verificar-identidade-redefinicao')
        .send({ usuario: 'anasilva', cpf: '12345678901' });
      expect(r.statusCode).toBe(400);
    }

    const bloqueada = await request(appIsolado)
      .post('/api/auth/redefinir-senha')
      .send({ usuario: 'anasilva', cpf: '52998224725', novaSenha: 'Nova#2026Segura' });

    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.body.success).toBe(false);
  });
});
