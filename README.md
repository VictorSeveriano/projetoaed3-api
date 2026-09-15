# projetoaed3-api

API REST do Sistema de Corridas — Projeto da disciplina AED3 (Algoritmos e Estruturas de Dados III).

## Objetivo

Sistema de **solicitacao de corridas** com roteamento real pela malha viaria, geocodificacao de enderecos e uso academico de estruturas de grafos (Dijkstra e BFS via RouteSearchTree).

O fluxo principal:
```
Usuario -> Origem (CEP/Endereco) -> Geocodificacao (ViaCEP + Nominatim)
       -> Google Routes API -> Rotas reais (polyline da malha viaria)
       -> GrafoService.ordenarRotasReais() (Dijkstra) -> Melhor rota
       -> Selecao de veiculo -> Valor calculado -> Corrida criada
```

## Tecnologias

- **Node.js** + **Express.js**
- **Google Maps Routes API v2** - rotas reais pela malha viaria
- **ViaCEP** - geocodificacao de CEPs brasileiros
- **Nominatim (OpenStreetMap)** - geocodificacao de enderecos livres
- **Jest** - testes unitarios
- **Sem banco de dados** - armazenamento em memoria via Repository Pattern

## Arquitetura

```
Controller -> Service -> Repository -> Dados em Memoria (src/data/)
                |
        RotasService (Google Routes API + Geocodificacao)
                |
        GrafoService (Dijkstra + RouteSearchTree)
```

## Estrutura de Pastas

```
src/
|-- auth/           # Autenticacao (token fixo de sessao)
|-- carros/         # CRUD de veiculos (DISPONIVEL / EM_CORRIDA)
|-- corridas/       # Entidade principal: Corrida.js + fluxo completo
|-- rotas/          # Google Routes API + ViaCEP + Nominatim
|-- grafo/          # Grafo estatico do ES + Dijkstra + RouteSearchTree
|   |-- Grafo.js
|   |-- Vertice.js
|   |-- Aresta.js
|   |-- Dijkstra.js
|   |-- RouteSearchTree.js
|   `-- grafo.service.js
|-- reservas/       # Sistema legado (modelo de aluguel)
|-- localizacoes/   # Lista os vertices do grafo fixo
|-- dashboard/      # Metricas: corridas/mes, origens, destinos, faturamento
|-- data/           # Dados mock em memoria
|-- middlewares/    # auth, errorHandler, validate
`-- utils/          # AppError, dateUtils, responseHelper
```

## Grafo no Sistema

O projeto usa grafos em **dois contextos distintos**:

### 1. Grafo Estatico Academico (7 locais fixos do ES)

Locais: Estacao Pedro Nolasco, Estadio Kleber Andrade, Aeroporto de Vitoria,
Rodovaria de Vitoria, Shopping Montserrat, Terminal de Carapina, Convento da Penha.

- **Dijkstra**: menor caminho entre dois locais fixos -> `GET /api/grafo/rota`
- **RouteSearchTree (BFS)**: ate 3 rotas alternativas -> `GET /api/grafo/rotas`

### 2. Grafo Dinamico para Ordenacao de Rotas Reais

A Google Routes API retorna 1-3 rotas alternativas reais. O `GrafoService.ordenarRotasReais()`
constroi um grafo temporario com essas rotas como nos e executa Dijkstra para
identificar a de menor distancia.

**Importante:** Conexoes sao baseadas em distancias reais da API, nao em Haversine.

## Variaveis de Ambiente

Crie um `.env` baseado em `.env.example`:

```env
PORT=3001
FRONTEND_URL=http://localhost:5173
GOOGLE_MAPS_API_KEY=sua_chave_servidor_aqui
# NODE_TLS_REJECT_UNAUTHORIZED=0  (apenas para TLS corporativo em dev)
```

## Como Instalar e Executar

```bash
npm install
npm run dev   # desenvolvimento
npm start     # producao
npm test      # testes unitarios
```

## Endpoints Principais

### Auth
| Metodo | Rota            | Descricao   |
|--------|-----------------|-------------|
| POST   | /api/auth/login | Fazer login |

### Corridas
| Metodo | Rota                        | Descricao                        |
|--------|-----------------------------|----------------------------------|
| GET    | /api/corridas               | Listar todas                     |
| GET    | /api/corridas/:id           | Buscar por ID                    |
| POST   | /api/corridas               | Criar nova corrida               |
| PATCH  | /api/corridas/:id/cancelar  | Cancelar (SOLICITADA/CONFIRMADA) |
| PATCH  | /api/corridas/:id/finalizar | Finalizar corrida                |

### Rotas
| Metodo | Rota                    | Descricao                                  |
|--------|-------------------------|--------------------------------------------|
| POST   | /api/rotas/calcular     | Geocodifica + calcula rotas reais (Google) |
| POST   | /api/rotas/geocodificar | Geocodifica CEP ou endereco livre          |

### Grafo Academico
| Metodo | Rota                               | Descricao                   |
|--------|------------------------------------|-----------------------------|
| GET    | /api/grafo                         | Estrutura completa do grafo |
| GET    | /api/grafo/rota?origem=X&destino=Y | Menor caminho (Dijkstra)    |
| GET    | /api/grafo/rotas?origem=X&destino=Y| Rotas alternativas (BFS)    |
| GET    | /api/grafo/vertices                | Lista de vertices           |

### Carros
| Metodo | Rota                    | Descricao                  |
|--------|-------------------------|----------------------------|
| GET    | /api/carros             | Listar todos (com filtros) |
| GET    | /api/carros/disponiveis | Listar disponiveis         |

### Dashboard
| Metodo | Rota                       | Descricao                 |
|--------|----------------------------|---------------------------|
| GET    | /api/dashboard/resumo      | Totais gerais             |
| GET    | /api/dashboard/corridas    | Corridas por mes          |
| GET    | /api/dashboard/origens     | Origens mais solicitadas  |
| GET    | /api/dashboard/destinos    | Destinos mais solicitados |
| GET    | /api/dashboard/faturamento | Faturamento mensal        |

## Status de Corrida

| Status       | Descricao                                |
|--------------|------------------------------------------|
| SOLICITADA   | Criada pelo usuario, aguardando inicio   |
| CONFIRMADA   | Veiculo alocado, confirmada pelo sistema |
| EM_ANDAMENTO | Corrida em execucao                      |
| FINALIZADA   | Concluida com sucesso                    |
| CANCELADA    | Cancelada pelo usuario ou sistema        |

## Usuario Padrao

```
Usuario: admin
Senha:   admin123
```

## Branches

- `main` -> versao estavel
- `hom`  -> homologacao/testes
- `dev`  -> desenvolvimento ativo

Fluxo: `dev -> hom -> main`
