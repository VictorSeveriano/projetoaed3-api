'use strict';

/**
 * geocoding-reverso.test.js — Testes de geocodificação reversa (GPS -> endereço legível),
 * preservação das coordenadas originais, validação contra rótulo genérico de GPS
 * e exibição consistente na entidade Corrida.
 */

const EventEmitter = require('events');
const https = require('https');
const geocodingProvider = require('../src/rotas/providers/geocoding.provider');
const rotasService = require('../src/rotas/rotas.service');
const rotasController = require('../src/rotas/rotas.controller');
const CorridasService = require('../src/corridas/corridas.service');
const corridasRepository = require('../src/corridas/corridas.repository');
const veiculosRepository = require('../src/veiculos/veiculos.repository');
const motoristasRepository = require('../src/motoristas/motoristas.repository');
const notificacoesService = require('../src/notificacoes/notificacoes.service');
const auditoriaService = require('../src/auditoria/auditoria.service');
const Corrida = require('../src/corridas/Corrida');
const AppError = require('../src/utils/AppError');

jest.mock('../src/corridas/corridas.repository');
jest.mock('../src/veiculos/veiculos.repository');
jest.mock('../src/motoristas/motoristas.repository');
jest.mock('../src/notificacoes/notificacoes.service');
jest.mock('../src/auditoria/auditoria.service');

describe('Geocodificação Reversa (GPS -> Endereço Legível)', () => {
  beforeEach(() => {
    geocodingProvider._geocodingCache.clear();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('formata endereço completo com logradouro, número, bairro, município e UF preservando coordenadas reais do GPS', () => {
    const latRealGps = -20.297618;
    const lngRealGps = -40.295776;

    const respostaNominatim = {
      lat: '-20.298000', // centroide aproximado retornado pelo provedor
      lon: '-40.296000',
      display_name: 'Avenida Nossa Senhora da Penha, 1234, Santa Luíza, Vitória, Espírito Santo, Brasil',
      address: {
        road: 'Avenida Nossa Senhora da Penha',
        house_number: '1234',
        suburb: 'Santa Luíza',
        city: 'Vitória',
        state: 'Espírito Santo',
        'ISO3166-2-lvl4': 'BR-ES',
        postcode: '29045-402',
      },
    };

    const resultado = geocodingProvider.formatarResultadoReverso(
      respostaNominatim,
      latRealGps,
      lngRealGps
    );

    expect(resultado).toEqual({
      descricao: 'Avenida Nossa Senhora da Penha, 1234, Santa Luíza, Vitória - ES',
      logradouro: 'Avenida Nossa Senhora da Penha',
      numero: '1234',
      complemento: '',
      bairro: 'Santa Luíza',
      cidade: 'Vitória',
      estado: 'Espírito Santo',
      uf: 'ES',
      cep: '29045-402',
      latitude: latRealGps,
      longitude: lngRealGps,
    });
  });

  test('formata endereço sem número do imóvel sem inventar número', () => {
    const latRealGps = -20.195432;
    const lngRealGps = -40.217891;

    const respostaSemNumero = {
      lat: '-20.195500',
      lon: '-40.218000',
      display_name: 'Rodovia ES-010, Manguinhos, Serra, Espírito Santo, Brasil',
      address: {
        road: 'Rodovia ES-010',
        suburb: 'Manguinhos',
        town: 'Serra',
        state: 'Espírito Santo',
        postcode: '29173087',
      },
    };

    const resultado = geocodingProvider.formatarResultadoReverso(
      respostaSemNumero,
      latRealGps,
      lngRealGps
    );

    expect(resultado.descricao).toBe('Rodovia ES-010, Manguinhos, Serra - ES');
    expect(resultado.numero).toBe('');
    expect(resultado.logradouro).toBe('Rodovia ES-010');
    expect(resultado.bairro).toBe('Manguinhos');
    expect(resultado.cidade).toBe('Serra');
    expect(resultado.uf).toBe('ES');
    expect(resultado.cep).toBe('29173-087');
    expect(resultado.latitude).toBe(latRealGps);
    expect(resultado.longitude).toBe(lngRealGps);
  });

  test('geocodificarReverso consulta Nominatim e preserva as coordenadas reais informadas', async () => {
    const mockRes = new EventEmitter();
    mockRes.statusCode = 200;

    const mockReq = new EventEmitter();
    mockReq.setTimeout = jest.fn();
    mockReq.destroy = jest.fn();

    jest.spyOn(https, 'get').mockImplementation((url, opts, cb) => {
      expect(url).toContain('nominatim.openstreetmap.org/reverse');
      expect(url).toContain('lat=-20.3155');
      expect(url).toContain('lon=-40.3128');
      cb(mockRes);
      process.nextTick(() => {
        mockRes.emit(
          'data',
          JSON.stringify({
            lat: '-20.3160',
            lon: '-40.3130',
            address: {
              road: 'Avenida Jerônimo Monteiro',
              house_number: '1000',
              suburb: 'Centro',
              city: 'Vitória',
              state: 'Espírito Santo',
              'ISO3166-2-lvl4': 'BR-ES',
            },
          })
        );
        mockRes.emit('end');
      });
      return mockReq;
    });

    const endereco = await rotasService.geocodificarReverso(-20.3155, -40.3128);
    expect(endereco.descricao).toBe('Avenida Jerônimo Monteiro, 1000, Centro, Vitória - ES');
    expect(endereco.latitude).toBe(-20.3155);
    expect(endereco.longitude).toBe(-40.3128);
  });

  test('trata resposta sem endereço encontrado com erro 404 claro', async () => {
    const mockRes = new EventEmitter();
    mockRes.statusCode = 200;
    const mockReq = new EventEmitter();
    mockReq.setTimeout = jest.fn();
    mockReq.destroy = jest.fn();

    jest.spyOn(https, 'get').mockImplementation((url, opts, cb) => {
      cb(mockRes);
      process.nextTick(() => {
        mockRes.emit('data', JSON.stringify({ error: 'Unable to geocode' }));
        mockRes.emit('end');
      });
      return mockReq;
    });

    await expect(rotasService.geocodificarReverso(-25.0, -30.0)).rejects.toMatchObject({
      statusCode: 404,
      message: expect.stringMatching(/identificar um endereco/i),
    });
  });

  test('trata falha de rede no serviço de geocodificação reversa com erro 503', async () => {
    const mockReq = new EventEmitter();
    mockReq.setTimeout = jest.fn();
    mockReq.destroy = jest.fn();

    jest.spyOn(https, 'get').mockImplementation(() => {
      process.nextTick(() => {
        mockReq.emit('error', new Error('ECONNREFUSED'));
      });
      return mockReq;
    });

    await expect(rotasService.geocodificarReverso(-20.3155, -40.3128)).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringMatching(/indisponivel/i),
    });
  });

  test('controller geocodificarReverso valida coordenadas inválidas com 400', async () => {
    const req = { query: { lat: 'invalido', lng: '-40.3' } };
    const res = {};
    const next = jest.fn();

    await rotasController.geocodificarReverso(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].statusCode).toBe(400);
  });
});

