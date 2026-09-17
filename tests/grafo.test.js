const Grafo = require('../src/grafo/Grafo');
const Vertice = require('../src/grafo/Vertice');
const Aresta = require('../src/grafo/Aresta');
const { ArvoreBinariaBusca } = require('../src/grafo/ArvoreBinariaBusca');
const grafoService = require('../src/grafo/grafo.service');

// Helper para criar uma rota fake para os testes da ABB
const criarRota = (distanciaMetros, extra = {}) => ({
  distanciaMetros,
  duracaoSegundos: Math.round(distanciaMetros / 10),
  polyline: 'fake_polyline_' + distanciaMetros,
  distanciaFormatada: (distanciaMetros / 1000).toFixed(1) + ' km',
  ...extra,
});

// ═══════════════════════════════════════════════════════════════
// Classe Vertice
// ═══════════════════════════════════════════════════════════════
describe('Classe Vertice', () => {
  test('deve criar um vertice com id, nome e cidade', () => {
    const v = new Vertice('1', 'Centro', 'Vitória');
    expect(v.id).toBe('1');
    expect(v.nome).toBe('Centro');
    expect(v.cidade).toBe('Vitória');
  });

  test('toString deve retornar o nome do vertice', () => {
    const v = new Vertice('1', 'Centro');
    expect(v.toString()).toBe('Centro');
  });
});

