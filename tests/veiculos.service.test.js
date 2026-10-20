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
    notificacoesService.notificarSolicitacaoVeiculo.mockResolvedValue({});
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

  test('Porte inválido no cadastro -> rejeitado (400) e não persiste', async () => {
    await expect(veiculosService.cadastrar('motorista-id', {
      marca: 'M', modelo: 'M', ano: 2025, placa: 'ABC1234', porte: 'Gigante'
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(veiculosRepository.create).not.toHaveBeenCalled();
  });

  test('Campos obrigatórios ausentes no cadastro -> rejeitado (400) e não persiste', async () => {
    await expect(veiculosService.cadastrar('motorista-id', {
      marca: 'M', modelo: 'M', ano: 2025, porte: 'Medio' // falta placa
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(veiculosRepository.create).not.toHaveBeenCalled();
  });

  test('Motorista já possui veículo ativo (PENDENTE, DISPONIVEL ou EM_CORRIDA) -> rejeitado (409) e não persiste', async () => {
    veiculosRepository.findByMotoristaId.mockResolvedValue({ id: 'v-existente', status: 'DISPONIVEL' });
    await expect(veiculosService.cadastrar('motorista-id', {
      marca: 'M', modelo: 'M', ano: 2025, placa: 'ABC1234', porte: 'Medio'
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(veiculosRepository.create).not.toHaveBeenCalled();
  });

  test('Normaliza variação de caixa/espaços do porte e mantém consistência com a classe no cadastro', async () => {
    veiculosRepository.create.mockImplementation(async (dados) => dados);
    const p = await veiculosService.cadastrar('motorista-id', {
      marca: 'Fiat', modelo: 'Mobi', ano: 2024, placa: 'AAA1111', porte: ' pequeno '
    });
    expect(p).toMatchObject({ porte: 'Pequeno', classe: 'BASICO' });

    const m = await veiculosService.cadastrar('motorista-id', {
      marca: 'Toyota', modelo: 'Corolla', ano: 2024, placa: 'BBB2222', porte: 'MEDIO'
    });
    expect(m).toMatchObject({ porte: 'Medio', classe: 'NORMAL' });

    const g = await veiculosService.cadastrar('motorista-id', {
      marca: 'Jeep', modelo: 'Commander', ano: 2024, placa: 'CCC3333', porte: 'grande'
    });
    expect(g).toMatchObject({ porte: 'Grande', classe: 'PREMIUM' });
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

  test('Aprovação: mantém/recalcula classe correta para Pequeno (BASICO) e Grande (PREMIUM) e corrige inconsistência prévia', async () => {
    // Veículo Pequeno pendente
    veiculosRepository.findById.mockResolvedValueOnce({ id: 'v-peq', statusAprovacao: 'PENDENTE', porte: 'Pequeno', classe: 'BASICO' });
    veiculosRepository.updateStatusAprovacao.mockResolvedValueOnce({ id: 'v-peq', statusAprovacao: 'APROVADO', porte: 'Pequeno', classe: 'BASICO' });
    const vPeq = await veiculosService.aprovar('v-peq');
    expect(veiculosRepository.updateStatusAprovacao).toHaveBeenCalledWith('v-peq', 'APROVADO', 'BASICO');
    expect(vPeq.classe).toBe('BASICO');

    // Veículo Grande com classe inconsistente antes da aprovação -> aprovar recalcula a partir do porte
    veiculosRepository.findById.mockResolvedValueOnce({ id: 'v-inconsistente', statusAprovacao: 'PENDENTE', porte: 'Grande', classe: 'BASICO' });
    veiculosRepository.updateStatusAprovacao.mockResolvedValueOnce({ id: 'v-inconsistente', statusAprovacao: 'APROVADO', porte: 'Grande', classe: 'PREMIUM' });
    const vCorr = await veiculosService.aprovar('v-inconsistente');
    expect(veiculosRepository.updateStatusAprovacao).toHaveBeenCalledWith('v-inconsistente', 'APROVADO', 'PREMIUM');
    expect(vCorr.classe).toBe('PREMIUM');
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

  test('Classe: editarClasse em veículo inexistente ou excluído -> 404 e não persiste', async () => {
    veiculosRepository.findById.mockResolvedValueOnce(null);
    await expect(veiculosService.editarClasse('v-inexistente', 'NORMAL')).rejects.toMatchObject({ statusCode: 404 });

    veiculosRepository.findById.mockResolvedValueOnce({ id: 'v-excluido', statusAprovacao: 'EXCLUIDO' });
    await expect(veiculosService.editarClasse('v-excluido', 'NORMAL')).rejects.toMatchObject({ statusCode: 404 });

    expect(veiculosRepository.updateClasse).not.toHaveBeenCalled();
  });

  test('Atualização genérica: PATCH veiculos/:id tenta alterar classe e é ignorado', async () => {
    veiculosRepository.findById.mockResolvedValue({ id: 'v1', motoristaId: 'mot-1', porte: 'Medio', classe: 'NORMAL' });
    veiculosRepository.update.mockImplementation(async (id, dados) => ({ id, ...dados }));

    const payload = { marca: 'Fiat', classe: 'PREMIUM' }; // tentando fraudar classe
    await veiculosService.atualizar('v1', payload, { id: 'mot-1', perfil: 'MOTORISTA' });

    // repository não deve receber classe PREMIUM! (só altera classe se alterar porte)
    expect(veiculosRepository.update).toHaveBeenCalledWith('v1', { marca: 'Fiat' });
  });

  test('Atualização genérica: mesmo ADMINISTRADOR não altera classe diretamente via atualizar sem mudar porte', async () => {
    veiculosRepository.findById.mockResolvedValue({ id: 'v1', motoristaId: 'mot-1', porte: 'Pequeno', classe: 'BASICO', statusAprovacao: 'APROVADO' });
    veiculosRepository.update.mockImplementation(async (id, dados) => ({ id, ...dados }));

    await veiculosService.atualizar('v1', { cor: 'Prata', classe: 'PREMIUM' }, { id: 'admin-1', perfil: 'ADMINISTRADOR' });
    expect(veiculosRepository.update).toHaveBeenCalledWith('v1', { cor: 'Prata' });
  });

  test('Atualização genérica: PATCH veiculos/:id alterando porte recalcula classe', async () => {
    veiculosRepository.findById.mockResolvedValue({ id: 'v1', motoristaId: 'mot-1', porte: 'Medio', classe: 'NORMAL' });
    veiculosRepository.update.mockImplementation(async (id, dados) => ({ id, ...dados }));

    const payload = { porte: 'Grande' }; // mudou porte
    await veiculosService.atualizar('v1', payload, { id: 'mot-1', perfil: 'MOTORISTA' });

    // repository agora deve receber porte e a classe nova recalculada
    expect(veiculosRepository.update).toHaveBeenCalledWith('v1', { porte: 'Grande', classe: 'PREMIUM' });
  });

  test('Atualização genérica: alteração de porte em veículo aprovado recalcula classe para todas as transições e corrige eventual inconsistência', async () => {
    veiculosRepository.update.mockImplementation(async (id, dados) => ({ id, ...dados }));

    // Grande (PREMIUM) -> Pequeno (BASICO) em veículo aprovado
    veiculosRepository.findById.mockResolvedValueOnce({
      id: 'v1', motoristaId: 'mot-1', porte: 'Grande', classe: 'PREMIUM', statusAprovacao: 'APROVADO', status: 'DISPONIVEL'
    });
    const resPeq = await veiculosService.atualizar('v1', { porte: 'Pequeno' }, { id: 'mot-1', perfil: 'MOTORISTA' });
    expect(veiculosRepository.update).toHaveBeenLastCalledWith('v1', { porte: 'Pequeno', classe: 'BASICO' });
    expect(resPeq).toMatchObject({ porte: 'Pequeno', classe: 'BASICO' });

    // Pequeno (BASICO) -> Medio (NORMAL) em veículo aprovado
    veiculosRepository.findById.mockResolvedValueOnce({
      id: 'v1', motoristaId: 'mot-1', porte: 'Pequeno', classe: 'BASICO', statusAprovacao: 'APROVADO', status: 'DISPONIVEL'
    });
    const resMed = await veiculosService.atualizar('v1', { porte: 'Medio' }, { id: 'mot-1', perfil: 'MOTORISTA' });
    expect(veiculosRepository.update).toHaveBeenLastCalledWith('v1', { porte: 'Medio', classe: 'NORMAL' });
    expect(resMed).toMatchObject({ porte: 'Medio', classe: 'NORMAL' });

    // Veículo com inconsistência prévia (porte Grande, mas classe BASICO) recebendo porte Grande -> corrige classe para PREMIUM
    veiculosRepository.findById.mockResolvedValueOnce({
      id: 'v1', motoristaId: 'mot-1', porte: 'Grande', classe: 'BASICO', statusAprovacao: 'APROVADO'
    });
    const resInconsistente = await veiculosService.atualizar('v1', { porte: 'Grande' }, { id: 'mot-1', perfil: 'MOTORISTA' });
    expect(veiculosRepository.update).toHaveBeenLastCalledWith('v1', { porte: 'Grande', classe: 'PREMIUM' });
    expect(resInconsistente).toMatchObject({ porte: 'Grande', classe: 'PREMIUM' });
  });

  test('Atualização genérica: porte inválido -> 400', async () => {
    veiculosRepository.findById.mockResolvedValue({ id: 'v1', motoristaId: 'mot-1', porte: 'Medio', classe: 'NORMAL' });
    const payload = { porte: 'Gigante' }; // porte invalido
    await expect(veiculosService.atualizar('v1', payload, { id: 'mot-1', perfil: 'MOTORISTA' }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(veiculosRepository.update).not.toHaveBeenCalled();
  });
});

describe('VeiculosService exclusão, rejeição e autorização', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    veiculosRepository.findById = jest.fn();
    veiculosRepository.updateStatusAprovacao = jest.fn();
    veiculosRepository.updateClasse = jest.fn();
    veiculosRepository.update = jest.fn();
    veiculosRepository.softDelete = jest.fn();
  });

  test('Exclusão: motorista proprietário exclui próprio veículo disponível -> softDelete chamado', async () => {
    veiculosRepository.findById.mockResolvedValue({
      id: 'v1', motoristaId: 'mot-1', statusAprovacao: 'APROVADO', status: 'DISPONIVEL'
    });
    veiculosRepository.softDelete.mockResolvedValue({
      id: 'v1', motoristaId: 'mot-1', statusAprovacao: 'EXCLUIDO', status: 'INDISPONIVEL'
    });

    const res = await veiculosService.excluir('v1', { id: 'mot-1', perfil: 'MOTORISTA' });
    expect(veiculosRepository.softDelete).toHaveBeenCalledWith('v1');
    expect(res.statusAprovacao).toBe('EXCLUIDO');
    expect(res.status).toBe('INDISPONIVEL');
  });

  test('Exclusão: tentativa de excluir veículo em corrida (EM_CORRIDA) -> 409 e não exclui', async () => {
    veiculosRepository.findById.mockResolvedValue({
      id: 'v1', motoristaId: 'mot-1', statusAprovacao: 'APROVADO', status: 'EM_CORRIDA'
    });

    await expect(
      veiculosService.excluir('v1', { id: 'mot-1', perfil: 'MOTORISTA' })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(veiculosRepository.softDelete).not.toHaveBeenCalled();
  });

  test('Exclusão: tentativa de excluir veículo de outro motorista -> 403 e não exclui', async () => {
    veiculosRepository.findById.mockResolvedValue({
      id: 'v1', motoristaId: 'mot-1', statusAprovacao: 'APROVADO', status: 'DISPONIVEL'
    });

    await expect(
      veiculosService.excluir('v1', { id: 'mot-2', perfil: 'MOTORISTA' })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(veiculosRepository.softDelete).not.toHaveBeenCalled();
  });

  test('Exclusão: tentativa de excluir por perfil não-motorista ou não autenticado -> 403 e não exclui', async () => {
    await expect(
      veiculosService.excluir('v1', { id: 'admin-1', perfil: 'ADMINISTRADOR' })
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      veiculosService.excluir('v1', { id: 'user-1', perfil: 'USUARIO' })
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      veiculosService.excluir('v1', null)
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(veiculosRepository.softDelete).not.toHaveBeenCalled();
  });

  test('Exclusão: tentativa de excluir veículo inexistente ou já excluído -> 404 e não exclui', async () => {
    veiculosRepository.findById.mockResolvedValueOnce(null);
    await expect(
      veiculosService.excluir('v-inexistente', { id: 'mot-1', perfil: 'MOTORISTA' })
    ).rejects.toMatchObject({ statusCode: 404 });

    veiculosRepository.findById.mockResolvedValueOnce({
      id: 'v-excluido', motoristaId: 'mot-1', statusAprovacao: 'EXCLUIDO', status: 'INDISPONIVEL'
    });
    await expect(
      veiculosService.excluir('v-excluido', { id: 'mot-1', perfil: 'MOTORISTA' })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(veiculosRepository.softDelete).not.toHaveBeenCalled();
  });

  test('Autorização na atualização: outro motorista não pode alterar veículo alheio -> 403', async () => {
    veiculosRepository.findById.mockResolvedValue({
      id: 'v1', motoristaId: 'mot-1', porte: 'Medio', classe: 'NORMAL', statusAprovacao: 'APROVADO'
    });

    await expect(
      veiculosService.atualizar('v1', { marca: 'Honda' }, { id: 'mot-2', perfil: 'MOTORISTA' })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(veiculosRepository.update).not.toHaveBeenCalled();
  });

  test('Autorização na atualização: requisição sem usuário autenticado -> 401', async () => {
    await expect(
      veiculosService.atualizar('v1', { marca: 'Honda' }, null)
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(veiculosRepository.update).not.toHaveBeenCalled();
  });

  test('Atualização de veículo excluído ou inexistente -> 404 e não persiste', async () => {
    veiculosRepository.findById.mockResolvedValueOnce(null);
    await expect(
      veiculosService.atualizar('v-inexistente', { marca: 'Honda' }, { id: 'mot-1', perfil: 'MOTORISTA' })
    ).rejects.toMatchObject({ statusCode: 404 });

    veiculosRepository.findById.mockResolvedValueOnce({
      id: 'v-excluido', motoristaId: 'mot-1', statusAprovacao: 'EXCLUIDO'
    });
    await expect(
      veiculosService.atualizar('v-excluido', { marca: 'Honda' }, { id: 'mot-1', perfil: 'MOTORISTA' })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(veiculosRepository.update).not.toHaveBeenCalled();
  });

  test('Rejeição: aprova rejeição de pendente e bloqueia veículo já rejeitado (409) ou excluído/inexistente (404)', async () => {
    veiculosRepository.findById.mockResolvedValueOnce({ id: 'v1', statusAprovacao: 'PENDENTE' });
    veiculosRepository.updateStatusAprovacao.mockResolvedValueOnce({ id: 'v1', statusAprovacao: 'REJEITADO' });
    const rejeitado = await veiculosService.rejeitar('v1');
    expect(veiculosRepository.updateStatusAprovacao).toHaveBeenCalledWith('v1', 'REJEITADO');
    expect(rejeitado.statusAprovacao).toBe('REJEITADO');

    veiculosRepository.findById.mockResolvedValueOnce({ id: 'v1', statusAprovacao: 'REJEITADO' });
    await expect(veiculosService.rejeitar('v1')).rejects.toMatchObject({ statusCode: 409 });

    veiculosRepository.findById.mockResolvedValueOnce({ id: 'v1', statusAprovacao: 'EXCLUIDO' });
    await expect(veiculosService.rejeitar('v1')).rejects.toMatchObject({ statusCode: 404 });

    veiculosRepository.findById.mockResolvedValueOnce(null);
    await expect(veiculosService.rejeitar('v-inexistente')).rejects.toMatchObject({ statusCode: 404 });
  });
});