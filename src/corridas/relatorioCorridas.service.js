'use strict';
/**
 * relatorioCorridas.service.js — Geração de relatórios exportáveis de corridas
 * em formatos CSV (UTF-8 com BOM) e PDF (A4 Paisagem multipágina), respeitando
 * os mesmos filtros ativos e as permissões por perfil no backend.
 */

const corridasRepository = require('./corridas.repository');
const motoristasRepository = require('../motoristas/motoristas.repository');
const historicoCorridasService = require('./historicoCorridas.service');
const AppError = require('../utils/AppError');
const { BUSINESS_TIMEZONE } = require('../utils/constants');
const { gerarPdfRelatorio } = require('../utils/pdfBuilder');

const LIMITE_MAXIMO_EXPORTACAO = 1000;

const FORMATOS_VALIDOS = Object.freeze(['csv', 'pdf']);

const PERFIL_LABELS = Object.freeze({
  ADMINISTRADOR: 'Administrador',
  MOTORISTA: 'Motorista',
  USUARIO: 'Passageiro',
});

const STATUS_LABELS = Object.freeze({
  SOLICITADA: 'Solicitada',
  CONFIRMADA: 'Confirmada',
  EM_ANDAMENTO: 'Em andamento',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
});

function formatarDataHoraBr(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    timeZone: BUSINESS_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatarDataCurtaBr(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    timeZone: BUSINESS_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatarMoedaBr(valor) {
  const num = Number(valor || 0);
  return `R$ ${num.toFixed(2).replace('.', ',')}`;
}

function escaparCelulaCsv(valor, delimitador = ';') {
  if (valor === null || valor === undefined) return '';
  let texto = String(valor).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Evita interpretação acidental de fórmulas em planilhas quando célula textual inicia com =, +, @
  if (/^[=+@]/.test(texto)) {
    texto = `'${texto}`;
  }

  if (
    texto.includes(delimitador) ||
    texto.includes('"') ||
    texto.includes(',') ||
    texto.includes('\n')
  ) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

function descreverFiltrosAplicados(filtros, queryOriginal = {}) {
  const partes = [];
  partes.push(`Escopo: ${filtros.escopo}`);
  if (filtros.status) partes.push(`Status: ${STATUS_LABELS[filtros.status] || filtros.status}`);
  if (queryOriginal.dataInicio || queryOriginal.dataFim) {
    const ini = filtros.dataInicio ? formatarDataCurtaBr(filtros.dataInicio) : 'Início';
    const fim = filtros.dataFim ? formatarDataCurtaBr(filtros.dataFim) : 'Atual';
    partes.push(`Período: ${ini} até ${fim}`);
  }
  if (filtros.id) partes.push(`ID: ${filtros.id}`);
  if (filtros.origem) partes.push(`Origem: ${filtros.origem}`);
  if (filtros.destino) partes.push(`Destino: ${filtros.destino}`);
  if (filtros.motorista) partes.push(`Motorista: ${filtros.motorista}`);
  if (filtros.passageiro) partes.push(`Passageiro: ${filtros.passageiro}`);
  if (filtros.veiculo) partes.push(`Veículo: ${filtros.veiculo}`);
  if (filtros.canceladoPor) partes.push(`Cancelado por: ${filtros.canceladoPor}`);
  if (filtros.atrasadas) partes.push('Apenas em atraso');
  if (filtros.finalizadas) partes.push('Apenas finalizadas');
  if (filtros.canceladas) partes.push('Apenas canceladas');
  if (filtros.expiradas) partes.push('Apenas expiradas');
  return partes.join(' | ');
}

function agruparQuantidadePorData(registros) {
  const contagem = new Map();
  for (const c of registros) {
    const dia = formatarDataCurtaBr(c.dataHorario);
    contagem.set(dia, (contagem.get(dia) || 0) + 1);
  }
  return Array.from(contagem.entries());
}

class RelatorioCorridasService {
  async exportar(query = {}, usuarioLogado = null) {
    const formato = query.formato ? String(query.formato).trim().toLowerCase() : 'csv';
    if (!FORMATOS_VALIDOS.includes(formato)) {
      throw new AppError(`Formato de exportação inválido: '${query.formato}'. Use csv ou pdf.`, 400);
    }

    const filtros = historicoCorridasService.validarENormalizarFiltros(
      { ...query, page: 1, limit: LIMITE_MAXIMO_EXPORTACAO },
      usuarioLogado,
      { maxLimit: LIMITE_MAXIMO_EXPORTACAO, defaultLimit: LIMITE_MAXIMO_EXPORTACAO }
    );

    let registros = [];
    let resumo = {
      total: 0,
      ativas: 0,
      finalizadas: 0,
      canceladas: 0,
      expiradas: 0,
      atrasadas: 0,
      valorTotalRegistrado: 0,
      valorTotalFinalizado: 0,
      distanciaTotalKm: 0,
    };

    let motoristaValido = true;
    if (filtros.perfil === 'MOTORISTA') {
      const cad = await motoristasRepository.findByUsuarioId(filtros.usuarioLogadoId);
      if (!cad) motoristaValido = false;
    }

    const agora = new Date();
    if (motoristaValido) {
      const resultado = await corridasRepository.consultarComFiltros(filtros, agora);
      registros = resultado.registros.map((c) =>
        historicoCorridasService.enriquecerRegistroCorrida(c, agora)
      );
      resumo = resultado.resumo;
    }

    const carimboArquivo = agora
      .toLocaleString('sv-SE', { timeZone: BUSINESS_TIMEZONE })
      .replace(/[: ]/g, '-')
      .slice(0, 16);

    if (formato === 'csv') {
      const conteudoCsv = this._gerarCsv(registros, resumo, filtros, query, usuarioLogado, agora);
      return {
        buffer: Buffer.from(conteudoCsv, 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        filename: `relatorio-corridas-ucl-${carimboArquivo}.csv`,
      };
    }

    const bufferPdf = this._gerarPdf(registros, resumo, filtros, query, usuarioLogado, agora);
    return {
      buffer: bufferPdf,
      contentType: 'application/pdf',
      filename: `relatorio-corridas-ucl-${carimboArquivo}.pdf`,
    };
  }

  _gerarCsv(registros, resumo, filtros, queryOriginal, usuarioLogado, agora) {
    const delim = ';';
    const cabecalhos = [
      'ID da Corrida',
      'Data/Hora Programada',
      'Início Efetivo',
      'Conclusão/Cancelamento Efetivo',
      'Origem',
      'Destino',
      'Passageiro',
      'Motorista',
      'Veículo',
      'Placa',
      'Classe',
      'Distância (km)',
      'Duração Prevista (min)',
      'Duração Efetiva (min)',
      'Valor (R$)',
      'Forma de Pagamento',
      'Status Final',
      'Indicador de Pontualidade',
      'Responsável Cancelamento',
      'Motivo de Cancelamento',
    ];

    const linhasCsv = [cabecalhos.map((h) => escaparCelulaCsv(h, delim)).join(delim)];

    for (const c of registros) {
      const terminoEfetivo = c.finalizadaEm || c.canceladaEm || null;
      const veiculoModelo = c.veiculo ? `${c.veiculo.marca} ${c.veiculo.modelo}` : '—';
      const veiculoPlaca = c.veiculo?.placa || '—';

      const valores = [
        c.id,
        formatarDataHoraBr(c.dataHorario),
        formatarDataHoraBr(c.embarqueMotoristaEm),
        formatarDataHoraBr(terminoEfetivo),
        c.origemNome || '—',
        c.destinoNome || '—',
        c.passageiro?.nome || '—',
        c.motorista?.nome || '—',
        veiculoModelo,
        veiculoPlaca,
        c.classe || 'NORMAL',
        Number(c.distanciaKm || 0).toFixed(2).replace('.', ','),
        c.duracaoMin != null ? String(c.duracaoMin) : '—',
        c.duracaoEfetivaMin != null ? String(c.duracaoEfetivaMin) : '—',
        Number(c.valor || 0).toFixed(2).replace('.', ','),
        c.formaPagamento || 'DINHEIRO',
        STATUS_LABELS[c.status] || c.status,
        c.pontualidade?.rotulo || '—',
        c.canceladoPor || '—',
        c.motivoCancelamento || '—',
      ];

      linhasCsv.push(valores.map((v) => escaparCelulaCsv(v, delim)).join(delim));
    }

    // Bloco consolidado de totalizadores ao final do arquivo CSV
    linhasCsv.push('');
    linhasCsv.push(['RESUMO DO RELATÓRIO', 'VALOR'].map((v) => escaparCelulaCsv(v, delim)).join(delim));
    const metricas = [
      ['Sistema', 'Corridas UCL'],
      ['Emitido em', formatarDataHoraBr(agora)],
      ['Perfil consultante', PERFIL_LABELS[usuarioLogado.perfil] || usuarioLogado.perfil],
      ['Filtros aplicados', descreverFiltrosAplicados(filtros, queryOriginal)],
      ['Total de corridas no filtro', String(resumo.total)],
      ['Corridas finalizadas', String(resumo.finalizadas)],
      ['Corridas canceladas (total)', String(resumo.canceladas)],
      ['Corridas expiradas automaticamente', String(resumo.expiradas)],
      ['Corridas em atraso', String(resumo.atrasadas)],
      ['Valor total registrado', formatarMoedaBr(resumo.valorTotalRegistrado)],
      ['Valor total finalizado', formatarMoedaBr(resumo.valorTotalFinalizado)],
    ];
    for (const [rotulo, val] of metricas) {
      linhasCsv.push([escaparCelulaCsv(rotulo, delim), escaparCelulaCsv(val, delim)].join(delim));
    }

    const porData = agruparQuantidadePorData(registros);
    if (porData.length > 0) {
      linhasCsv.push('');
      linhasCsv.push(['QUANTIDADE POR DATA PROGRAMADA', 'CORRIDAS'].map((v) => escaparCelulaCsv(v, delim)).join(delim));
      for (const [dia, qtd] of porData) {
        linhasCsv.push([escaparCelulaCsv(dia, delim), escaparCelulaCsv(String(qtd), delim)].join(delim));
      }
    }

    // BOM UTF-8 (\uFEFF) garante abertura direta com acentuação íntegra no Microsoft Excel
    return '\uFEFF' + linhasCsv.join('\r\n') + '\r\n';
  }

  _gerarPdf(registros, resumo, filtros, queryOriginal, usuarioLogado, agora) {
    const perfilNome = PERFIL_LABELS[usuarioLogado.perfil] || usuarioLogado.perfil;
    const descricaoFiltros = descreverFiltrosAplicados(filtros, queryOriginal);
    const porData = agruparQuantidadePorData(registros);
    const resumoPorData = porData.length > 0
      ? 'Distribuição por data (amostra): ' +
        porData
          .slice(0, 6)
          .map(([dia, qtd]) => `${dia}: ${qtd}`)
          .join(' | ') +
        (porData.length > 6 ? ` (+${porData.length - 6} datas)` : '')
      : null;

    const linhasFiltro = [`Filtros aplicados: ${descricaoFiltros}`];
    if (resumoPorData) linhasFiltro.push(resumoPorData);

    const cardsResumo = [
      { rotulo: 'Total Corridas', valor: String(resumo.total) },
      { rotulo: 'Finalizadas', valor: String(resumo.finalizadas) },
      { rotulo: 'Canceladas', valor: String(resumo.canceladas) },
      { rotulo: 'Expiradas', valor: String(resumo.expiradas) },
      { rotulo: 'Em Atraso', valor: String(resumo.atrasadas) },
      { rotulo: 'Valor Registrado', valor: formatarMoedaBr(resumo.valorTotalRegistrado) },
      { rotulo: 'Valor Finalizado', valor: formatarMoedaBr(resumo.valorTotalFinalizado) },
    ];

    // Soma das larguras = 777.89 pt (exatamente PAGE_WIDTH 841.89 - 64 de margens)
    const colunas = [
      { chave: 'idData', titulo: 'ID / Programada', largura: 88, maxLinhas: 2 },
      { chave: 'efetivo', titulo: 'Efetivo / Dur.', largura: 82, maxLinhas: 2 },
      { chave: 'trajeto', titulo: 'Origem -> Destino', largura: 168, maxLinhas: 2 },
      { chave: 'passageiro', titulo: 'Passageiro', largura: 82, maxLinhas: 2 },
      { chave: 'motoristaVeiculo', titulo: 'Motorista / Veículo', largura: 112, maxLinhas: 2 },
      { chave: 'valorDist', titulo: 'Valor / Dist.', largura: 68, maxLinhas: 2 },
      { chave: 'statusPontualidade', titulo: 'Status / Situação', largura: 82, maxLinhas: 2 },
      { chave: 'cancelamento', titulo: 'Cancelamento / Obs.', largura: 95.89, maxLinhas: 2 },
    ];

    const linhas = registros.map((c) => {
      const idCurto = `#${String(c.id).slice(0, 8)}`;
      const inicioEf = c.embarqueMotoristaEm ? formatarDataHoraBr(c.embarqueMotoristaEm).slice(11) : '—';
      const fimEf = (c.finalizadaEm || c.canceladaEm)
        ? formatarDataHoraBr(c.finalizadaEm || c.canceladaEm).slice(11)
        : '—';
      const duracaoTxt = c.duracaoEfetivaMin != null
        ? `${c.duracaoEfetivaMin} min (prev. ${c.duracaoMin ?? '—'})`
        : `Prev. ${c.duracaoMin ?? '—'} min`;

      const veiculoTxt = c.veiculo
        ? `${c.veiculo.marca} ${c.veiculo.modelo} (${c.veiculo.placa})`
        : 'Sem veículo';

      const cancelTxt = c.status === 'CANCELADA'
        ? `${c.canceladoPor || 'SISTEMA'}${c.motivoCancelamento ? ': ' + c.motivoCancelamento : ''}`
        : '—';

      return {
        idData: `${idCurto} ${formatarDataHoraBr(c.dataHorario)}`,
        efetivo: `${inicioEf} ate ${fimEf} | ${duracaoTxt}`,
        trajeto: `${c.origemNome} -> ${c.destinoNome}`,
        passageiro: c.passageiro?.nome || '—',
        motoristaVeiculo: `${c.motorista?.nome || 'Não atribuído'} | ${veiculoTxt}`,
        valorDist: `${formatarMoedaBr(c.valor)} | ${Number(c.distanciaKm || 0).toFixed(1)} km`,
        statusPontualidade: `${STATUS_LABELS[c.status] || c.status} (${c.pontualidade?.rotulo || '—'})`,
        cancelamento: cancelTxt,
      };
    });

    const notaLimite = resumo.total > LIMITE_MAXIMO_EXPORTACAO
      ? `Exibindo os primeiros ${LIMITE_MAXIMO_EXPORTACAO} registros de ${resumo.total}. Refine o período para exportar lotes específicos.`
      : `Relatório emitido respeitando permissões do perfil ${perfilNome}.`;

    return gerarPdfRelatorio({
      titulo: 'Corridas UCL — Relatório de Corridas e Histórico',
      subtitulo: `Emitido em ${formatarDataHoraBr(agora)} • Perfil: ${perfilNome}${usuarioLogado.nome ? ` (${usuarioLogado.nome})` : ''}`,
      linhasFiltro,
      cardsResumo,
      colunas,
      linhas,
      rodapeNota: notaLimite,
    });
  }
}

module.exports = new RelatorioCorridasService();