// ═══════════════════════════════════════════════════════════════
// Classe Aresta
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// Classe Grafo
// ═══════════════════════════════════════════════════════════════
describe('Classe Grafo', () => {
  test('deve iniciar vazio — sem vertices nem arestas', () => {
    const grafo = new Grafo();
    expect(grafo.obterVertices()).toHaveLength(0);
    expect(grafo.obterArestas()).toHaveLength(0);
  });

  test('deve adicionar vertices dinamicamente', () => {
    const grafo = new Grafo();
    grafo.adicionarVertice(new Vertice('1', 'Centro'));
    expect(grafo.possuiVertice('Centro')).toBe(true);
    expect(grafo.obterVertices()).toHaveLength(1);
  });

  test('deve adicionar origem e destino dinamicamente sem pontos pre-existentes', () => {
    const grafo = new Grafo();
    grafo.adicionarVertice(new Vertice('orig', 'Serra - Terminal'));
    grafo.adicionarVertice(new Vertice('dest', 'Vitória - Rodoviária'));
    grafo.adicionarAresta('Serra - Terminal', 'Vitória - Rodoviária', 18.5);
    expect(grafo.obterVertices()).toHaveLength(2);
    expect(grafo.obterArestas()).toHaveLength(1);
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
    const grafo = new Grafo();
    grafo.adicionarVertice(new Vertice('1', 'A'));
    grafo.adicionarVertice(new Vertice('2', 'B'));
    grafo.adicionarAresta('A', 'B', 10);
    const obj = grafo.paraObjeto();
    expect(obj).toHaveProperty('A');
    expect(Array.isArray(obj['A'])).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Árvore Binária de Busca (ABB)
// ═══════════════════════════════════════════════════════════════
describe('ArvoreBinariaBusca', () => {
  test('arvore vazia nao possui raiz', () => {
    const abb = new ArvoreBinariaBusca();
    expect(abb.estaVazia()).toBe(true);
    expect(abb.raiz).toBeNull();
  });

  test('arvore vazia — percurso em ordem retorna array vazio', () => {
    const abb = new ArvoreBinariaBusca();
    expect(abb.percorrerEmOrdem()).toEqual([]);
    expect(abb.obterOrdenadas()).toEqual([]);
  });

  test('arvore vazia — busca retorna null', () => {
    const abb = new ArvoreBinariaBusca();
    expect(abb.buscar(5000)).toBeNull();
  });

  test('inserir uma rota posiciona corretamente na raiz', () => {
    const abb = new ArvoreBinariaBusca();
    const rota = criarRota(5000);
    abb.inserir(5000, rota);
    expect(abb.raiz).not.toBeNull();
    expect(abb.raiz.chave).toBe(5000);
    expect(abb.raiz.rotas).toHaveLength(1);
    expect(abb.raiz.rotas[0]).toBe(rota);
  });

  test('inserir varias rotas em ordem crescente', () => {
    const abb = new ArvoreBinariaBusca();
    abb.inserir(5000, criarRota(5000));
    abb.inserir(8000, criarRota(8000));
    abb.inserir(11000, criarRota(11000));

    const ordenadas = abb.obterOrdenadas();
    expect(ordenadas).toHaveLength(3);
    expect(ordenadas[0].distanciaMetros).toBe(5000);
    expect(ordenadas[1].distanciaMetros).toBe(8000);
    expect(ordenadas[2].distanciaMetros).toBe(11000);
  });

  test('inserir rotas fora de ordem — percurso in-order devolve ordenado', () => {
    const abb = new ArvoreBinariaBusca();
    abb.inserir(11000, criarRota(11000));
    abb.inserir(5000, criarRota(5000));
    abb.inserir(8000, criarRota(8000));
    abb.inserir(15000, criarRota(15000));

    const ordenadas = abb.obterOrdenadas();
    expect(ordenadas).toHaveLength(4);
    expect(ordenadas[0].distanciaMetros).toBe(5000);
    expect(ordenadas[1].distanciaMetros).toBe(8000);
    expect(ordenadas[2].distanciaMetros).toBe(11000);
    expect(ordenadas[3].distanciaMetros).toBe(15000);
  });

  test('inserir rotas com distancia duplicada — ambas preservadas no mesmo no', () => {
    const abb = new ArvoreBinariaBusca();
    const rotaA = criarRota(5000, { id: 'A' });
    const rotaB = criarRota(5000, { id: 'B' });
    abb.inserir(5000, rotaA);
    abb.inserir(5000, rotaB);

    expect(abb.raiz.rotas).toHaveLength(2);

    const ordenadas = abb.obterOrdenadas();
    expect(ordenadas).toHaveLength(2);
    expect(ordenadas.some((r) => r.id === 'A')).toBe(true);
    expect(ordenadas.some((r) => r.id === 'B')).toBe(true);
  });

  test('inserir rotas com distancia duplicada entre outras — todas preservadas', () => {
    const abb = new ArvoreBinariaBusca();
    abb.inserir(5000, criarRota(5000));
    abb.inserir(5000, criarRota(5000)); // empate
    abb.inserir(8000, criarRota(8000));

    const ordenadas = abb.obterOrdenadas();
    expect(ordenadas).toHaveLength(3);
    expect(ordenadas.filter((r) => r.distanciaMetros === 5000)).toHaveLength(2);
  });

  test('buscar chave existente retorna o no correto', () => {
    const abb = new ArvoreBinariaBusca();
    const rota = criarRota(8200);
    abb.inserir(5000, criarRota(5000));
    abb.inserir(8200, rota);
    abb.inserir(11000, criarRota(11000));

    const no = abb.buscar(8200);
    expect(no).not.toBeNull();
    expect(no.chave).toBe(8200);
    expect(no.rotas[0]).toBe(rota);
  });

  test('buscar chave inexistente retorna null', () => {
    const abb = new ArvoreBinariaBusca();
    abb.inserir(5000, criarRota(5000));
    expect(abb.buscar(9999)).toBeNull();
  });

  test('percurso em ordem retorna nos do menor ao maior — verificar estrutura', () => {
    const abb = new ArvoreBinariaBusca();
    abb.inserir(15000, criarRota(15000));
    abb.inserir(5000, criarRota(5000));
    abb.inserir(8000, criarRota(8000));
    abb.inserir(11000, criarRota(11000));

    const nos = abb.percorrerEmOrdem();
    expect(nos).toHaveLength(4);
    nos.forEach((no) => {
      expect(no).toHaveProperty('chave');
      expect(no).toHaveProperty('rotas');
      expect(Array.isArray(no.rotas)).toBe(true);
    });
    for (let i = 1; i < nos.length; i++) {
      expect(nos[i].chave).toBeGreaterThan(nos[i - 1].chave);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// GrafoService — grafo dinâmico
// ═══════════════════════════════════════════════════════════════
describe('GrafoService — grafo dinamico', () => {
  const origem  = { nome: 'Rodoviária de Serra', lat: -20.12, lng: -40.30 };
  const destino = { nome: 'Terminal de Vitória', lat: -20.32, lng: -40.33 };

  test('construirGrafoDaOperacao inicia com exatamente 2 vertices e as arestas correspondentes', () => {
    const grafo = grafoService.construirGrafoDaOperacao(origem, destino, [{ distanciaMetros: 12500 }]);
    expect(grafo.obterVertices()).toHaveLength(2);
    expect(grafo.obterArestas()).toHaveLength(1);
  });

  test('vertices possuem os nomes de origem e destino fornecidos', () => {
    const grafo = grafoService.construirGrafoDaOperacao(origem, destino, [{ distanciaMetros: 12500 }]);
    expect(grafo.possuiVertice(origem.nome)).toBe(true);
    expect(grafo.possuiVertice(destino.nome)).toBe(true);
  });

  test('nenhuma localizacao fixa e carregada pelo service', () => {
    const grafo = grafoService.construirGrafoDaOperacao(origem, destino, [{ distanciaMetros: 12500 }]);
    const nomes = grafo.obterVertices().map((v) => v.nome);
    expect(nomes).not.toContain('Rodoviária de Vitória');
    expect(nomes).not.toContain('Aeroporto de Vitória');
    expect(nomes).not.toContain('Estádio Kleber Andrade');
    expect(nomes).not.toContain('Estação Pedro Nolasco');
    expect(nomes).not.toContain('Convento da Penha');
    expect(nomes).not.toContain('Terminal de Carapina');
    expect(nomes).not.toContain('Shopping Montserrat');
  });

  test('nenhuma aresta criada artificialmente por proximidade geografica', () => {
    const grafo = grafoService.construirGrafoDaOperacao(origem, destino, [{ distanciaMetros: 12500 }]);
    const arestas = grafo.obterArestas();
    expect(arestas).toHaveLength(1);
    // 12500 m = 12.5 km
    expect(arestas[0].peso).toBeCloseTo(12.5, 1);
  });

  test('cada requisicao produz grafo independente — sem estado global', () => {
    const origemA  = { nome: 'A', lat: -20.1, lng: -40.1 };
    const destinoA = { nome: 'B', lat: -20.2, lng: -40.2 };
    const origemB  = { nome: 'C', lat: -20.3, lng: -40.3 };
    const destinoB = { nome: 'D', lat: -20.4, lng: -40.4 };

    const grafoOp1 = grafoService.construirGrafoDaOperacao(origemA, destinoA, [{ distanciaMetros: 5000 }]);
    const grafoOp2 = grafoService.construirGrafoDaOperacao(origemB, destinoB, [{ distanciaMetros: 9000 }]);

    expect(grafoOp1.possuiVertice('A')).toBe(true);
    expect(grafoOp1.possuiVertice('C')).toBe(false);

    expect(grafoOp2.possuiVertice('C')).toBe(true);
    expect(grafoOp2.possuiVertice('A')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// GrafoService — organizarAlternativasComABB
// ═══════════════════════════════════════════════════════════════
describe('GrafoService — organizarAlternativasComABB', () => {
  test('retorna array vazio para lista vazia', () => {
    expect(grafoService.organizarAlternativasComABB([])).toEqual([]);
    expect(grafoService.organizarAlternativasComABB(null)).toEqual([]);
  });

  test('retorna a unica rota sem alteracao quando ha apenas uma', () => {
    const rota = criarRota(5000);
    const resultado = grafoService.organizarAlternativasComABB([rota]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toBe(rota);
  });

  test('ordena rotas do menor para o maior percurso via ABB', () => {
    const rotaA = criarRota(11000);
    const rotaB = criarRota(5000);
    const rotaC = criarRota(8000);

    const resultado = grafoService.organizarAlternativasComABB([rotaA, rotaB, rotaC]);

    expect(resultado).toHaveLength(3);
    expect(resultado[0].distanciaMetros).toBe(5000);
    expect(resultado[1].distanciaMetros).toBe(8000);
    expect(resultado[2].distanciaMetros).toBe(11000);
  });

  test('preserva rotas com distancia identica — nenhuma descartada', () => {
    const rotaA = criarRota(5000, { id: 'X' });
    const rotaB = criarRota(5000, { id: 'Y' });
    const rotaC = criarRota(8000, { id: 'Z' });

    const resultado = grafoService.organizarAlternativasComABB([rotaA, rotaB, rotaC]);

    expect(resultado).toHaveLength(3);
    expect(resultado[0].distanciaMetros).toBe(5000);
    expect(resultado[1].distanciaMetros).toBe(5000);
    expect(resultado[2].distanciaMetros).toBe(8000);
  });

  test('operacoes independentes — dados de uma nao vazam para outra', () => {
    const op1 = [criarRota(5000), criarRota(8000)];
    const op2 = [criarRota(3000), criarRota(15000)];

    const res1 = grafoService.organizarAlternativasComABB(op1);
    const res2 = grafoService.organizarAlternativasComABB(op2);

    expect(res1.every((r) => r.distanciaMetros === 5000 || r.distanciaMetros === 8000)).toBe(true);
    expect(res2.every((r) => r.distanciaMetros === 3000 || r.distanciaMetros === 15000)).toBe(true);
  });
});
