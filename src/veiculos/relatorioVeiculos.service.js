'use strict';
/**
 * relatorioVeiculos.service.js — Exportação de relatórios de Veículos em CSV e PDF,
 * reutilizando exatamente a lógica de filtros de `veiculosService.listarTodos` (`search`,
 * `status`, `classe`, `porte`, `motoristaId`).
 */

const veiculosService = require('./veiculos.service');
const { gerarPdfRelatorio } = require('../utils/pdfBuilder');
const {
  validarFormatoExportacao,
  formatarDataHoraBr,
  montarCsvComBom,
  gerarCarimboArquivo,
} = require('../utils/exportacaoHelper');

const STATUS_LABELS = Object.freeze({
  DISPONIVEL: 'Disponível',
  INDISPONIVEL: 'Indisponível',
  EM_CORRIDA: 'Em corrida',
  PENDENTE: 'Pendente',
});

const APROVACAO_LABELS = Object.freeze({
  APROVADO: 'Aprovado',
  PENDENTE: 'Pendente',
  REJEITADO: 'Rejeitado',
});

const PORTE_LABELS = Object.freeze({
  Pequeno: 'Pequeno',
  Medio: 'Médio',
  Grande: 'Grande',
});

const CLASSE_LABELS = Object.freeze({
  BASICO: 'Básico',
  NORMAL: 'Normal',
  PREMIUM: 'Premium',
});

function descreverFiltrosVeiculos(filtros = {}) {
  const partes = [];
  if (filtros.search && String(filtros.search).trim()) {
    partes.push(`Busca: "${String(filtros.search).trim()}"`);
  }
  if (filtros.status) {
    const s = String(filtros.status).toUpperCase();
    partes.push(`Status: ${STATUS_LABELS[s] || s}`);
  }
  if (filtros.classe) {
    const c = String(filtros.classe).toUpperCase();
    partes.push(`Classe: ${CLASSE_LABELS[c] || c}`);
  }
  if (filtros.porte) {
    partes.push(`Porte: ${PORTE_LABELS[filtros.porte] || filtros.porte}`);
  }
  if (filtros.motoristaId) {
    partes.push(`Motorista ID: ${filtros.motoristaId}`);
  }
  return partes.length > 0 ? partes.join(' | ') : 'Todos os veículos ativos (sem filtros aplicados)';
}

function resumirVeiculos(lista) {
  let disponiveis = 0;
  let emCorrida = 0;
  let indisponiveis = 0;
  let aprovados = 0;
  let pendentes = 0;

  for (const v of lista) {
    if (v.status === 'DISPONIVEL') disponiveis++;
    else if (v.status === 'EM_CORRIDA') emCorrida++;
    else indisponiveis++;

    if (v.statusAprovacao === 'APROVADO') aprovados++;
    else if (v.statusAprovacao === 'PENDENTE') pendentes++;
  }

  return {
    total: lista.length,
    disponiveis,
    emCorrida,
    indisponiveis,
    aprovados,
    pendentes,
  };
}

