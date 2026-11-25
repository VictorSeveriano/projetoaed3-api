'use strict';
/**
 * pdfBuilder.js — Gerador nativo e leve de documentos PDF 1.4 multipágina (Paisagem A4)
 * sem dependências externas pesadas.
 *
 * Características:
 *  - Codificação WinAnsiEncoding (ISO-8859-1 / Windows-1252) nativa para acentuação em português.
 *  - Paginação automática com repetição do cabeçalho de colunas em cada página, evitando
 *    tabelas cortadas ou sobreposição de textos.
 *  - Numeração "Página X de Y" e identidade visual alinhada ao sistema Corridas UCL.
 */

const PAGE_WIDTH = 841.89;  // A4 Landscape width (pt)
const PAGE_HEIGHT = 595.28; // A4 Landscape height (pt)
const MARGIN_X = 32;
const MARGIN_BOTTOM = 38;

/** Mapeamento dos caracteres especiais CP1252 acima de U+00FF (ex.: •, —, –) para WinAnsi. */
const UNICODE_PARA_WINANSI = new Map([
  [0x2022, 0x95], // •
  [0x2013, 0x96], // –
  [0x2014, 0x97], // —
  [0x2018, 0x91], // ‘
  [0x2019, 0x92], // ’
  [0x201c, 0x93], // “
  [0x201d, 0x94], // ”
  [0x2026, 0x85], // …
  [0x20ac, 0x80], // €
]);

function sanitizarTextoWinAnsi(texto) {
  if (texto === null || texto === undefined) return '';
  return String(texto)
    .replace(/\r?\n|\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function codificarLiteralPdf(texto) {
  const limpo = sanitizarTextoWinAnsi(texto);
  let out = '(';
  for (let i = 0; i < limpo.length; i++) {
    const code = limpo.charCodeAt(i);
    let byte = code;
    if (code > 255) {
      byte = UNICODE_PARA_WINANSI.get(code) || 0x3f; // '?' fallback
    }
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) {
      out += '\\' + String.fromCharCode(byte);
    } else if (byte < 32 || byte > 126) {
      out += '\\' + byte.toString(8).padStart(3, '0');
    } else {
      out += String.fromCharCode(byte);
    }
  }
  out += ')';
  return out;
}

/** Estima largura aproximada em pontos para Helvetica e trunca/quebra sem invadir outra coluna. */
function quebrarTextoEmLinhas(texto, larguraMaxPt, tamanhoFonte, maxLinhas = 2) {
  const limpo = sanitizarTextoWinAnsi(texto);
  if (!limpo) return ['—'];
  const larguraMediaChar = tamanhoFonte * 0.51;
  const maxCharsPorLinha = Math.max(4, Math.floor(larguraMaxPt / larguraMediaChar));

  if (limpo.length <= maxCharsPorLinha) return [limpo];

  const palavras = limpo.split(' ');
  const linhas = [];
  let atual = '';

  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (tentativa.length <= maxCharsPorLinha) {
      atual = tentativa;
    } else {
      if (atual) {
        linhas.push(atual);
        if (linhas.length >= maxLinhas) {
          const ultima = linhas[linhas.length - 1];
          linhas[linhas.length - 1] = ultima.slice(0, Math.max(1, maxCharsPorLinha - 2)) + '...';
          return linhas;
        }
        atual = palavra.length > maxCharsPorLinha
          ? palavra.slice(0, Math.max(1, maxCharsPorLinha - 2)) + '...'
          : palavra;
      } else {
        linhas.push(palavra.slice(0, Math.max(1, maxCharsPorLinha - 2)) + '...');
        if (linhas.length >= maxLinhas) return linhas;
        atual = '';
      }
    }
  }

  if (atual && linhas.length < maxLinhas) {
    linhas.push(atual);
  }
  return linhas.length > 0 ? linhas : ['—'];
}

/**
 * Gera um Buffer PDF completo com cabeçalho institucional, filtros, cards de resumo e tabela paginada.
 *
 * @param {object} config
 * @param {string} config.titulo
 * @param {string} config.subtitulo
 * @param {string[]} config.linhasFiltro
 * @param {Array<{ rotulo: string, valor: string }>} config.cardsResumo
 * @param {Array<{ chave: string, titulo: string, largura: number, maxLinhas?: number }>} config.colunas
 * @param {Array<Record<string, string>>} config.linhas
 * @param {string} [config.rodapeNota]
 * @returns {Buffer}
 */
