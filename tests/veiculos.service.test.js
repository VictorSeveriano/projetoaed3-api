jest.mock('../src/veiculos/veiculos.repository', () => ({
  create: jest.fn(),
  findByMotoristaId: jest.fn(),
}));

jest.mock('../src/motoristas/motoristas.repository', () => ({
  findByUsuarioId: jest.fn(),
}));

jest.mock('../src/auth/auth.repository', () => ({
  encontrarPorId: jest.fn(),
}));

jest.mock('../src/notificacoes/notificacoes.service', () => ({
  notificarSolicitacaoVeiculo: jest.fn(),
}));

const veiculosRepository = require('../src/veiculos/veiculos.repository');
const motoristasRepository = require('../src/motoristas/motoristas.repository');
const authRepository = require('../src/auth/auth.repository');
const notificacoesService = require('../src/notificacoes/notificacoes.service');
const veiculosService = require('../src/veiculos/veiculos.service');

describe('VeiculosService cadastro', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authRepository.encontrarPorId.mockResolvedValue({ id: 'motorista-id', nome: 'Ana Silva' });
    motoristasRepository.findByUsuarioId.mockResolvedValue({ statusCadastro: 'APROVADO' });
    veiculosRepository.findByMotoristaId.mockResolvedValue(null);
    veiculosRepository.create.mockResolvedValue({
      id: 'veiculo-id',
      motoristaId: 'motorista-id',
      statusAprovacao: 'PENDENTE',
      status: 'INDISPONIVEL',
    });
  });

  test('returns the persisted vehicle when administrator notification fails', async () => {
    notificacoesService.notificarSolicitacaoVeiculo.mockRejectedValue(new Error('Falha ao gravar notificação'));

    await expect(veiculosService.cadastrar('motorista-id', {
      marca: 'Marca',
      modelo: 'Modelo',
      ano: 2025,
      placa: 'ABC1234',
      porte: 'Medio',
    })).resolves.toMatchObject({
      id: 'veiculo-id',
      statusAprovacao: 'PENDENTE',
      status: 'INDISPONIVEL',
    });

    expect(veiculosRepository.create).toHaveBeenCalledTimes(1);
    expect(notificacoesService.notificarSolicitacaoVeiculo).toHaveBeenCalledTimes(1);
  });

  test('motorista não aprovado -> rejeitado (403)', async () => {
    motoristasRepository.findByUsuarioId.mockResolvedValue({ statusCadastro: 'PENDENTE' });
    await expect(veiculosService.cadastrar('motorista-id', {
      marca: 'M', modelo: 'M', ano: 2025, placa: 'A', porte: 'Pequeno'
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test('usuário não motorista -> rejeitado (404)', async () => {
    motoristasRepository.findByUsuarioId.mockResolvedValue(null);
    await expect(veiculosService.cadastrar('user-not-mot', {
      marca: 'M', modelo: 'M', ano: 2025, placa: 'A', porte: 'Pequeno'
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('Porte Pequeno -> BASICO, Medio -> NORMAL, Grande -> PREMIUM', async () => {
    veiculosRepository.create.mockImplementation(async (dados) => dados);
    const p = await veiculosService.cadastrar('motorista-id', { marca: 'M', modelo: 'M', ano: 2025, placa: 'A', porte: 'Pequeno' });
    expect(p.classe).toBe('BASICO');

    const m = await veiculosService.cadastrar('motorista-id', { marca: 'M', modelo: 'M', ano: 2025, placa: 'A', porte: 'Medio' });
    expect(m.classe).toBe('NORMAL');

    const g = await veiculosService.cadastrar('motorista-id', { marca: 'M', modelo: 'M', ano: 2025, placa: 'A', porte: 'Grande' });
    expect(g.classe).toBe('PREMIUM');
  });
});

describe('VeiculosService aprovação e classe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    veiculosRepository.findById = jest.fn();
    veiculosRepository.updateStatusAprovacao = jest.fn();
    veiculosRepository.updateClasse = jest.fn();
    veiculosRepository.update = jest.fn();
    veiculosRepository.softDelete = jest.fn();
  });

  test('Aprovação: veiculo pendente -> aprovado', async () => {
    veiculosRepository.findById.mockResolvedValue({ id: 'v1', statusAprovacao: 'PENDENTE', porte: 'Medio' });
    veiculosRepository.updateStatusAprovacao.mockResolvedValue({ id: 'v1', statusAprovacao: 'APROVADO', classe: 'NORMAL' });
    const v = await veiculosService.aprovar('v1');
    expect(veiculosRepository.updateStatusAprovacao).toHaveBeenCalledWith('v1', 'APROVADO', 'NORMAL');
    expect(v.statusAprovacao).toBe('APROVADO');
  });

  test('Aprovação: veiculo já aprovado -> 409', async () => {
    veiculosRepository.findById.mockResolvedValue({ id: 'v1', statusAprovacao: 'APROVADO' });
    await expect(veiculosService.aprovar('v1')).rejects.toMatchObject({ statusCode: 409 });
  });

  test('Aprovação: veiculo inexistente -> 404', async () => {
    veiculosRepository.findById.mockResolvedValue(null);
    await expect(veiculosService.aprovar('v1')).rejects.toMatchObject({ statusCode: 404 });
  });

  test('Aprovação: veiculo excluido -> rejeitado', async () => {
    veiculosRepository.findById.mockResolvedValue({ id: 'v1', statusAprovacao: 'EXCLUIDO' });
    await expect(veiculosService.aprovar('v1')).rejects.toMatchObject({ statusCode: 404 });
  });

  test('Classe: PATCH classe com BASICO/NORMAL/PREMIUM -> permitido', async () => {
    veiculosRepository.findById.mockResolvedValue({ id: 'v1', statusAprovacao: 'APROVADO' });
    veiculosRepository.updateClasse.mockImplementation(async (id, classe) => ({ id, classe }));
    const v = await veiculosService.editarClasse('v1', 'PREMIUM');
    expect(v.classe).toBe('PREMIUM');
  });

  test('Classe: classe inválida -> 400', async () => {
    await expect(veiculosService.editarClasse('v1', 'LUXO')).rejects.toMatchObject({ statusCode: 400 });
  });

  test('Atualização genérica: PATCH veiculos/:id tenta alterar classe e é ignorado', async () => {
    veiculosRepository.findById.mockResolvedValue({ id: 'v1', motoristaId: 'mot-1', porte: 'Medio', classe: 'NORMAL' });
    veiculosRepository.update.mockImplementation(async (id, dados) => ({ id, ...dados }));

    const payload = { marca: 'Fiat', classe: 'PREMIUM' }; // tentando fraudar classe
    await veiculosService.atualizar('v1', payload, { id: 'mot-1', perfil: 'MOTORISTA' });

    // repository não deve receber classe PREMIUM! (só altera classe se alterar porte)
    expect(veiculosRepository.update).toHaveBeenCalledWith('v1', { marca: 'Fiat' });
  });

  test('Atualização genérica: PATCH veiculos/:id alterando porte recalcula classe', async () => {
    veiculosRepository.findById.mockResolvedValue({ id: 'v1', motoristaId: 'mot-1', porte: 'Medio', classe: 'NORMAL' });
    veiculosRepository.update.mockImplementation(async (id, dados) => ({ id, ...dados }));

    const payload = { porte: 'Grande' }; // mudou porte
    await veiculosService.atualizar('v1', payload, { id: 'mot-1', perfil: 'MOTORISTA' });

    // repository agora deve receber porte e a classe nova recalculada
    expect(veiculosRepository.update).toHaveBeenCalledWith('v1', { porte: 'Grande', classe: 'PREMIUM' });
  });
});