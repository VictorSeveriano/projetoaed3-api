# projetoaed3-api

API REST do Sistema de Reserva de Carros — Projeto da disciplina AED3 (Algoritmos e Estruturas de Dados III).

## Objetivo

Sistema de reserva de veiculos com uso **real e obrigatorio de Grafos** como estrutura central da logica de negocio. O grafo representa localidades (vertices) interligadas por distancias (arestas com pesos). O **Algoritmo de Dijkstra** calcula a menor rota entre pontos de retirada e devolucao durante o processo de reserva.

## Tecnologias

- **Node.js** + **Express.js**
- **Jest** (testes unitarios)
- **Sem banco de dados** (armazenamento em memoria / Repository Pattern)

## Arquitetura

```
Controller → Service → Repository → Dados em Memória
                ↕
        GrafoService (Dijkstra)
```

## Estrutura de Pastas

```
src/
├── auth/           # Autenticacao (login simulado)
├── carros/         # CRUD de carros
├── reservas/       # CRUD de reservas + integracao com grafo
├── localizacoes/   # Localizacoes do sistema
├── grafo/          # Grafo, Dijkstra, GrafoService
│   ├── Grafo.js       ← Lista de adjacencia
│   ├── Vertice.js     ← Vertice do grafo
│   ├── Aresta.js      ← Aresta com peso (distancia em km)
│   └── Dijkstra.js    ← Algoritmo implementado do zero
├── data/           # Dados ficticios em memoria
├── middlewares/    # CORS, autenticacao, erros
└── utils/          # Helpers, AppError, dateUtils
```

## O Grafo no Sistema

### O que e o grafo?
Representacao das localidades da empresa de aluguel, onde carros estao distribuidos.

### O que e um vertice?
Cada localidade: Centro, Shopping, Aeroporto, Rodoviaria, Praia, Universidade.

### O que e uma aresta?
Conexao entre duas localidades com peso = distancia em km.

### O que e o peso?
Distancia em quilometros entre as localidades conectadas.

### Grafo inicial
```
Centro ─5km─ Shopping ─12km─ Aeroporto
  │              │                │
  7km           20km            18km
  │              │                │
Rodoviaria ─15km─┤      Universidade
  │              │
  10km          Praia ─8km─ Universidade
  └─────────────┘
```

### Algoritmo de Dijkstra
- **Por que Dijkstra?** Grafo com pesos positivos (distancias em km), sem ciclos negativos
- **Complexidade:** O((V + E) log V) com lista de adjacencia
- **Implementacao:** Manual, em `src/grafo/Dijkstra.js`

## Como Instalar

```bash
npm install
```

## Como Executar

```bash
# Desenvolvimento (com nodemon)
npm run dev

# Producao
npm start
```

## Testes

```bash
npm test
```

## Endpoints

### Auth
| Metodo | Rota             | Descricao      |
|--------|------------------|----------------|
| POST   | /api/auth/login  | Fazer login    |

### Carros
| Metodo | Rota                  | Descricao                    |
|--------|------------------------|------------------------------|
| GET    | /api/carros            | Listar todos (com filtros)   |
| GET    | /api/carros/disponiveis| Listar disponiveis           |
| GET    | /api/carros/:id        | Buscar por ID                |

### Reservas
| Metodo | Rota                       | Descricao           |
|--------|---------------------------|---------------------|
| GET    | /api/reservas             | Listar todas        |
| GET    | /api/reservas/:id         | Buscar por ID       |
| POST   | /api/reservas             | Criar reserva       |
| PATCH  | /api/reservas/:id/cancelar| Cancelar            |
| DELETE | /api/reservas/:id         | Deletar             |

### Grafo (Dijkstra)
| Metodo | Rota                                          | Descricao          |
|--------|-----------------------------------------------|--------------------|
| GET    | /api/grafo                                    | Estrutura do grafo |
| GET    | /api/grafo/rota?origem=Centro&destino=Aeroporto | Menor caminho    |

## Usuario Padrao

```
Usuario: admin
Senha:   admin123
```

## Branches

- `main` → versao estavel
- `hom`  → homologacao/testes
- `dev`  → desenvolvimento ativo

Fluxo: `dev → hom → main`

## Exemplo de Rota

```
GET /api/grafo/rota?origem=Centro&destino=Aeroporto

{
  "success": true,
  "data": {
    "origem": "Centro",
    "destino": "Aeroporto",
    "caminho": ["Centro", "Shopping", "Aeroporto"],
    "distanciaTotal": 17
  }
}
```
