const corridasService = require('../src/corridas/corridas.service');
const corridasRepository = require('../src/corridas/corridas.repository');
const usuariosService = require('../src/usuarios/usuarios.service');
const motoristasService = require('../src/motoristas/motoristas.service');
const notificacoesService = require('../src/notificacoes/notificacoes.service');
const notificacoesRepository = require('../src/notificacoes/notificacoes.repository');
const motoristasRepository = require('../src/motoristas/motoristas.repository');
const authRepository = require('../src/auth/auth.repository');
const veiculosRepository = require('../src/veiculos/veiculos.repository');
const relatorioService = require('../src/motoristas/relatorio.motorista.service');
const AppError = require('../src/utils/AppError');

jest.mock('../src/corridas/corridas.repository');
jest.mock('../src/auth/auth.repository');
jest.mock('../src/motoristas/motoristas.repository');
jest.mock('../src/notificacoes/notificacoes.repository');
jest.mock('../src/veiculos/veiculos.repository');

describe('Testes de Autorização (IDOR)', () => {

  describe('Corridas', () => {
    const corridaMock = { id: 1, usuarioId: 'user-a', motoristaId: 'mot-a', status: 'CONFIRMADA' };
    const corridaSemMotorista = { id: 2, usuarioId: 'user-a', motoristaId: null, status: 'SOLICITADA' };

    beforeEach(() => {
      corridasRepository.findById.mockImplementation(async (id) => {
        if (id === 1) return corridaMock;
        if (id === 2) return corridaSemMotorista;
        return null;
      });
      corridasRepository.updateStatus.mockResolvedValue(corridaMock);
      corridasRepository.create.mockResolvedValue({ id: 10 });
      veiculosRepository.findDisponiveis.mockResolvedValue([{ classe: 'BASICO', motoristaId: 'mot-a' }]);
      motoristasRepository.findByUsuarioId.mockResolvedValue({ statusCadastro: 'APROVADO' });
    });

    test('USUARIO A acessa corrida de A -> permitido', async () => {
      const result = await corridasService.buscarPorId(1, { id: 'user-a', perfil: 'USUARIO' });
      expect(result.id).toBe(1);
    });

    test('USUARIO B acessa corrida de A -> negado', async () => {
      await expect(corridasService.buscarPorId(1, { id: 'user-b', perfil: 'USUARIO' }))
        .rejects.toThrow(AppError);
    });

    test('MOTORISTA A acessa corrida atribuída a A -> permitido', async () => {
      await expect(corridasService.buscarPorId(1, { id: 'mot-a', perfil: 'MOTORISTA' }))
        .resolves.toEqual(corridaMock);
    });

    test('MOTORISTA B acessa corrida atribuída a A -> negado', async () => {
      await expect(corridasService.buscarPorId(1, { id: 'mot-b', perfil: 'MOTORISTA' }))
        .rejects.toThrow(AppError);
    });

    test('MOTORISTA A acessa corrida sem motorista -> negado', async () => {
      await expect(corridasService.buscarPorId(2, { id: 'mot-a', perfil: 'MOTORISTA' }))
        .rejects.toThrow(AppError);
    });

    test('ADMINISTRADOR acessa corrida de qualquer usuario -> permitido', async () => {
      await expect(corridasService.buscarPorId(1, { id: 'admin-1', perfil: 'ADMINISTRADOR' }))
        .resolves.toEqual(corridaMock);
    });
    
    test('Criação de corrida: usuario autenticado A tenta criar para B -> negado', async () => {
      await expect(corridasService.criar({
        usuarioId: 'user-b', origemNome: 'A', destinoNome: 'B', distanciaKm: 1, classe: 'BASICO', dataHorario: '2026-10-01T10:00:00.000Z'
      }, { id: 'user-a', perfil: 'USUARIO' })).rejects.toThrow(AppError);
    });

    test('Criação de corrida: sem usuario autenticado -> negado', async () => {
      await expect(corridasService.criar({
        usuarioId: 'user-a', origemNome: 'A', destinoNome: 'B', distanciaKm: 1, classe: 'BASICO', dataHorario: '2026-10-01T10:00:00.000Z'
      }, null)).rejects.toThrow(AppError);
    });

    test('Criação de corrida: usuario autenticado A cria para A -> permitido', async () => {
      await expect(corridasService.criar({
        usuarioId: 'user-a', origemNome: 'A', destinoNome: 'B', distanciaKm: 1, classe: 'BASICO', dataHorario: '2026-10-01T10:00:00.000Z'
      }, { id: 'user-a', perfil: 'USUARIO' })).resolves.toBeDefined();
    });

    test('USUARIO A cancela corrida de A -> permitido', async () => {
      await expect(corridasService.cancelar(1, { id: 'user-a', perfil: 'USUARIO' }))
        .resolves.toBeDefined();
    });

    test('USUARIO A cancela corrida de B -> negado', async () => {
      await expect(corridasService.cancelar(1, { id: 'user-b', perfil: 'USUARIO' }))
        .rejects.toThrow(AppError);
    });

    test('MOTORISTA A cancela corrida de B -> negado', async () => {
      await expect(corridasService.cancelar(1, { id: 'mot-b', perfil: 'MOTORISTA' }))
        .rejects.toThrow(AppError);
    });

    test('MOTORISTA A cancela corrida sem motorista -> negado', async () => {
      await expect(corridasService.cancelar(2, { id: 'mot-a', perfil: 'MOTORISTA' }))
        .rejects.toThrow(AppError);
    });

    test('MOTORISTA A finaliza corrida de A -> permitido', async () => {
      await expect(corridasService.confirmarPagamentoEFinalizar(1, { id: 'mot-a', perfil: 'MOTORISTA' }))
        .resolves.toBeDefined();
    });

    test('MOTORISTA A finaliza corrida de B -> negado', async () => {
      await expect(corridasService.confirmarPagamentoEFinalizar(1, { id: 'mot-b', perfil: 'MOTORISTA' }))
        .rejects.toThrow(AppError);
    });

    test('MOTORISTA A finaliza corrida sem motorista -> negado', async () => {
      await expect(corridasService.confirmarPagamentoEFinalizar(2, { id: 'mot-a', perfil: 'MOTORISTA' }))
        .rejects.toThrow(AppError);
    });

    test('USUARIO tenta finalizar -> negado', async () => {
      await expect(corridasService.confirmarPagamentoEFinalizar(1, { id: 'user-a', perfil: 'USUARIO' }))
        .rejects.toThrow(AppError);
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
      notificacoesRepository.marcarTodasLidas.mockResolvedValue(true);
    });

    test('Usuário A marca própria notificação -> permitido', async () => {
      await expect(notificacoesService.marcarLida(1, { id: 'user-a', perfil: 'USUARIO' }))
        .resolves.toBeDefined();
    });

    test('Usuário A marca notificação de B -> negado', async () => {
      await expect(notificacoesService.marcarLida(1, { id: 'user-b', perfil: 'USUARIO' }))
        .rejects.toThrow(AppError);
    });

    test('marcarTodasLidas: opera somente sobre o req.usuario.id', async () => {
      await notificacoesService.marcarTodasLidas('user-a');
      expect(notificacoesRepository.marcarTodasLidas).toHaveBeenCalledWith('user-a');
    });
  });

  describe('Motoristas', () => {
    beforeEach(() => {
      motoristasRepository.findById.mockImplementation(async (id) => {
        if (id === 'motorista-record-a') return { id: 'motorista-record-a', usuarioId: 'user-mot-a' };
        if (id === 'motorista-record-b') return { id: 'motorista-record-b', usuarioId: 'user-mot-b' };
        return null;
      });
      motoristasRepository.findByUsuarioId.mockImplementation(async (usuarioId) => {
        if (usuarioId === 'user-mot-a') return { id: 'motorista-record-a', usuarioId: 'user-mot-a' };
        if (usuarioId === 'user-mot-b') return { id: 'motorista-record-b', usuarioId: 'user-mot-b' };
        return null;
      });
      authRepository.encontrarPorId.mockResolvedValue({ id: 'user-mot-a', perfil: 'MOTORISTA' });
      corridasRepository.findByMotoristaId.mockResolvedValue([{ id: 1 }]);
      corridasRepository.findByMotoristaIdAndPeriodo.mockResolvedValue([{ id: 1, status: 'FINALIZADA', valor: 10, distanciaKm: 5 }]);
      veiculosRepository.findByMotoristaId.mockResolvedValue({ id: 1 });
    });

    test('Motorista A acessa seu próprio registro -> permitido', async () => {
      await expect(motoristasService.buscarPorUsuarioId('user-mot-a', { id: 'user-mot-a', perfil: 'MOTORISTA' }))
        .resolves.toBeDefined();
    });

    test('Motorista A acessa registro do motorista B -> negado', async () => {
      await expect(motoristasService.buscarPorUsuarioId('user-mot-b', { id: 'user-mot-a', perfil: 'MOTORISTA' }))
        .rejects.toThrow(AppError);
    });

    test('Motorista A consulta suas corridas -> permitido', async () => {
      await expect(motoristasService.listarCorridas('motorista-record-a', { id: 'user-mot-a', perfil: 'MOTORISTA' }))
        .resolves.toBeDefined();
    });

    test('Motorista A consulta corridas de B -> negado', async () => {
      await expect(motoristasService.listarCorridas('motorista-record-b', { id: 'user-mot-a', perfil: 'MOTORISTA' }))
        .rejects.toThrow(AppError);
    });

    test('Motorista A consulta seu veículo -> permitido', async () => {
      await expect(motoristasService.buscarVeiculo('motorista-record-a', { id: 'user-mot-a', perfil: 'MOTORISTA' }))
        .resolves.toBeDefined();
    });

    test('Motorista A consulta veículo de B -> negado', async () => {
      await expect(motoristasService.buscarVeiculo('motorista-record-b', { id: 'user-mot-a', perfil: 'MOTORISTA' }))
        .rejects.toThrow(AppError);
    });

    test('Motorista A consulta relatório de A -> permitido', async () => {
      await expect(relatorioService.gerarRelatorioMensal('motorista-record-a', 10, 2026, { id: 'user-mot-a', perfil: 'MOTORISTA' }))
        .resolves.toBeDefined();
    });

    test('Motorista A consulta relatório de B -> negado', async () => {
      await expect(relatorioService.gerarRelatorioMensal('motorista-record-b', 10, 2026, { id: 'user-mot-a', perfil: 'MOTORISTA' }))
        .rejects.toThrow(AppError);
    });

    test('Administrador consulta relatório de B -> permitido', async () => {
      await expect(relatorioService.gerarRelatorioMensal('motorista-record-b', 10, 2026, { id: 'admin', perfil: 'ADMINISTRADOR' }))
        .resolves.toBeDefined();
    });
  });
});
