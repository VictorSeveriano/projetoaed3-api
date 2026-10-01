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
});