function gerarPdfRelatorio({
  titulo,
  subtitulo,
  linhasFiltro = [],
  cardsResumo = [],
  colunas = [],
  linhas = [],
  rodapeNota = '',
}) {
  const paginasComandos = [];
  let comandosAtuais = [];
  let cursorY = PAGE_HEIGHT;

  const larguraUtil = PAGE_WIDTH - MARGIN_X * 2;

  const iniciarNovaPagina = (primeiraPagina = false) => {
    if (comandosAtuais.length > 0) {
      paginasComandos.push(comandosAtuais);
    }
    comandosAtuais = [];

    // Faixa superior escura (identidade Corridas UCL)
    comandosAtuais.push('0.06 0.08 0.14 rg');
    comandosAtuais.push(`${MARGIN_X} ${PAGE_HEIGHT - 64} ${larguraUtil} 40 re f`);
    // Linha de destaque índigo
    comandosAtuais.push('0.39 0.40 0.95 rg');
    comandosAtuais.push(`${MARGIN_X} ${PAGE_HEIGHT - 66} ${larguraUtil} 2 re f`);

    // Título e subtítulo no cabeçalho
    comandosAtuais.push('1 1 1 rg');
    comandosAtuais.push(`BT /F2 13 Tf ${MARGIN_X + 12} ${PAGE_HEIGHT - 43} Td ${codificarLiteralPdf(titulo)} Tj ET`);
    comandosAtuais.push('0.78 0.83 0.92 rg');
    comandosAtuais.push(`BT /F1 8.5 Tf ${MARGIN_X + 12} ${PAGE_HEIGHT - 56} Td ${codificarLiteralPdf(subtitulo)} Tj ET`);

    cursorY = PAGE_HEIGHT - 80;

    if (primeiraPagina) {
      // Bloco de filtros aplicados
      if (linhasFiltro.length > 0) {
        const alturaBlocoFiltro = 14 + linhasFiltro.length * 12;
        comandosAtuais.push('0.96 0.97 0.99 rg');
        comandosAtuais.push(`${MARGIN_X} ${cursorY - alturaBlocoFiltro} ${larguraUtil} ${alturaBlocoFiltro} re f`);
        comandosAtuais.push('0.82 0.86 0.92 RG 0.6 w');
        comandosAtuais.push(`${MARGIN_X} ${cursorY - alturaBlocoFiltro} ${larguraUtil} ${alturaBlocoFiltro} re S`);

        let fy = cursorY - 12;
        for (const lf of linhasFiltro) {
          comandosAtuais.push('0.18 0.23 0.32 rg');
          comandosAtuais.push(`BT /F1 8 Tf ${MARGIN_X + 10} ${fy} Td ${codificarLiteralPdf(lf)} Tj ET`);
          fy -= 12;
        }
        cursorY -= alturaBlocoFiltro + 10;
      }

      // Cards de indicadores consolidados
      if (cardsResumo.length > 0) {
        const gap = 6;
        const n = cardsResumo.length;
        const cardW = (larguraUtil - gap * (n - 1)) / n;
        const cardH = 38;
        for (let i = 0; i < n; i++) {
          const cx = MARGIN_X + i * (cardW + gap);
          const cy = cursorY - cardH;
          comandosAtuais.push('0.94 0.96 1 rg');
          comandosAtuais.push(`${cx.toFixed(2)} ${cy.toFixed(2)} ${cardW.toFixed(2)} ${cardH} re f`);
          comandosAtuais.push('0.76 0.81 0.94 RG 0.6 w');
          comandosAtuais.push(`${cx.toFixed(2)} ${cy.toFixed(2)} ${cardW.toFixed(2)} ${cardH} re S`);

          comandosAtuais.push('0.35 0.41 0.52 rg');
          comandosAtuais.push(
            `BT /F2 7 Tf ${(cx + 7).toFixed(2)} ${(cy + 25).toFixed(2)} Td ${codificarLiteralPdf(cardsResumo[i].rotulo.toUpperCase())} Tj ET`
          );
          comandosAtuais.push('0.07 0.10 0.18 rg');
          comandosAtuais.push(
            `BT /F2 10.5 Tf ${(cx + 7).toFixed(2)} ${(cy + 10).toFixed(2)} Td ${codificarLiteralPdf(cardsResumo[i].valor)} Tj ET`
          );
        }
        cursorY -= cardH + 12;
      }
    }

    desenharCabecalhoTabela();
  };

  const desenharCabecalhoTabela = () => {
    const alturaCabecalho = 20;
    comandosAtuais.push('0.12 0.16 0.26 rg');
    comandosAtuais.push(`${MARGIN_X} ${cursorY - alturaCabecalho} ${larguraUtil} ${alturaCabecalho} re f`);

    let colX = MARGIN_X + 5;
    comandosAtuais.push('1 1 1 rg');
    for (const col of colunas) {
      comandosAtuais.push(
        `BT /F2 7.5 Tf ${colX.toFixed(2)} ${(cursorY - 13).toFixed(2)} Td ${codificarLiteralPdf(col.titulo)} Tj ET`
      );
      colX += col.largura;
    }
    cursorY -= alturaCabecalho;
  };

  iniciarNovaPagina(true);

  if (linhas.length === 0) {
    comandosAtuais.push('0.35 0.40 0.48 rg');
    comandosAtuais.push(
      `BT /F1 9.5 Tf ${MARGIN_X + 12} ${cursorY - 22} Td ${codificarLiteralPdf('Nenhuma corrida encontrada para os filtros informados.')} Tj ET`
    );
  } else {
    const fonteLinha = 7.3;
    const entrelinha = 9.5;

    for (let idx = 0; idx < linhas.length; idx++) {
      const registro = linhas[idx];
      const celulasQuebradas = colunas.map((col) =>
        quebrarTextoEmLinhas(registro[col.chave], col.largura - 8, fonteLinha, col.maxLinhas || 2)
      );
      const maxLinhasCelula = Math.max(1, ...celulasQuebradas.map((c) => c.length));
      const alturaLinha = maxLinhasCelula * entrelinha + 7;

      if (cursorY - alturaLinha < MARGIN_BOTTOM + 16) {
        iniciarNovaPagina(false);
      }

      const topoLinha = cursorY;
      const baseLinha = cursorY - alturaLinha;

      if (idx % 2 === 1) {
        comandosAtuais.push('0.97 0.98 0.995 rg');
        comandosAtuais.push(`${MARGIN_X} ${baseLinha.toFixed(2)} ${larguraUtil} ${alturaLinha.toFixed(2)} re f`);
      }

      // Linha divisória inferior sutil
      comandosAtuais.push('0.87 0.90 0.94 RG 0.4 w');
      comandosAtuais.push(`${MARGIN_X} ${baseLinha.toFixed(2)} m ${MARGIN_X + larguraUtil} ${baseLinha.toFixed(2)} l S`);

      let colX = MARGIN_X + 5;
      comandosAtuais.push('0.10 0.13 0.20 rg');
      for (let cIdx = 0; cIdx < colunas.length; cIdx++) {
        const linhasTexto = celulasQuebradas[cIdx];
        for (let lIdx = 0; lIdx < linhasTexto.length; lIdx++) {
          const textoY = topoLinha - 10 - lIdx * entrelinha;
          comandosAtuais.push(
            `BT /F1 ${fonteLinha} Tf ${colX.toFixed(2)} ${textoY.toFixed(2)} Td ${codificarLiteralPdf(linhasTexto[lIdx])} Tj ET`
          );
        }
        colX += colunas[cIdx].largura;
      }

      cursorY = baseLinha;
    }
  }

  paginasComandos.push(comandosAtuais);

  // Adiciona rodapé com numeração "Página X de Y" em cada página
  const totalPaginas = paginasComandos.length;
  for (let i = 0; i < totalPaginas; i++) {
    const cmds = paginasComandos[i];
    cmds.push('0.84 0.87 0.92 RG 0.5 w');
    cmds.push(`${MARGIN_X} ${MARGIN_BOTTOM - 4} m ${MARGIN_X + larguraUtil} ${MARGIN_BOTTOM - 4} l S`);
    cmds.push('0.42 0.47 0.56 rg');
    if (rodapeNota) {
      cmds.push(
        `BT /F1 7.5 Tf ${MARGIN_X} ${MARGIN_BOTTOM - 16} Td ${codificarLiteralPdf(rodapeNota)} Tj ET`
      );
    }
    const textoPag = `Página ${i + 1} de ${totalPaginas} • Corridas UCL`;
    cmds.push(
      `BT /F2 7.5 Tf ${PAGE_WIDTH - MARGIN_X - 135} ${MARGIN_BOTTOM - 16} Td ${codificarLiteralPdf(textoPag)} Tj ET`
    );
  }

  // Montagem binária da estrutura PDF 1.4
  // Objetos: 1 Catalog, 2 Pages, 3 Font Regular, 4 Font Bold, e pares (Page, Contents) a partir de 5
  const objetos = [];
  const idsPaginas = [];

  for (let i = 0; i < totalPaginas; i++) {
    idsPaginas.push(5 + i * 2);
  }

  objetos[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objetos[2] = `<< /Type /Pages /Kids [${idsPaginas.map((id) => `${id} 0 R`).join(' ')}] /Count ${totalPaginas} >>`;
  objetos[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objetos[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

  for (let i = 0; i < totalPaginas; i++) {
    const pageId = 5 + i * 2;
    const contentId = pageId + 1;
    const streamBody = paginasComandos[i].join('\n');
    const streamLen = Buffer.byteLength(streamBody, 'latin1');

    objetos[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objetos[contentId] = `<< /Length ${streamLen} >>\nstream\n${streamBody}\nendstream`;
  }

  const partes = ['%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'];
  const offsets = [0];
  let bytePos = Buffer.byteLength(partes[0], 'latin1');

  const totalObjetos = objetos.length - 1;
  for (let id = 1; id <= totalObjetos; id++) {
    offsets[id] = bytePos;
    const bloco = `${id} 0 obj\n${objetos[id]}\nendobj\n`;
    partes.push(bloco);
    bytePos += Buffer.byteLength(bloco, 'latin1');
  }

  const xrefOffset = bytePos;
  let xref = `xref\n0 ${totalObjetos + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= totalObjetos; id++) {
    xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer =
    `trailer\n<< /Size ${totalObjetos + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  partes.push(xref, trailer);
  return Buffer.from(partes.join(''), 'latin1');
}

module.exports = {
  gerarPdfRelatorio,
  sanitizarTextoWinAnsi,
};
