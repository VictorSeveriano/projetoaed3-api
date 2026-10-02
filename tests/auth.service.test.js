jest.mock('../src/auth/auth.repository', () => ({
  create: jest.fn(),
  existsByCpf: jest.fn(),
  existsByEmail: jest.fn(),
  encontrarPorUsuario: jest.fn(),
  atualizarSenha: jest.fn(),
}));

jest.mock('../src/motoristas/motoristas.repository', () => ({
  existsByCnh: jest.fn(),
}));

jest.mock('../src/database/prisma', () => ({
  usuario: { create: jest.fn() },
}));

jest.mock('../src/motoristas/motoristas.service', () => ({
  solicitar: jest.fn(),
}));

const authRepository = require('../src/auth/auth.repository');
const motoristasRepository = require('../src/motoristas/motoristas.repository');
const prisma = require('../src/database/prisma');
const motoristasService = require('../src/motoristas/motoristas.service');
const authService = require('../src/auth/auth.service');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

describe('AuthService cadastro availability', () => {
  let oldSecret;

  beforeAll(() => {
    oldSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test_secret';
  });

  afterAll(() => {
    process.env.JWT_SECRET = oldSecret;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    authRepository.existsByCpf.mockResolvedValue(false);
    authRepository.existsByEmail.mockResolvedValue(false);
    authRepository.encontrarPorUsuario.mockResolvedValue(null);
    motoristasRepository.existsByCnh.mockResolvedValue(false);
    authRepository.create.mockResolvedValue({
      id: 'usuario-id',
      nome: 'Ana Silva',
      usuario: 'anasilva',
      perfil: 'MOTORISTA',
      email: 'ana@example.com',
      celular: '11999999999',
      motorista: { id: 'motorista-id' },
    });
  });

  test('returns duplicate flags for CPF, email and CNH using normalized values', async () => {
    authRepository.existsByCpf.mockResolvedValue(true);
    motoristasRepository.existsByCnh.mockResolvedValue(true);

    await expect(authService.verificarDisponibilidadeCadastro({
      cpf: '123.456.789-01',
      email: 'ANA@example.com',
      perfil: 'MOTORISTA',
      cnh: '123.456.789-01',
    })).resolves.toEqual({ duplicados: { cpf: true, email: false, cnh: true } });
    expect(authRepository.existsByCpf).toHaveBeenCalledWith('12345678901');
    expect(authRepository.existsByEmail).toHaveBeenCalledWith('ana@example.com');
    expect(motoristasRepository.existsByCnh).toHaveBeenCalledWith('12345678901');
  });

  test('checks CPF and email for passengers without querying CNH', async () => {
    await expect(authService.verificarDisponibilidadeCadastro({
      cpf: '12345678901',
      email: 'ana@example.com',
      perfil: 'USUARIO',
    })).resolves.toEqual({ duplicados: { cpf: false, email: false } });
    expect(motoristasRepository.existsByCnh).not.toHaveBeenCalled();
  });

  test('rejects malformed CNH without querying its repository', async () => {
    await expect(authService.verificarDisponibilidadeCadastro({
      cpf: '12345678901',
      email: 'ana@example.com',
      perfil: 'MOTORISTA',
      cnh: '11111111111',
    })).rejects.toMatchObject({ statusCode: 400, message: 'CNH inválida.' });
    expect(motoristasRepository.existsByCnh).not.toHaveBeenCalled();
  });

  test('cadastrar keeps rejecting an existing CNH before persisting the account', async () => {
    motoristasRepository.existsByCnh.mockResolvedValue(true);

    await expect(authService.cadastrar({
      nome: 'Ana Silva',
      cpf: '12345678901',
      celular: '11999999999',
      email: 'ana@example.com',
      senha: 'Senha@1234',
      perfil: 'MOTORISTA',
      cnh: '12345678901',
      endereco: {
        rua: 'Rua A',
        numero: '1',
        bairro: 'Centro',
        cidade: 'Vitoria',
        estado: 'ES',
        cep: '29000000',
      },
    })).rejects.toMatchObject({ statusCode: 409, message: 'CNH já cadastrada no sistema.' });
    expect(authRepository.create).not.toHaveBeenCalled();
  });

  test('creates the motorista record with the account by calling motoristasService.solicitar', async () => {
    motoristasService.solicitar.mockResolvedValue({});

    await expect(authService.cadastrar({
      nome: 'Ana Silva',
      cpf: '12345678901',
      celular: '11999999999',
      email: 'ana@example.com',
      senha: 'Senha@1234',
      perfil: 'MOTORISTA',
      cnh: '12345678901',
      endereco: {
        rua: 'Rua A',
        numero: '1',
        bairro: 'Centro',
        cidade: 'Vitoria',
        estado: 'ES',
        cep: '29000000',
      },
    })).resolves.toMatchObject({ usuario: { id: 'usuario-id', perfil: 'MOTORISTA' } });

    expect(authRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      perfil: 'MOTORISTA',
    }));
    expect(motoristasService.solicitar).toHaveBeenCalledWith('usuario-id', '12345678901');
  });

  test('maps a concurrent CNH unique-constraint conflict to a clear 409 without partial success', async () => {
    authRepository.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['cnh'] },
    }));

    await expect(authService.cadastrar({
      nome: 'Ana Silva',
      cpf: '12345678901',
      celular: '11999999999',
      email: 'ana@example.com',
      senha: 'Senha@1234',
      perfil: 'MOTORISTA',
      cnh: '12345678901',
      endereco: {
        rua: 'Rua A',
        numero: '1',
        bairro: 'Centro',
        cidade: 'Vitoria',
        estado: 'ES',
        cep: '29000000',
      },
    })).rejects.toMatchObject({ statusCode: 409, message: 'Já existe um cadastro com esses dados.' });
  });

  test('does NOT persist the motorista record as a nested write with the new account', async () => {
    prisma.usuario.create.mockResolvedValue({
      id: 'usuario-id',
      endereco: null,
    });
    const authRepositoryReal = jest.requireActual('../src/auth/auth.repository');

    await authRepositoryReal.create({
      nome: 'Ana Silva',
      cpf: '12345678901',
      celular: '11999999999',
      email: 'ana@example.com',
      usuario: 'anasilva',
      senha: 'Senha@1234',
      perfil: 'MOTORISTA',
      cnh: '12345678901',
    });

    expect(prisma.usuario.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        cpf: '12345678901',
      }),
      include: { endereco: true, motorista: true },
    }));

    const callArgs = prisma.usuario.create.mock.calls[0][0];
    expect(callArgs.data).not.toHaveProperty('motorista');
  });

  test('accepts a legacy plaintext password and replaces it with a bcrypt hash', async () => {
    authRepository.encontrarPorUsuario.mockResolvedValue({
      id: 'usuario-id',
      nome: 'Ana Silva',
      usuario: 'anasilva',
      perfil: 'USUARIO',
      senha: 'senha-legada',
    });

    const resultado = await authService.login('anasilva', 'senha-legada');

    expect(resultado).toMatchObject({
      token: expect.any(String),
      usuario: { id: 'usuario-id', perfil: 'USUARIO' },
    });
    
    const decoded = jwt.verify(resultado.token, 'test_secret');
    expect(decoded.sub).toBe('usuario-id');
    
    const senhaGravada = authRepository.atualizarSenha.mock.calls[0][1];
    await expect(bcrypt.compare('senha-legada', senhaGravada)).resolves.toBe(true);
  });

  test('continues authenticating bcrypt passwords without rewriting them', async () => {
    const senhaHash = await bcrypt.hash('senha-atual', 4);
    authRepository.encontrarPorUsuario.mockResolvedValue({
      id: 'usuario-id',
      nome: 'Ana Silva',
      usuario: 'anasilva',
      perfil: 'USUARIO',
      senha: senhaHash,
    });

    const resultado = await authService.login('anasilva', 'senha-atual');
    expect(resultado).toMatchObject({
      token: expect.any(String),
    });
    
    const decoded = jwt.verify(resultado.token, 'test_secret');
    expect(decoded.sub).toBe('usuario-id');
    
    expect(authRepository.atualizarSenha).not.toHaveBeenCalled();
  });

  test('rejects an incorrect legacy password without changing the stored password', async () => {
    authRepository.encontrarPorUsuario.mockResolvedValue({
      id: 'usuario-id',
      senha: 'senha-legada',
    });

    await expect(authService.login('anasilva', 'senha-errada')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Credenciais invalidas.',
    });
    expect(authRepository.atualizarSenha).not.toHaveBeenCalled();
  });
});