const Grafo = require('../src/grafo/Grafo');
const Vertice = require('../src/grafo/Vertice');
const Aresta = require('../src/grafo/Aresta');
const Dijkstra = require('../src/grafo/Dijkstra');

// Helper para criar um grafo de teste padrao
const criarGrafoDeTeste = () => {
  const grafo = new Grafo();
  const vertices = ['Centro', 'Shopping', 'Aeroporto', 'Rodoviaria', 'Praia', 'Universidade'];
  vertices.forEach((nome, i) => grafo.adicionarVertice(new Vertice(String(i + 1), nome)));
  grafo.adicionarAresta('Centro', 'Shopping', 5);
  grafo.adicionarAresta('Centro', 'Rodoviaria', 7);
  grafo.adicionarAresta('Shopping', 'Aeroporto', 12);
  grafo.adicionarAresta('Shopping', 'Praia', 20);
  grafo.adicionarAresta('Rodoviaria', 'Aeroporto', 15);
  grafo.adicionarAresta('Rodoviaria', 'Praia', 10);
  grafo.adicionarAresta('Praia', 'Universidade', 8);
  grafo.adicionarAresta('Universidade', 'Aeroporto', 18);
  return grafo;
};

describe('Classe Vertice', () => {
  test('deve criar um vertice com id, nome e descricao', () => {
    const v = new Vertice('1', 'Centro', 'Regiao central');
    expect(v.id).toBe('1');
    expect(v.nome).toBe('Centro');
    expect(v.descricao).toBe('Regiao central');
  });

  test('toString deve retornar o nome do vertice', () => {
    const v = new Vertice('1', 'Centro');
    expect(v.toString()).toBe('Centro');
  });
});

describe('Classe Aresta', () => {
  test('deve criar uma aresta com origem, destino e peso valido', () => {
    const a = new Aresta('Centro', 'Shopping', 5);
    expect(a.origem).toBe('Centro');
    expect(a.destino).toBe('Shopping');
    expect(a.peso).toBe(5);
  });

  test('deve lancar erro para peso invalido (zero)', () => {
    expect(() => new Aresta('A', 'B', 0)).toThrow();
  });

  test('deve lancar erro para peso invalido (negativo)', () => {
    expect(() => new Aresta('A', 'B', -5)).toThrow();
  });
});

describe('Classe Grafo', () => {
  test('deve adicionar vertices corretamente', () => {
    const grafo = new Grafo();
    grafo.adicionarVertice(new Vertice('1', 'Centro'));
    expect(grafo.possuiVertice('Centro')).toBe(true);
    expect(grafo.obterVertices()).toHaveLength(1);
  });

  test('deve lancar erro ao adicionar vertice duplicado', () => {
    const grafo = new Grafo();
    grafo.adicionarVertice(new Vertice('1', 'Centro'));
    expect(() => grafo.adicionarVertice(new Vertice('2', 'Centro'))).toThrow();
  });

  test('deve adicionar arestas bidirecionais', () => {
    const grafo = new Grafo();
    grafo.adicionarVertice(new Vertice('1', 'Centro'));
    grafo.adicionarVertice(new Vertice('2', 'Shopping'));
    grafo.adicionarAresta('Centro', 'Shopping', 5);
    const vizinhosCentro = grafo.obterVizinhos('Centro');
    const vizinhosShopping = grafo.obterVizinhos('Shopping');
    expect(vizinhosCentro.some((a) => a.destino === 'Shopping')).toBe(true);
    expect(vizinhosShopping.some((a) => a.destino === 'Centro')).toBe(true);
  });

  test('deve lancar erro ao adicionar aresta com vertice inexistente', () => {
    const grafo = new Grafo();
    grafo.adicionarVertice(new Vertice('1', 'Centro'));
    expect(() => grafo.adicionarAresta('Centro', 'Inexistente', 5)).toThrow();
  });

  test('paraObjeto deve retornar lista de adjacencia como objeto', () => {
    const grafo = criarGrafoDeTeste();
    const obj = grafo.paraObjeto();
    expect(obj).toHaveProperty('Centro');
    expect(Array.isArray(obj['Centro'])).toBe(true);
  });
});

describe('Algoritmo Dijkstra', () => {
  let grafo;
  beforeEach(() => {
    grafo = criarGrafoDeTeste();
  });

  test('deve calcular o menor caminho Centro -> Aeroporto (17km)', () => {
    const resultado = Dijkstra.calcularMenorCaminho(grafo, 'Centro', 'Aeroporto');
    expect(resultado).not.toBeNull();
    expect(resultado.distanciaTotal).toBe(17);
    expect(resultado.caminho).toEqual(['Centro', 'Shopping', 'Aeroporto']);
  });

  test('deve calcular o menor caminho Centro -> Universidade', () => {
    const resultado = Dijkstra.calcularMenorCaminho(grafo, 'Centro', 'Universidade');
    expect(resultado).not.toBeNull();
    expect(resultado.distanciaTotal).toBe(25);
  });

  test('deve retornar caminho com distancia 0 para origem = destino', () => {
    const resultado = Dijkstra.calcularMenorCaminho(grafo, 'Centro', 'Centro');
    expect(resultado.distanciaTotal).toBe(0);
    expect(resultado.caminho).toEqual(['Centro']);
  });

  test('deve lancar erro para vertice de origem inexistente', () => {
    expect(() => Dijkstra.calcularMenorCaminho(grafo, 'Inexistente', 'Aeroporto')).toThrow();
  });

  test('deve lancar erro para vertice de destino inexistente', () => {
    expect(() => Dijkstra.calcularMenorCaminho(grafo, 'Centro', 'Inexistente')).toThrow();
  });

  test('deve retornar null para grafo sem caminho entre vertices', () => {
    const grafoDesconexo = new Grafo();
    grafoDesconexo.adicionarVertice(new Vertice('1', 'A'));
    grafoDesconexo.adicionarVertice(new Vertice('2', 'B'));
    const resultado = Dijkstra.calcularMenorCaminho(grafoDesconexo, 'A', 'B');
    expect(resultado).toBeNull();
  });
});
