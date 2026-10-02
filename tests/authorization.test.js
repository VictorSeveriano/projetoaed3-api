const corridasService = require('../src/corridas/corridas.service');
const corridasRepository = require('../src/corridas/corridas.repository');
const usuariosService = require('../src/usuarios/usuarios.service');
const motoristasService = require('../src/motoristas/motoristas.service');
const notificacoesService = require('../src/notificacoes/notificacoes.service');
const notificacoesRepository = require('../src/notificacoes/notificacoes.repository');
const motoristasRepository = require('../src/motoristas/motoristas.repository');
const authRepository = require('../src/auth/auth.repository');
const veiculosRepository = require('../src/veiculos/veiculos.repository');
const AppError = require('../src/utils/AppError');

jest.mock('../src/corridas/corridas.repository');
jest.mock('../src/auth/auth.repository');
jest.mock('../src/motoristas/motoristas.repository');
jest.mock('../src/notificacoes/notificacoes.repository');
jest.mock('../src/veiculos/veiculos.repository');

describe('Testes de Autorização (IDOR)', () => {

  describe('Corridas', () => {
    const corridaMock = { id: 1, usuarioId: 'user-a', motoristaId: 'mot-a', status: 'CONFIRMADA' };

    beforeEach(() => {
      corridasRepository.findById.mockResolvedValue(corridaMock);
    });

    test('USUARIO A acessa corrida de A -> permitido', async () => {
      const result = await corridasService.buscarPorId(1, { id: 'user-a', perfil: 'USUARIO' });
      expect(result.id).toBe(1);
    });

    test('USUARIO B acessa corrida de A -> negado', async () => {
      await expect(corridasService.buscarPorId(1, { id: 'user-b', perfil: 'USUARIO' }))
        .rejects.toThrow(AppError);
    });

    test('MOTORISTA A acessa corrida de A -> permitido', async () => {
      await expect(corridasService.buscarPorId(1, { id: 'mot-a', perfil: 'MOTORISTA' }))
        .resolves.toEqual(corridaMock);
    });

    test('MOTORISTA B acessa corrida de A -> negado', async () => {
      await expect(corridasService.buscarPorId(1, { id: 'mot-b', perfil: 'MOTORISTA' }))
        .rejects.toThrow(AppError);
    });

    test('ADMINISTRADOR acessa corrida de qualquer usuario -> permitido', async () => {
      await expect(corridasService.buscarPorId(1, { id: 'admin-1', perfil: 'ADMINISTRADOR' }))
        .resolves.toEqual(corridaMock);
    });
  });

  describe('Usuários', () => {
    beforeEach(() => {
      authRepository.encontrarPorId.mockResolvedValue({ id: 'user-a', nome: 'A', perfil: 'USUARIO' });
    });

    test('USUARIO A consulta próprio usuário -> permitido', async () => {
      await expect(usuariosService.buscarPorId('user-a', { id: 'user-a', perfil: 'USUARIO' }))
        .resolves.toBeDefined();
    });

    test('USUARIO A consulta usuário B -> negado', async () => {
      await expect(usuariosService.buscarPorId('user-b', { id: 'user-a', perfil: 'USUARIO' }))
        .rejects.toThrow(AppError);
    });

    test('ADMINISTRADOR consulta usuário B -> permitido', async () => {
      await expect(usuariosService.buscarPorId('user-b', { id: 'admin', perfil: 'ADMINISTRADOR' }))
        .resolves.toBeDefined();
    });
  });

  describe('Notificações', () => {
    beforeEach(() => {
      notificacoesRepository.findById.mockResolvedValue({ id: 1, destinatarioId: 'user-a' });
      notificacoesRepository.marcarLida.mockResolvedValue(true);
    });

    test('Usuário A marca própria notificação -> permitido', async () => {
      await expect(notificacoesService.marcarLida(1, { id: 'user-a', perfil: 'USUARIO' }))
        .resolves.toBeDefined();
    });

    test('Usuário A marca notificação de B -> negado', async () => {
      await expect(notificacoesService.marcarLida(1, { id: 'user-b', perfil: 'USUARIO' }))
        .rejects.toThrow(AppError);
    });
  });
  
  describe('Motoristas', () => {
    beforeEach(() => {
      motoristasRepository.findById.mockResolvedValue({ id: 1, usuarioId: 'mot-a' });
      motoristasRepository.findByUsuarioId.mockResolvedValue({ id: 1, usuarioId: 'mot-a' });
      authRepository.encontrarPorId.mockResolvedValue({ id: 'mot-a', perfil: 'MOTORISTA' });
    });

    test('MOTORISTA A consulta próprio perfil -> permitido', async () => {
      await expect(motoristasService.buscarPorUsuarioId('mot-a', { id: 'mot-a', perfil: 'MOTORISTA' }))
        .resolves.toBeDefined();
    });

    test('MOTORISTA A consulta perfil de MOTORISTA B -> negado', async () => {
      await expect(motoristasService.buscarPorUsuarioId('mot-b', { id: 'mot-a', perfil: 'MOTORISTA' }))
        .rejects.toThrow(AppError);
    });
  });
});
