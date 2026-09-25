-- ============================================================
-- 005_create_corridas.sql
-- Entidade central da operação.
-- origem_endereco_id e destino_endereco_id são snapshots independentes —
-- não dependem do endereço atual do usuário.
-- ============================================================

CREATE TABLE IF NOT EXISTS corridas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Partes envolvidas
  usuario_id            UUID NOT NULL,
  motorista_id          UUID,           -- NULL até ser atribuído
  veiculo_id            UUID,           -- NULL até ser alocado

  -- Endereços snapshot (preservados mesmo se usuário alterar o seu)
  origem_endereco_id    UUID NOT NULL,
  destino_endereco_id   UUID NOT NULL,

  -- Nomes de exibição
  origem_nome           VARCHAR(255) NOT NULL,
  destino_nome          VARCHAR(255) NOT NULL,

  -- Coordenadas geográficas
  origem_lat            NUMERIC(10,7),
  origem_lng            NUMERIC(10,7),
  destino_lat           NUMERIC(10,7),
  destino_lng           NUMERIC(10,7),

  -- Rota selecionada
  rota_caminho          JSONB,          -- sequência de nomes dos pontos
  polyline              TEXT,           -- encoded polyline da rota (Google Routes API)

  -- Métricas
  distancia_km          NUMERIC(10,3) NOT NULL,
  duracao_min           INTEGER,

  -- Financeiro
  valor                 NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Temporal
  data_horario          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status                VARCHAR(20) NOT NULL DEFAULT 'SOLICITADA',
  criada_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizada_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- FKs
  CONSTRAINT fk_corridas_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_corridas_motorista FOREIGN KEY (motorista_id)
    REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_corridas_veiculo FOREIGN KEY (veiculo_id)
    REFERENCES veiculos(id) ON DELETE RESTRICT,
  CONSTRAINT fk_corridas_origem FOREIGN KEY (origem_endereco_id)
    REFERENCES enderecos(id) ON DELETE RESTRICT,
  CONSTRAINT fk_corridas_destino FOREIGN KEY (destino_endereco_id)
    REFERENCES enderecos(id) ON DELETE RESTRICT,

  -- Status válidos
  CONSTRAINT ck_corridas_status CHECK (
    status IN ('SOLICITADA', 'CONFIRMADA', 'EM_ANDAMENTO', 'FINALIZADA', 'CANCELADA')
  ),
  -- Integridade numérica
  CONSTRAINT ck_corridas_distancia CHECK (distancia_km > 0),
  CONSTRAINT ck_corridas_duracao   CHECK (duracao_min IS NULL OR duracao_min > 0),
  CONSTRAINT ck_corridas_valor     CHECK (valor >= 0)
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_corridas_usuario_id   ON corridas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_corridas_motorista_id ON corridas(motorista_id);
CREATE INDEX IF NOT EXISTS idx_corridas_veiculo_id   ON corridas(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_corridas_status       ON corridas(status);
CREATE INDEX IF NOT EXISTS idx_corridas_data_horario ON corridas(data_horario);
