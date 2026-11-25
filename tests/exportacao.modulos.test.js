'use strict';
/**
 * tests/exportacao.modulos.test.js — Testes de exportação CSV e PDF para
 * Dashboard, Veículos e Usuários, validando fidelidade estrita aos filtros
 * aplicados, permissões administrativas (403 para não-admin) e não exposição de senha.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const corridasRepository = require('../src/corridas/corridas.repository');
const veiculosRepository = require('../src/veiculos/veiculos.repository');
const motoristasRepository = require('../src/motoristas/motoristas.repository');
const authRepository = require('../src/auth/auth.repository');
const auditoriaService = require('../src/auditoria/auditoria.service');
const { readCache } = require('../src/utils/readCache');

jest.mock('../src/corridas/corridas.repository');
jest.mock('../src/veiculos/veiculos.repository');
jest.mock('../src/motoristas/motoristas.repository');
jest.mock('../src/auth/auth.repository');
jest.mock('../src/auditoria/auditoria.service');

describe('Exportação filtrada (CSV e PDF) — Dashboard, Veículos e Usuários', () => {
  const SECRET = process.env.JWT_SECRET || 'secret-test';
  process.env.JWT_SECRET = SECRET;

  const tokenAdmin = jwt.sign({ sub: 'admin-1', perfil: 'ADMINISTRADOR' }, SECRET, { expiresIn: '1h' });
  const tokenUsuario = jwt.sign({ sub: 'user-1', perfil: 'USUARIO' }, SECRET, { expiresIn: '1h' });
  const tokenMotorista = jwt.sign({ sub: 'mot-1', perfil: 'MOTORISTA' }, SECRET, { expiresIn: '1h' });

  beforeEach(() => {
    jest.clearAllMocks();
    readCache.limpar();

    authRepository.encontrarResumoAuthPorId.mockImplementation(async (id) => {
      if (id === 'admin-1') return { id: 'admin-1', nome: 'Admin UCL', usuario: 'admin', perfil: 'ADMINISTRADOR' };
      if (id === 'user-1') return { id: 'user-1', nome: 'Passageiro 1', usuario: 'pass1', perfil: 'USUARIO' };
      if (id === 'mot-1') return { id: 'mot-1', nome: 'Motorista 1', usuario: 'mot1', perfil: 'MOTORISTA' };
      return null;
    });
    authRepository.encontrarPorId.mockImplementation(async (id) => {
      if (id === 'admin-1') return { id: 'admin-1', nome: 'Admin UCL', usuario: 'admin', perfil: 'ADMINISTRADOR' };
      if (id === 'user-1') return { id: 'user-1', nome: 'Passageiro 1', usuario: 'pass1', perfil: 'USUARIO' };
      if (id === 'mot-1') return { id: 'mot-1', nome: 'Carlos Motorista', usuario: 'carlos', perfil: 'MOTORISTA' };
      return null;
    });
    auditoriaService.registrar.mockResolvedValue(null);
  });

  // --------------------------------------------------------------------------
  // 1. AUTORIZAÇÃO ADMINISTRATIVA
  // --------------------------------------------------------------------------
  test('bloqueia exportação de dashboard, veículos e usuários para perfis não-administradores (403)', async () => {
    for (const rota of ['/api/dashboard/exportar', '/api/veiculos/exportar', '/api/usuarios/exportar']) {
      const rPass = await request(app).get(`${rota}?formato=csv`).set('x-auth-token', tokenUsuario);
      expect(rPass.statusCode).toBe(403);

      const rMot = await request(app).get(`${rota}?formato=pdf`).set('x-auth-token', tokenMotorista);
      expect(rMot.statusCode).toBe(403);
    }
  });

  // --------------------------------------------------------------------------
  // 2. DASHBOARD: FILTROS SINCRONIZADOS ENTRE TELA E EXPORTAÇÃO
  // --------------------------------------------------------------------------
  test('Dashboard exporta apenas os indicadores das corridas que atendem aos filtros ativos (CSV e PDF)', async () => {
    corridasRepository.findAllParaDashboard.mockResolvedValue([
      {
        status: 'FINALIZADA',
        classe: 'PREMIUM',
        valor: 120,
        dataHorario: '2026-11-10T14:00:00.000Z',
        origemNome: 'Aeroporto Vitória',
        destinoNome: 'Praia do Canto',
        veiculoId: 'v-prem',
      },
      {
        status: 'FINALIZADA',
        classe: 'BASICO',
        valor: 35,
        dataHorario: '2026-10-05T14:00:00.000Z',
        origemNome: 'Terminal Laranjeiras',
        destinoNome: 'UFES',
        veiculoId: 'v-bas',
      },
    ]);
    veiculosRepository.findAllParaDashboard.mockResolvedValue([
      { id: 'v-prem', status: 'DISPONIVEL', classe: 'PREMIUM', marca: 'Toyota', modelo: 'Corolla' },
      { id: 'v-bas', status: 'DISPONIVEL', classe: 'BASICO', marca: 'Fiat', modelo: 'Mobi' },
    ]);

    // Filtrando apenas classe=PREMIUM e mês de novembro/2026
    const resCsv = await request(app)
      .get('/api/dashboard/exportar?formato=csv&classe=PREMIUM&dataInicio=2026-11-01&dataFim=2026-11-30')
      .set('x-auth-token', tokenAdmin);

    expect(resCsv.statusCode).toBe(200);
    expect(resCsv.headers['content-type']).toContain('text/csv');
    const csvTexto = resCsv.text;
    expect(csvTexto.charCodeAt(0)).toBe(0xfeff);
    expect(csvTexto).toContain('Aeroporto Vitória -> Praia do Canto');
    expect(csvTexto).toContain('R$ 120,00');
    // Não pode incluir a corrida BASICO de outubro que foi excluída pelo filtro!
    expect(csvTexto).not.toContain('Terminal Laranjeiras -> UFES');
    expect(csvTexto).not.toContain('Fiat Mobi');

    // Mesmo filtro em PDF
    const resPdf = await request(app)
      .get('/api/dashboard/exportar?formato=pdf&classe=PREMIUM&dataInicio=2026-11-01&dataFim=2026-11-30')
      .set('x-auth-token', tokenAdmin)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(resPdf.statusCode).toBe(200);
    expect(resPdf.headers['content-type']).toBe('application/pdf');
    const rawPdf = resPdf.body.toString('latin1');
    expect(rawPdf.startsWith('%PDF-1.4')).toBe(true);
    expect(rawPdf).toContain('Corridas UCL');
    expect(rawPdf).not.toContain('Fiat Mobi');
  });

  // --------------------------------------------------------------------------
  // 3. VEÍCULOS: EXPORTAÇÃO ESTRITAMENTE DOS VEÍCULOS FILTRADOS
  // --------------------------------------------------------------------------
  test('Veículos repassa exatamente os filtros (search, status, classe, porte) e exporta apenas os filtrados', async () => {
    veiculosRepository.findAll.mockImplementation(async (filtros) => {
      const base = [
        {
          id: 'v-1',
          placa: 'UCL1A23',
          marca: 'Toyota',
          modelo: 'Corolla',
          ano: 2024,
          cor: 'Prata',
          porte: 'Medio',
          classe: 'NORMAL',
          quantidadePassageiros: 4,
          quilometragem: 12500,
          status: 'DISPONIVEL',
          statusAprovacao: 'APROVADO',
          motoristaId: 'mot-1',
          possuiArCondicionado: true,
          possuiCintoSeguranca: true,
          possuiExtintor: true,
          documentacaoRegularizada: true,
          criadoEm: '2026-11-01T10:00:00.000Z',
        },
        {
          id: 'v-2',
          placa: 'MOB9Z99',
          marca: 'Fiat',
          modelo: 'Mobi',
          ano: 2022,
          cor: 'Branco',
          porte: 'Pequeno',
          classe: 'BASICO',
          quantidadePassageiros: 4,
          quilometragem: 40000,
          status: 'INDISPONIVEL',
          statusAprovacao: 'PENDENTE',
          motoristaId: 'mot-1',
          criadoEm: '2026-11-02T10:00:00.000Z',
        },
      ];
      return base.filter((v) => {
        if (filtros.porte && v.porte !== filtros.porte) return false;
        if (filtros.status && v.status !== filtros.status) return false;
        if (filtros.classe && v.classe !== filtros.classe) return false;
        if (filtros.search && !`${v.marca} ${v.modelo} ${v.placa}`.toLowerCase().includes(filtros.search.toLowerCase())) {
          return false;
        }
        return true;
      });
    });
    motoristasRepository.findByUsuarioId.mockResolvedValue({ cnh: '12345678901' });

    const resCsv = await request(app)
      .get('/api/veiculos/exportar?formato=csv&porte=Medio&status=DISPONIVEL&search=Corolla')
      .set('x-auth-token', tokenAdmin);

    expect(resCsv.statusCode).toBe(200);
    expect(veiculosRepository.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        porte: 'Medio',
        status: 'DISPONIVEL',
        search: 'Corolla',
      })
    );
    expect(resCsv.text).toContain('UCL1A23');
    expect(resCsv.text).toContain('Toyota');
    expect(resCsv.text).not.toContain('MOB9Z99');
    expect(resCsv.text).not.toContain('Mobi');

    const resPdf = await request(app)
      .get('/api/veiculos/exportar?formato=pdf&porte=Medio&status=DISPONIVEL')
      .set('x-auth-token', tokenAdmin);
    expect(resPdf.statusCode).toBe(200);
    expect(resPdf.headers['content-type']).toBe('application/pdf');
  });

  // --------------------------------------------------------------------------
  // 4. USUÁRIOS: EXPORTAÇÃO ESTRITAMENTE DOS USUÁRIOS FILTRADOS E SEM SENHA
  // --------------------------------------------------------------------------
  test('Usuários exporta somente os registros correspondentes a search/perfil e nunca expõe senha ou inativos', async () => {
    authRepository.findAll.mockResolvedValue([
      {
        id: 'u-mot',
        nome: 'Carlos Motorista',
        usuario: 'carlos_mot',
        perfil: 'MOTORISTA',
        email: 'carlos@ucl.br',
        cpf: '12345678901',
        celular: '27999991111',
        criadoEm: '2026-10-15T12:00:00.000Z',
        endereco: { cidade: 'Vitória', uf: 'ES', bairro: 'Goiabeiras' },
      },
      {
        id: 'u-pass',
        nome: 'Mariana Passageira',
        usuario: 'mariana_p',
        perfil: 'USUARIO',
        email: 'mariana@ucl.br',
        cpf: '98765432100',
        celular: '27988882222',
        criadoEm: '2026-10-16T12:00:00.000Z',
        endereco: { cidade: 'Vila Velha', uf: 'ES', bairro: 'Itaparica' },
      },
      {
        id: 'u-inativo',
        nome: 'Conta Removida',
        usuario: 'inativo_1',
        perfil: 'INATIVO',
        email: 'historico@inativo.local',
      },
    ]);

    // Filtrando perfil=MOTORISTA e search=Carlos
    const resCsv = await request(app)
      .get('/api/usuarios/exportar?formato=csv&perfil=MOTORISTA&search=Carlos')
      .set('x-auth-token', tokenAdmin);

    expect(resCsv.statusCode).toBe(200);
    expect(resCsv.text).toContain('Carlos Motorista');
    expect(resCsv.text).toContain('@carlos_mot');
    expect(resCsv.text).toContain('123.456.789-01');
    // Não exporta Mariana (USUARIO) nem Conta Removida (INATIVO) nem coluna senha
    expect(resCsv.text).not.toContain('Mariana Passageira');
    expect(resCsv.text).not.toContain('Conta Removida');
    expect(resCsv.text.toLowerCase()).not.toContain('senha');

    const resPdf = await request(app)
      .get('/api/usuarios/exportar?formato=pdf&perfil=MOTORISTA&search=Carlos')
      .set('x-auth-token', tokenAdmin)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(resPdf.statusCode).toBe(200);
    const pdfRaw = resPdf.body.toString('latin1');
    expect(pdfRaw.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfRaw).toContain('Carlos Motorista');
    expect(pdfRaw).not.toContain('Mariana Passageira');
  });
});
