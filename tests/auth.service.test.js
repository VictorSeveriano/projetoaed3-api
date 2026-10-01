jest.mock('../src/auth/auth.repository', () => ({
  create: jest.fn(),
  existsByCpf: jest.fn(),
  existsByEmail: jest.fn(),
}));

jest.mock('../src/motoristas/motoristas.repository', () => ({
  existsByCnh: jest.fn(),
}));

jest.mock('../src/motoristas/motoristas.service', () => ({
  solicitar: jest.fn(),
}));

const authRepository = require('../src/auth/auth.repository');
const motoristasRepository = require('../src/motoristas/motoristas.repository');
const authService = require('../src/auth/auth.service');

describe('AuthService cadastro availability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authRepository.existsByCpf.mockResolvedValue(false);
    authRepository.existsByEmail.mockResolvedValue(false);
    motoristasRepository.existsByCnh.mockResolvedValue(false);
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

  test('cadastrar keeps rejecting an existing CNH as the final check', async () => {
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
});