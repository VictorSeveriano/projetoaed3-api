jest.mock('../src/auth/auth.repository', () => ({
  create: jest.fn(),
  existsByCpf: jest.fn(),
  existsByEmail: jest.fn(),
  encontrarPorUsuario: jest.fn(),
}));

jest.mock('../src/motoristas/motoristas.repository', () => ({
  existsByCnh: jest.fn(),
}));

jest.mock('../src/database/prisma', () => ({
  usuario: { create: jest.fn() },
}));

jest.mock('../src/notificacoes/notificacoes.service', () => ({
  notificarSolicitacaoMotorista: jest.fn(),
}));

const authRepository = require('../src/auth/auth.repository');
const motoristasRepository = require('../src/motoristas/motoristas.repository');
const prisma = require('../src/database/prisma');
const notificacoesService = require('../src/notificacoes/notificacoes.service');
const authService = require('../src/auth/auth.service');

describe('AuthService cadastro availability', () => {
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

  test('creates the motorista record with the account and returns success when admin notification fails', async () => {
    notificacoesService.notificarSolicitacaoMotorista.mockRejectedValue(new Error('notification unavailable'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

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
      cnh: '12345678901',
    }));
    expect(notificacoesService.notificarSolicitacaoMotorista).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
      { nomeMotorista: 'Ana Silva', motoristaId: 'motorista-id' }
    );
    consoleError.mockRestore();
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
    })).rejects.toMatchObject({ statusCode: 409, message: 'CNH já cadastrada no sistema.' });
    expect(notificacoesService.notificarSolicitacaoMotorista).not.toHaveBeenCalled();
  });

  test('persists the motorista record as a nested write with the new account', async () => {
    prisma.usuario.create.mockResolvedValue({
      id: 'usuario-id',
      endereco: null,
      motorista: { id: 'motorista-id' },
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
        motorista: {
          create: {
            cnh: '12345678901',
            statusCadastro: 'PENDENTE',
            statusPresenca: 'OFFLINE',
          },
        },
      }),
      include: { endereco: true, motorista: true },
    }));
  });
});