describe('Persistência e exibição do endereço de origem obtido pelo GPS na corrida', () => {
  const usuarioAutenticado = { id: 'user-gps-1', perfil: 'USUARIO' };

  beforeEach(() => {
    jest.clearAllMocks();
    veiculosRepository.findDisponiveis.mockResolvedValue([
      { id: 'v1', classe: 'BASICO', motoristaId: 'mot-1' },
    ]);
    motoristasRepository.findByUsuarioId.mockResolvedValue({ statusCadastro: 'APROVADO' });
    corridasRepository.create.mockImplementation(async (dados) => ({
      id: 'corrida-gps-1',
      status: 'SOLICITADA',
      criadaEm: new Date('2026-10-29T14:00:00Z'),
      ...dados,
    }));
  });

  test('rejeita criação de corrida quando origemNome ainda contém texto genérico "Localizacao Atual (GPS)"', async () => {
    await expect(
      CorridasService.criar(
        {
          origemNome: 'Localizacao Atual (GPS)',
          destinoNome: 'Rodovia ES-010, KM 6, Manguinhos, Serra - ES',
          origemLat: -20.297618,
          origemLng: -40.295776,
          destinoLat: -20.195432,
          destinoLng: -40.217891,
          distanciaKm: 17.92,
          duracaoMin: 39,
          classe: 'BASICO',
          formaPagamento: 'DINHEIRO',
          dataHorario: '2026-10-29T14:00:00.000Z',
        },
        usuarioAutenticado
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/convertido em um endere[cç]o leg[ií]vel/i),
    });
  });

  test('persiste endereço legível, endereço estruturado e coordenadas reais do GPS e os exibe nas listagens/detalhes', async () => {
    const payloadGpsConvertido = {
      origemNome: 'Avenida Nossa Senhora da Penha, 1234, Santa Luíza, Vitória - ES',
      destinoNome: 'Rodovia ES-010, Manguinhos, Serra - ES',
      origemLat: -20.297618,
      origemLng: -40.295776,
      destinoLat: -20.195432,
      destinoLng: -40.217891,
      origemEndereco: {
        logradouro: 'Avenida Nossa Senhora da Penha',
        numero: '1234',
        bairro: 'Santa Luíza',
        cidade: 'Vitória',
        estado: 'Espírito Santo',
        uf: 'ES',
        cep: '29045-402',
        latitude: -20.297618,
        longitude: -40.295776,
      },
      distanciaKm: 17.92,
      duracaoMin: 39,
      classe: 'BASICO',
      formaPagamento: 'DINHEIRO',
      dataHorario: '2026-10-29T14:00:00.000Z',
    };

    const criada = await CorridasService.criar(payloadGpsConvertido, usuarioAutenticado);

    expect(corridasRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        origemNome: 'Avenida Nossa Senhora da Penha, 1234, Santa Luíza, Vitória - ES',
        origemLat: -20.297618,
        origemLng: -40.295776,
        origemEndereco: expect.objectContaining({
          logradouro: 'Avenida Nossa Senhora da Penha',
          numero: '1234',
          bairro: 'Santa Luíza',
          cidade: 'Vitória',
          uf: 'ES',
        }),
      })
    );

    const entidade = new Corrida(criada);
    expect(entidade.origemNome).toBe('Avenida Nossa Senhora da Penha, 1234, Santa Luíza, Vitória - ES');
    expect(entidade.origemLat).toBe(-20.297618);
    expect(entidade.origemLng).toBe(-40.295776);
  });
});
