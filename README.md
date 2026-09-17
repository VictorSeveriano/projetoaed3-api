# projetoaed3-api

API REST do Sistema de Corridas — Projeto da disciplina AED3 (Algoritmos e Estruturas de Dados III).

## Objetivo

Sistema de **solicitação de corridas** com roteamento real pela malha viária, geocodificação de endereços e demonstração de duas estruturas de dados dinâmicas: **Grafo** e **Árvore Binária de Busca (ABB)**.

Fluxo principal:
```
Usuário → Origem + Destino → Geocodificação (ViaCEP + Nominatim)
       → Google Routes API → Rotas reais (polyline da malha viária)
       → ABB: organiza alternativas por distância (in-order)
       → Grafo dinâmico: representa os dados da operação atual
       → Seleção de veículo → Valor calculado → Corrida criada
```

## Tecnologias

- **Node.js** + **Express.js**
- **Google Maps Routes API v2** — rotas reais pela malha viária
- **ViaCEP** — geocodificação de CEPs brasileiros
- **Nominatim (OpenStreetMap)** — geocodificação de endereços livres
- **Jest** — testes unitários
- **Sem banco de dados** — armazenamento em memória via Repository Pattern

## Estruturas de Dados

### Grafo Dinâmico

O grafo representa os dados da **operação de rota atual**:
- **Vértice Origem** — ponto de partida com coordenadas reais do usuário
- **Vértice Destino** — ponto de chegada com coordenadas reais
- **Aresta** — conecta Origem a Destino com peso = distância real em metros

O grafo **começa vazio** e é construído a cada operação. Não há pontos fixos
pré-cadastrados. Uma operação Serra → Vitória produz um grafo diferente de
Vila Velha → Cariacica.

### Árvore Binária de Busca (ABB)

A ABB organiza as alternativas reais de rota retornadas pelo serviço de roteamento,
usando a **distância em metros** como chave de ordenação:

```
inserir(5400, rotaA)
inserir(8200, rotaB)
inserir(11000, rotaC)
percorrerEmOrdem() → 5.4 km → 8.2 km → 11.0 km
```

Operações disponíveis: `inserir`, `buscar`, `percorrerEmOrdem`, `obterOrdenadas`.

Rotas com mesma distância são **ambas preservadas** no mesmo nó — nenhuma alternativa
é descartada por empate.

Uma ABB é criada por operação de rota — nunca global.

## Arquitetura

```
Controller → Service → Repository → Dados em Memória (src/data/)
                |
        RotasService (Google Routes API + Geocodificação)
                |
        GrafoService:
          ├── construirGrafoDaOperacao()       — grafo dinâmico por operação
          └── organizarAlternativasComABB()    — ABB in-order para ordenar rotas
```

## Estrutura de Pastas

```
src/
|-- auth/           # Autenticação (token fixo de sessão)
|-- carros/         # CRUD de veículos (DISPONIVEL / EM_CORRIDA)
|-- corridas/       # Entidade principal: Corrida.js + fluxo completo
|-- rotas/          # Google Routes API + ViaCEP + Nominatim
|-- grafo/          # Grafo dinâmico + ABB
|   |-- Grafo.js
|   |-- Vertice.js
|   |-- Aresta.js
|   |-- ArvoreBinariaBusca.js
|   └── grafo.service.js
|-- reservas/       # Sistema legado (modelo de aluguel)
|-- localizacoes/   # Módulo de localizações (lista vazia — sem pontos fixos)
|-- dashboard/      # Métricas: corridas/mês, origens, destinos, faturamento
|-- data/           # Dados mock em memória
|-- middlewares/    # auth, errorHandler, validate
└-- utils/          # AppError, dateUtils, responseHelper
```

## Variáveis de Ambiente

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
npm start     # produção
npm test      # testes unitários
```

## Endpoints Principais

### Auth
| Método | Rota            | Descrição   |
|--------|-----------------|-------------|
| POST   | /api/auth/login | Fazer login |

### Corridas
| Método | Rota                        | Descrição                        |
|--------|-----------------------------|----------------------------------|
| GET    | /api/corridas               | Listar todas                     |
| GET    | /api/corridas/:id           | Buscar por ID                    |
| POST   | /api/corridas               | Criar nova corrida               |
| PATCH  | /api/corridas/:id/cancelar  | Cancelar (SOLICITADA/CONFIRMADA) |
| PATCH  | /api/corridas/:id/finalizar | Finalizar corrida                |

### Rotas
| Método | Rota                        | Descrição                                        |
|--------|-----------------------------|--------------------------------------------------|
| POST   | /api/rotas/calcular-corrida | Routes API + ABB → rotas ordenadas por distância |
| POST   | /api/rotas/geocodificar     | Geocodifica CEP ou endereço livre                |
| GET    | /api/rotas/sugestoes?q=...  | Autocomplete de localização (Nominatim)          |

### Grafo Dinâmico
| Método | Rota        | Descrição                                                 |
|--------|-------------|-----------------------------------------------------------|
| GET    | /api/grafo  | Retorna o grafo construído para os parâmetros fornecidos  |

Parâmetros query para `/api/grafo`:
`origemNome`, `origemLat`, `origemLng`, `destinoNome`, `destinoLat`, `destinoLng`, `distanciaMetros`

### Carros
| Método | Rota                    | Descrição                  |
|--------|-------------------------|----------------------------|
| GET    | /api/carros             | Listar todos (com filtros) |
| GET    | /api/carros/disponiveis | Listar disponíveis         |

### Dashboard
| Método | Rota                       | Descrição                 |
|--------|----------------------------|---------------------------|
| GET    | /api/dashboard/resumo      | Totais gerais             |
| GET    | /api/dashboard/corridas    | Corridas por mês          |
| GET    | /api/dashboard/origens     | Origens mais solicitadas  |
| GET    | /api/dashboard/destinos    | Destinos mais solicitados |
| GET    | /api/dashboard/faturamento | Faturamento mensal        |

## Status de Corrida

| Status       | Descrição                                |
|--------------|------------------------------------------|
| SOLICITADA   | Criada pelo usuário, aguardando início   |
| CONFIRMADA   | Veículo alocado, confirmada pelo sistema |
| EM_ANDAMENTO | Corrida em execução                      |
| FINALIZADA   | Concluída com sucesso                    |
| CANCELADA    | Cancelada pelo usuário ou sistema        |

## Usuário Padrão

```
Usuário: admin
Senha:   admin123
```

## Branches

- `main` → versão estável
- `hom`  → homologação/testes
- `dev`  → desenvolvimento ativo

Fluxo: `dev → hom → main`
