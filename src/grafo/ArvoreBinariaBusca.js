/**
 * ArvoreBinariaBusca — Organiza as alternativas de rota por chave numérica.
 *
 * FINALIDADE NO SISTEMA:
 * Após o serviço de roteamento retornar as rotas reais (Google Routes API),
 * cada alternativa é inserida na ABB usando a distância em metros como chave.
 * O percurso in-order retorna as rotas ordenadas do menor ao maior percurso,
 * permitindo apresentar a melhor opção primeiro.
 *
 * OPERAÇÕES:
 * - inserir(chave, rota)     : insere rota na posição correta pela chave
 * - buscar(chave)            : retorna o nó com aquela chave exata
 * - percorrerEmOrdem()       : in-order (esq → raiz → dir), menor ao maior
 * - obterOrdenadas()         : array plano de rotas, ordenado por distância
 *
 * DISTÂNCIAS IGUAIS:
 * Dois caminhos com mesma distância são ambos preservados no mesmo nó.
 * O nó mantém um array `rotas` — nunca descarta uma alternativa por empate.
 *
 * CICLO DE VIDA:
 * Uma instância por operação de rota/corrida. Não é um singleton global —
 * evita misturar alternativas de corridas diferentes.
 */

/**
 * Nó interno da Árvore Binária de Busca.
 *
 * @property {number}   chave     - Distância em metros (chave de comparação)
 * @property {object[]} rotas     - Uma ou mais rotas com esta distância
 * @property {NoArvore|null} esquerda - Subárvore com chaves menores
 * @property {NoArvore|null} direita  - Subárvore com chaves maiores
 */
class NoArvore {
  constructor(chave, rota) {
    this.chave    = chave;
    this.rotas    = [rota]; // array para suportar distâncias iguais
    this.esquerda = null;
    this.direita  = null;
  }
}

class ArvoreBinariaBusca {
  constructor() {
    /** @type {NoArvore|null} */
    this.raiz = null;
  }

  /**
   * Insere uma rota na árvore usando a chave numérica fornecida.
   *
   * Se já existir um nó com a mesma chave, a rota é adicionada ao
   * array do nó — nunca descartada por empate em distância.
   *
   * @param {number} chave  - Distância em metros
   * @param {object} rota   - Objeto completo da rota (distância, duração, polyline, …)
   */
  inserir(chave, rota) {
    this.raiz = this._inserirNo(this.raiz, chave, rota);
  }

  /**
   * Recursão interna de inserção.
   * @private
   */
  _inserirNo(no, chave, rota) {
    if (no === null) {
      return new NoArvore(chave, rota);
    }

    if (chave < no.chave) {
      no.esquerda = this._inserirNo(no.esquerda, chave, rota);
    } else if (chave > no.chave) {
      no.direita = this._inserirNo(no.direita, chave, rota);
    } else {
      // Chave já existe: preserva todas as rotas com a mesma distância
      no.rotas.push(rota);
    }

    return no;
  }

  /**
   * Busca o nó com a chave exata informada.
   *
   * @param {number} chave - Distância em metros a localizar
   * @returns {NoArvore|null} Nó encontrado, ou null se não existir
   */
  buscar(chave) {
    return this._buscarNo(this.raiz, chave);
  }

  /**
   * Recursão interna de busca.
   * @private
   */
  _buscarNo(no, chave) {
    if (no === null) return null;

    if (chave === no.chave) return no;
    if (chave < no.chave) return this._buscarNo(no.esquerda, chave);
    return this._buscarNo(no.direita, chave);
  }

  /**
   * Percorre a árvore em ordem (in-order: esquerda → raiz → direita),
   * retornando os nós do menor para o maior valor de chave.
   *
   * @returns {{ chave: number, rotas: object[] }[]}
   */
  percorrerEmOrdem() {
    const resultado = [];
    this._emOrdem(this.raiz, resultado);
    return resultado;
  }

  /**
   * Recursão interna do percurso in-order.
   * @private
   */
  _emOrdem(no, resultado) {
    if (no === null) return;
    this._emOrdem(no.esquerda, resultado);
    resultado.push({ chave: no.chave, rotas: no.rotas });
    this._emOrdem(no.direita, resultado);
  }

  /**
   * Retorna um array plano de todas as rotas ordenadas por distância crescente.
   * Quando há empates, a ordem interna do grupo é a de inserção.
   *
   * @returns {object[]} Rotas ordenadas da menor para a maior distância
   */
  obterOrdenadas() {
    return this.percorrerEmOrdem().flatMap((no) => no.rotas);
  }

  /**
   * Indica se a árvore não possui nenhum nó.
   * @returns {boolean}
   */
  estaVazia() {
    return this.raiz === null;
  }
}

module.exports = { ArvoreBinariaBusca, NoArvore };
