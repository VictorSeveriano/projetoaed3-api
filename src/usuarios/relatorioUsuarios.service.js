'use strict';
/**
 * relatorioUsuarios.service.js — Exportação de relatórios de Usuários em CSV e PDF,
 * reutilizando exatamente a lógica de filtros de `usuariosService.listarTodos` (`search`, `perfil`)
 * e preservando total segurança (nunca expõe hashes de senha nem contas inativas).
 */

const usuariosService = require('./usuarios.service');
const { gerarPdfRelatorio } = require('../utils/pdfBuilder');
const {
  validarFormatoExportacao,
  formatarDataHoraBr,
  formatarDataCurtaBr,
  formatarCpfMascarado,
  formatarCelularBr,
  montarCsvComBom,
  gerarCarimboArquivo,
} = require('../utils/exportacaoHelper');

const PERFIL_LABELS = Object.freeze({
  ADMINISTRADOR: 'Administrador',
  MOTORISTA: 'Motorista',
  USUARIO: 'Passageiro',
});

function descreverFiltrosUsuarios(filtros = {}) {
  const partes = [];
  if (filtros.search && String(filtros.search).trim()) {
    partes.push(`Pesquisa: "${String(filtros.search).trim()}"`);
  }
  if (filtros.perfil && String(filtros.perfil).trim()) {
    const p = String(filtros.perfil).trim().toUpperCase();
    partes.push(`Perfil: ${PERFIL_LABELS[p] || p}`);
  }
  return partes.length > 0 ? partes.join(' | ') : 'Todos os usuários ativos (sem filtros aplicados)';
}

function resumirUsuarios(lista) {
  let passageiros = 0;
  let motoristas = 0;
  let administradores = 0;

  for (const u of lista) {
    if (u.perfil === 'USUARIO') passageiros++;
    else if (u.perfil === 'MOTORISTA') motoristas++;
    else if (u.perfil === 'ADMINISTRADOR') administradores++;
  }

  return {
    total: lista.length,
    passageiros,
    motoristas,
    administradores,
  };
}

function formatarCidadeEndereco(endereco) {
  if (!endereco) return '—';
  const cidadeUf = [endereco.cidade, endereco.uf || endereco.estado].filter(Boolean).join('/');
  const ruaBairro = [endereco.rua || endereco.logradouro, endereco.bairro].filter(Boolean).join(', ');
  if (cidadeUf && ruaBairro) return `${cidadeUf} • ${ruaBairro}`;
  return cidadeUf || ruaBairro || '—';
}

class RelatorioUsuariosService {
  async exportar(query = {}, usuarioLogado = null) {
    const formato = validarFormatoExportacao(query.formato);
    const usuarios = await usuariosService.listarTodos(query);
    const resumo = resumirUsuarios(usuarios);
    const textoFiltros = descreverFiltrosUsuarios(query);
    const agora = new Date();
    const carimbo = gerarCarimboArquivo(agora);

    if (formato === 'csv') {
      const csv = this._gerarCsv(usuarios, resumo, textoFiltros, usuarioLogado, agora);
      return {
        buffer: Buffer.from(csv, 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        filename: `relatorio-usuarios-corridas-ucl-${carimbo}.csv`,
      };
    }

    const pdf = this._gerarPdf(usuarios, resumo, textoFiltros, usuarioLogado, agora);
    return {
      buffer: pdf,
      contentType: 'application/pdf',
      filename: `relatorio-usuarios-corridas-ucl-${carimbo}.pdf`,
    };
  }

  _gerarCsv(usuarios, resumo, textoFiltros, usuarioLogado, agora) {
    const cabecalhos = [
      'ID do Usuário',
      'Nome Completo',
      'Usuário (@)',
      'Perfil',
      'E-mail',
      'CPF',
      'Celular',
      'Cidade / UF',
      'Bairro',
      'Logradouro / Número',
      'CEP',
      'Data de Cadastro',
    ];

    const linhas = [cabecalhos];

    for (const u of usuarios) {
      const end = u.endereco || {};
      const cidadeUf = [end.cidade, end.uf || end.estado].filter(Boolean).join('/') || '—';
      const ruaNum = [end.rua || end.logradouro, end.numero].filter(Boolean).join(', ') || '—';

      linhas.push([
        u.id,
        u.nome || '—',
        u.usuario ? `@${u.usuario}` : '—',
        PERFIL_LABELS[u.perfil] || u.perfil || '—',
        u.email || '—',
        formatarCpfMascarado(u.cpf),
        formatarCelularBr(u.celular),
        cidadeUf,
        end.bairro || '—',
        ruaNum,
        end.cep || '—',
        formatarDataHoraBr(u.criadoEm),
      ]);
    }

    linhas.push([]);
    linhas.push(['RESUMO DE USUÁRIOS EXPORTADOS', 'VALOR']);
    linhas.push(['Sistema', 'Corridas UCL']);
    linhas.push(['Emitido em', formatarDataHoraBr(agora)]);
    linhas.push(['Emitido por', usuarioLogado?.nome || 'Administrador']);
    linhas.push(['Filtros aplicados', textoFiltros]);
    linhas.push(['Total de usuários exportados', String(resumo.total)]);
    linhas.push(['Passageiros', String(resumo.passageiros)]);
    linhas.push(['Motoristas', String(resumo.motoristas)]);
    linhas.push(['Administradores', String(resumo.administradores)]);

    return montarCsvComBom(linhas);
  }

  _gerarPdf(usuarios, resumo, textoFiltros, usuarioLogado, agora) {
    const cardsResumo = [
      { rotulo: 'Total Filtrado', valor: String(resumo.total) },
      { rotulo: 'Passageiros', valor: String(resumo.passageiros) },
      { rotulo: 'Motoristas', valor: String(resumo.motoristas) },
      { rotulo: 'Administradores', valor: String(resumo.administradores) },
    ];

    // Soma = 777.89 pt
    const colunas = [
      { chave: 'nome', titulo: 'Nome Completo', largura: 145, maxLinhas: 2 },
      { chave: 'usuarioPerfil', titulo: 'Usuário / Perfil', largura: 118, maxLinhas: 2 },
      { chave: 'email', titulo: 'E-mail', largura: 158, maxLinhas: 2 },
      { chave: 'cpfCelular', titulo: 'CPF / Celular', largura: 122, maxLinhas: 2 },
      { chave: 'localidade', titulo: 'Cidade / Endereço', largura: 162, maxLinhas: 2 },
      { chave: 'cadastro', titulo: 'Cadastro', largura: 72.89, maxLinhas: 1 },
    ];

    const linhas = usuarios.map((u) => ({
      nome: u.nome || '—',
      usuarioPerfil: `@${u.usuario || '—'} (${PERFIL_LABELS[u.perfil] || u.perfil})`,
      email: u.email || '—',
      cpfCelular: `${formatarCpfMascarado(u.cpf)} | ${formatarCelularBr(u.celular)}`,
      localidade: formatarCidadeEndereco(u.endereco),
      cadastro: formatarDataCurtaBr(u.criadoEm),
    }));

    return gerarPdfRelatorio({
      titulo: 'Corridas UCL — Relatório de Usuários Cadastrados',
      subtitulo: `Emitido em ${formatarDataHoraBr(agora)} • Administrador${usuarioLogado?.nome ? ` (${usuarioLogado.nome})` : ''}`,
      linhasFiltro: [`Filtros aplicados: ${textoFiltros}`],
      cardsResumo,
      colunas,
      linhas,
      rodapeNota: 'Relatório administrativo gerado conforme os filtros ativos de usuários.',
    });
  }
}

module.exports = new RelatorioUsuariosService();
