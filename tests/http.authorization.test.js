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
  const tokenInvalido = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.token';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mocks de autenticação
    authRepository.encontrarPorId.mockImplementation(async (id) => {
      if (id === 'admin-1') return { id: 'admin-1', perfil: 'ADMINISTRADOR', statusCadastro: 'APROVADO' };
      if (id === 'mot-1') return { id: 'mot-1', perfil: 'MOTORISTA', statusCadastro: 'APROVADO' };
      if (id === 'user-1') return { id: 'user-1', perfil: 'USUARIO', statusCadastro: 'APROVADO' };
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
  });

  describe('GET /corridas/minhas', () => {
    test('Acessando com token válido -> 200', async () => {
      corridasRepository.findByUsuarioId.mockResolvedValue([]);
      const res = await request(app).get('/api/corridas/minhas').set('x-auth-token', tokenUserA);
      expect(res.statusCode).toBe(200);
    });
  });

  describe('POST /corridas', () => {
    test('Criação de corrida (não requer usuarioId, extrai do token) -> 201', async () => {
      corridasRepository.create.mockResolvedValue({ id: 1, usuarioId: 'user-1' });
      const res = await request(app).post('/api/corridas')
        .set('x-auth-token', tokenUserA)
        .send({
          origemNome: 'A', destinoNome: 'B', distanciaKm: 5, classe: 'BASICO', dataHorario: new Date().toISOString()
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.data.usuarioId).toBe('user-1');
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

  describe('PATCH /veiculos/:id/classe', () => {
    test('Motorista tenta editar classe diretamente -> 403', async () => {
      const res = await request(app).patch('/api/veiculos/v1/classe').set('x-auth-token', tokenMotA).send({ classe: 'PREMIUM' });
      expect(res.statusCode).toBe(403);
    });

    test('Admin edita classe diretamente -> 200', async () => {
      veiculosRepository.updateClasse.mockResolvedValue({ id: 'v1', classe: 'PREMIUM' });
      const res = await request(app).patch('/api/veiculos/v1/classe').set('x-auth-token', tokenAdmin).send({ classe: 'PREMIUM' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('PATCH /veiculos/:id', () => {
    test('Motorista atualiza PRÓPRIO veículo -> 200', async () => {
      veiculosRepository.update.mockResolvedValue({ id: 'v1', marca: 'Ford' });
      const res = await request(app).patch('/api/veiculos/v1').set('x-auth-token', tokenMotA).send({ marca: 'Ford' });
      expect(res.statusCode).toBe(200);
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