class RelatorioVeiculosService {
  async exportar(query = {}, usuarioLogado = null) {
    const formato = validarFormatoExportacao(query.formato);
    const veiculos = await veiculosService.listarTodos(query);
    const resumo = resumirVeiculos(veiculos);
    const textoFiltros = descreverFiltrosVeiculos(query);
    const agora = new Date();
    const carimbo = gerarCarimboArquivo(agora);

    if (formato === 'csv') {
      const csv = this._gerarCsv(veiculos, resumo, textoFiltros, usuarioLogado, agora);
      return {
        buffer: Buffer.from(csv, 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        filename: `relatorio-veiculos-corridas-ucl-${carimbo}.csv`,
      };
    }

    const pdf = this._gerarPdf(veiculos, resumo, textoFiltros, usuarioLogado, agora);
    return {
      buffer: pdf,
      contentType: 'application/pdf',
      filename: `relatorio-veiculos-corridas-ucl-${carimbo}.pdf`,
    };
  }

  _gerarCsv(veiculos, resumo, textoFiltros, usuarioLogado, agora) {
    const cabecalhos = [
      'ID do Veículo',
      'Placa',
      'Marca',
      'Modelo',
      'Ano',
      'Cor',
      'Porte',
      'Classe',
      'Passageiros',
      'Quilometragem (km)',
      'Status Operacional',
      'Status Aprovação',
      'Motorista Vinculado',
      'CNH do Motorista',
      'Ar-Condicionado',
      'Cinto de Segurança',
      'Extintor',
      'Documentação Regularizada',
      'Cadastrado em',
    ];

    const linhas = [cabecalhos];

    for (const v of veiculos) {
      linhas.push([
        v.id,
        v.placa || '—',
        v.marca || '—',
        v.modelo || '—',
        v.ano != null ? String(v.ano) : '—',
        v.cor || '—',
        PORTE_LABELS[v.porte] || v.porte || '—',
        CLASSE_LABELS[v.classe] || v.classe || '—',
        v.quantidadePassageiros != null ? String(v.quantidadePassageiros) : '4',
        Number(v.quilometragem || 0).toFixed(1).replace('.', ','),
        STATUS_LABELS[v.status] || v.status || '—',
        APROVACAO_LABELS[v.statusAprovacao] || v.statusAprovacao || '—',
        v.motorista?.nome || '—',
        v.motorista?.cnh || '—',
        v.possuiArCondicionado ? 'Sim' : 'Não',
        v.possuiCintoSeguranca ? 'Sim' : 'Não',
        v.possuiExtintor ? 'Sim' : 'Não',
        v.documentacaoRegularizada ? 'Sim' : 'Não',
        formatarDataHoraBr(v.criadoEm),
      ]);
    }

    linhas.push([]);
    linhas.push(['RESUMO DA FROTA EXPORTADA', 'VALOR']);
    linhas.push(['Sistema', 'Corridas UCL']);
    linhas.push(['Emitido em', formatarDataHoraBr(agora)]);
    linhas.push(['Emitido por', usuarioLogado?.nome || 'Administrador']);
    linhas.push(['Filtros aplicados', textoFiltros]);
    linhas.push(['Total de veículos exportados', String(resumo.total)]);
    linhas.push(['Disponíveis', String(resumo.disponiveis)]);
    linhas.push(['Em corrida', String(resumo.emCorrida)]);
    linhas.push(['Indisponíveis', String(resumo.indisponiveis)]);
    linhas.push(['Aprovados', String(resumo.aprovados)]);
    linhas.push(['Pendentes de aprovação', String(resumo.pendentes)]);

    return montarCsvComBom(linhas);
  }

  _gerarPdf(veiculos, resumo, textoFiltros, usuarioLogado, agora) {
    const cardsResumo = [
      { rotulo: 'Total Filtrado', valor: String(resumo.total) },
      { rotulo: 'Disponíveis', valor: String(resumo.disponiveis) },
      { rotulo: 'Em Corrida', valor: String(resumo.emCorrida) },
      { rotulo: 'Indisponíveis', valor: String(resumo.indisponiveis) },
      { rotulo: 'Aprovados', valor: String(resumo.aprovados) },
      { rotulo: 'Pendentes', valor: String(resumo.pendentes) },
    ];

    // Soma = 777.89 pt
    const colunas = [
      { chave: 'placaAno', titulo: 'Placa / Ano', largura: 82, maxLinhas: 2 },
      { chave: 'veiculo', titulo: 'Marca / Modelo / Cor', largura: 150, maxLinhas: 2 },
      { chave: 'porteClasse', titulo: 'Porte / Classe', largura: 92, maxLinhas: 2 },
      { chave: 'capacKm', titulo: 'Lugares / Km', largura: 85, maxLinhas: 2 },
      { chave: 'status', titulo: 'Operação / Aprovação', largura: 112, maxLinhas: 2 },
      { chave: 'motorista', titulo: 'Motorista Vinculado', largura: 136, maxLinhas: 2 },
      { chave: 'checklist', titulo: 'Itens / Doc.', largura: 120.89, maxLinhas: 2 },
    ];

    const linhas = veiculos.map((v) => {
      const itens = [
        v.possuiArCondicionado ? 'Ar' : null,
        v.possuiCintoSeguranca ? 'Cinto' : null,
        v.possuiExtintor ? 'Ext.' : null,
        v.documentacaoRegularizada ? 'Doc. OK' : 'Doc. Pend.',
      ]
        .filter(Boolean)
        .join(', ');

      return {
        placaAno: `${v.placa || '—'} (${v.ano || '—'})`,
        veiculo: `${v.marca || ''} ${v.modelo || ''}${v.cor ? ` • ${v.cor}` : ''}`,
        porteClasse: `${PORTE_LABELS[v.porte] || v.porte || '—'} / ${CLASSE_LABELS[v.classe] || v.classe || '—'}`,
        capacKm: `${v.quantidadePassageiros ?? 4} lug. | ${Number(v.quilometragem || 0).toFixed(0)} km`,
        status: `${STATUS_LABELS[v.status] || v.status} (${APROVACAO_LABELS[v.statusAprovacao] || v.statusAprovacao})`,
        motorista: v.motorista?.nome
          ? `${v.motorista.nome}${v.motorista.usuario ? ` (@${v.motorista.usuario})` : ''}`
          : 'Não vinculado',
        checklist: itens,
      };
    });

    return gerarPdfRelatorio({
      titulo: 'Corridas UCL — Relatório de Veículos da Frota',
      subtitulo: `Emitido em ${formatarDataHoraBr(agora)} • Administrador${usuarioLogado?.nome ? ` (${usuarioLogado.nome})` : ''}`,
      linhasFiltro: [`Filtros aplicados: ${textoFiltros}`],
      cardsResumo,
      colunas,
      linhas,
      rodapeNota: 'Relatório gerado respeitando integralmente os filtros ativos de veículos.',
    });
  }
}

module.exports = new RelatorioVeiculosService();
