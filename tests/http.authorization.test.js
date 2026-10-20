const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const veiculosRepository = require('../src/veiculos/veiculos.repository');
const corridasRepository = require('../src/corridas/corridas.repository');
const notificacoesRepository = require('../src/notificacoes/notificacoes.repository');
const motoristasRepository = require('../src/motoristas/motoristas.repository');
const authRepository = require('../src/auth/auth.repository');
const auditoriaService = require('../src/auditoria/auditoria.service');

jest.mock('../src/veiculos/veiculos.repository');
jest.mock('../src/corridas/corridas.repository');
jest.mock('../src/notificacoes/notificacoes.repository');
jest.mock('../src/motoristas/motoristas.repository');
jest.mock('../src/auth/auth.repository');
jest.mock('../src/auditoria/auditoria.service');

describe('HTTP Authorization Tests', () => {
  const SECRET = process.env.JWT_SECRET || 'secret-test';
  process.env.JWT_SECRET = SECRET;
  
  const tokenAdmin = jwt.sign({ sub: 'admin-1', perfil: 'ADMINISTRADOR' }, SECRET, { expiresIn: '1h' });
  const tokenMotA = jwt.sign({ sub: 'mot-1', perfil: 'MOTORISTA' }, SECRET, { expiresIn: '1h' });
  const tokenUserA = jwt.sign({ sub: 'user-1', perfil: 'USUARIO' }, SECRET, { expiresIn: '1h' });
  const tokenExpirado = jwt.sign({ sub: 'user-1', perfil: 'USUARIO' }, SECRET, { expiresIn: '-10s' });
  const tokenInvalido = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.token';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mocks de autenticação
    authRepository.encontrarPorId.mockImplementation(async (id) => {
      if (id === 'admin-1') return { id: 'admin-1', perfil: 'ADMINISTRADOR', statusCadastro: 'APROVADO' };
      if (id === 'mot-1') return { id: 'mot-1', perfil: 'MOTORISTA', statusCadastro: 'APROVADO' };
      if (id === 'user-1') return { id: 'user-1', perfil: 'USUARIO', statusCadastro: 'APROVADO' };
      if (id === 'user-2') return { id: 'user-2', perfil: 'USUARIO', statusCadastro: 'APROVADO' };
      return null;
    });

    motoristasRepository.findByUsuarioId.mockResolvedValue({ id: 'mot-record-1', usuarioId: 'mot-1', statusCadastro: 'APROVADO' });
    veiculosRepository.findDisponiveis.mockResolvedValue([{ id: 'v1', classe: 'BASICO', motoristaId: 'mot-1' }]);
    veiculosRepository.findById.mockResolvedValue({ id: 'v1', motoristaId: 'mot-1', porte: 'Pequeno', classe: 'BASICO', statusAprovacao: 'PENDENTE' });
  });

  describe('Autenticação Básica (qualquer rota protegida)', () => {
    test('Sem token -> 401', async () => {
      const res = await request(app).get('/api/corridas/minhas');
      expect(res.statusCode).toBe(401);
    });

    test('Token inválido -> 401', async () => {
      const res = await request(app).get('/api/corridas/minhas').set('x-auth-token', tokenInvalido);
      expect(res.statusCode).toBe(401);
    });

    test('Token expirado -> 401', async () => {
      const res = await request(app).get('/api/corridas/minhas').set('x-auth-token', tokenExpirado);
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /corridas/minhas', () => {
    test('Acessando com token válido -> 200', async () => {
      corridasRepository.findByUsuarioId.mockResolvedValue([]);
      const res = await request(app).get('/api/corridas/minhas').set('x-auth-token', tokenUserA);
      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /corridas e GET /corridas/:id (Autorização e acesso a recursos)', () => {
    test('Perfil sem permissão (USUARIO em rota exclusiva de Admin GET /corridas) -> 403', async () => {
      const res = await request(app).get('/api/corridas').set('x-auth-token', tokenUserA);
      expect(res.statusCode).toBe(403);
    });

    test('Usuário autorizado acessa sua própria corrida -> 200', async () => {
      corridasRepository.findById.mockResolvedValue({ id: 'corrida-1', usuarioId: 'user-1', status: 'SOLICITADA' });
      const res = await request(app).get('/api/corridas/corrida-1').set('x-auth-token', tokenUserA);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.id).toBe('corrida-1');
    });

    test('Usuário tenta acessar corrida pertencente a outro usuário -> 403', async () => {
      corridasRepository.findById.mockResolvedValue({ id: 'corrida-2', usuarioId: 'user-2', status: 'SOLICITADA' });
      const res = await request(app).get('/api/corridas/corrida-2').set('x-auth-token', tokenUserA);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /usuarios/:id (Acesso a dados do próprio usuário vs terceiro)', () => {
    test('Usuário autorizado acessa o próprio perfil -> 200', async () => {
      const res = await request(app).get('/api/usuarios/user-1').set('x-auth-token', tokenUserA);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.id).toBe('user-1');
    });

    test('Usuário tenta acessar perfil pertencente a outro usuário -> 403', async () => {
      const res = await request(app).get('/api/usuarios/user-2').set('x-auth-token', tokenUserA);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /corridas', () => {
    test('Criação de corrida (não requer usuarioId, extrai do token) -> 201', async () => {
      corridasRepository.create.mockImplementation(async (dados) => ({ id: 'c-1', ...dados }));
      const res = await request(app).post('/api/corridas')
        .set('x-auth-token', tokenUserA)
        .send({
          origemNome: 'A', destinoNome: 'B', distanciaKm: 5, classe: 'BASICO', dataHorario: new Date().toISOString()
        });
      expect(res.statusCode).toBe(201);
      expect(corridasRepository.create).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: 'user-1' }));
      expect(res.body.data.usuarioId).toBe('user-1');
    });

    test('Envio de usuarioId de terceiro no payload não permite falsificar o proprietário -> 201 com identidade do token', async () => {
      corridasRepository.create.mockImplementation(async (dados) => ({ id: 'c-2', ...dados }));
      const res = await request(app).post('/api/corridas')
        .set('x-auth-token', tokenUserA)
        .send({
          usuarioId: 'user-2',
          origemNome: 'A',
          destinoNome: 'B',
          distanciaKm: 5,
          classe: 'BASICO',
          dataHorario: new Date().toISOString()
        });
      expect(res.statusCode).toBe(201);
      expect(corridasRepository.create).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: 'user-1' }));
      expect(res.body.data.usuarioId).toBe('user-1');
    });

    test('Tentativa de criar corrida sem autenticação -> 401 e não persiste', async () => {
      const res = await request(app).post('/api/corridas')
        .send({
          origemNome: 'A', destinoNome: 'B', distanciaKm: 5, classe: 'BASICO', dataHorario: new Date().toISOString()
        });
      expect(res.statusCode).toBe(401);
      expect(corridasRepository.create).not.toHaveBeenCalled();
    });

    test('Tentativa de criar corrida com campos obrigatórios inválidos -> 400 e não persiste', async () => {
      const res = await request(app).post('/api/corridas')
        .set('x-auth-token', tokenUserA)
        .send({
          origemNome: 'A', distanciaKm: 5 // falta destinoNome
        });
      expect(res.statusCode).toBe(400);
      expect(corridasRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('POST /veiculos', () => {
    test('Cadastro de veículo -> utiliza usuário autenticado -> 201', async () => {
      veiculosRepository.findByMotoristaId.mockResolvedValue(null);
      veiculosRepository.create.mockResolvedValue({ id: 'v2', motoristaId: 'mot-1', porte: 'Pequeno' });
      const res = await request(app).post('/api/veiculos')
        .set('x-auth-token', tokenMotA)
        .send({
          marca: 'Fiat', modelo: 'Uno', ano: 2025, placa: 'ABC1234', porte: 'Pequeno', quilometragem: 0, quantidadePassageiros: 4, possuiArCondicionado: true, possuiExtintor: true, possuiCintoSeguranca: true, documentacaoRegularizada: true
        });
      expect(res.statusCode).toBe(201);
      expect(veiculosRepository.create).toHaveBeenCalledWith(expect.objectContaining({ motoristaId: 'mot-1' }));
    });
  });

  describe('PATCH /veiculos/:id/aprovar', () => {
    test('Motorista tenta aprovar veículo -> 403', async () => {
      const res = await request(app).patch('/api/veiculos/v1/aprovar').set('x-auth-token', tokenMotA);
      expect(res.statusCode).toBe(403); // Requer admin
    });

    test('Admin tenta aprovar veículo -> 200', async () => {
      veiculosRepository.updateStatusAprovacao.mockResolvedValue({ id: 'v1', statusAprovacao: 'APROVADO', classe: 'BASICO' });
      const res = await request(app).patch('/api/veiculos/v1/aprovar').set('x-auth-token', tokenAdmin);
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Remoção da rota enganosa PATCH /veiculos/:id/classe', () => {
    test('Rota PATCH /veiculos/:id/classe não está mais registrada -> 404 para qualquer perfil', async () => {
      const resMot = await request(app).patch('/api/veiculos/v1/classe').set('x-auth-token', tokenMotA).send({ classe: 'PREMIUM' });
      expect(resMot.statusCode).toBe(404);

      const resAdmin = await request(app).patch('/api/veiculos/v1/classe').set('x-auth-token', tokenAdmin).send({ classe: 'PREMIUM' });
      expect(resAdmin.statusCode).toBe(404);
    });
  });

  describe('PATCH /veiculos/:id', () => {
    test('Motorista atualiza PRÓPRIO veículo -> 200', async () => {
      veiculosRepository.update.mockResolvedValue({ id: 'v1', marca: 'Ford' });
      const res = await request(app).patch('/api/veiculos/v1').set('x-auth-token', tokenMotA).send({ marca: 'Ford' });
      expect(res.statusCode).toBe(200);
    });

    test('Motorista tenta alterar porte via PATCH /veiculos/:id -> 403', async () => {
      const res = await request(app).patch('/api/veiculos/v1').set('x-auth-token', tokenMotA).send({ porte: 'Grande' });
      expect(res.statusCode).toBe(403);
      expect(veiculosRepository.update).not.toHaveBeenCalled();
    });

    test('Motorista tenta alterar classe diretamente via PATCH /veiculos/:id -> 403', async () => {
      const res = await request(app).patch('/api/veiculos/v1').set('x-auth-token', tokenMotA).send({ classe: 'PREMIUM' });
      expect(res.statusCode).toBe(403);
      expect(veiculosRepository.update).not.toHaveBeenCalled();
    });

    test('Admin altera porte do veículo e recalcula classe atomicamente -> 200', async () => {
      veiculosRepository.update.mockImplementation(async (id, dados) => ({ id, ...dados }));
      const res = await request(app).patch('/api/veiculos/v1').set('x-auth-token', tokenAdmin).send({ porte: 'Grande' });
      expect(res.statusCode).toBe(200);
      expect(veiculosRepository.update).toHaveBeenCalledWith('v1', { porte: 'Grande', classe: 'PREMIUM' });
    });

    test('Usuário tenta atualizar veículo de outro (simulado pelo ID mockado) -> 403', async () => {
      veiculosRepository.findById.mockResolvedValue({ id: 'v1', motoristaId: 'admin-1' }); // Dono diferente
      const res = await request(app).patch('/api/veiculos/v1').set('x-auth-token', tokenMotA).send({ marca: 'Ford' });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /notificacoes', () => {
    test('Usuário acessa suas notificações -> 200', async () => {
      notificacoesRepository.findByDestinatario.mockResolvedValue([]);
      notificacoesRepository.findNaoLidas.mockResolvedValue([]);
      const res = await request(app).get('/api/notificacoes').set('x-auth-token', tokenUserA);
      expect(res.statusCode).toBe(200);
    });
  });

  describe('PATCH /notificacoes/ler-todas', () => {
    test('Usuário marca notificações como lidas -> 200', async () => {
      notificacoesRepository.marcarTodasLidas.mockResolvedValue(true);
      const res = await request(app).patch('/api/notificacoes/ler-todas').set('x-auth-token', tokenUserA);
      expect(res.statusCode).toBe(200);
    });
  });
});
