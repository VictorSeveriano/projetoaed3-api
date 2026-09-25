-- ============================================================
-- 006_create_corrida_rotas.sql
-- Rotas alternativas retornadas pela Google Routes API.
-- Uma corrida pode ter 1..N rotas alternativas.
-- A rota selecionada é marcada com selecionada = TRUE.
-- ============================================================

CREATE TABLE IF NOT EXISTS corrida_rotas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corrida_id        UUID NOT NULL,
  ordem             INTEGER NOT NULL,
  distancia_km      NUMERIC(10,3) NOT NULL,
  distancia_metros  INTEGER NOT NULL,
  duracao_min       INTEGER,
  duracao_segundos  INTEGER,
  polyline          TEXT NOT NULL,
  selecionada       BOOLEAN NOT NULL DEFAULT FALSE,
  criada_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- FK para corrida
  CONSTRAINT fk_corrida_rotas_corrida FOREIGN KEY (corrida_id)
    REFERENCES corridas(id) ON DELETE CASCADE,

  -- Integridade numérica
  CONSTRAINT ck_corrida_rotas_distancia CHECK (distancia_km > 0),
  CONSTRAINT ck_corrida_rotas_metros    CHECK (distancia_metros > 0)
);

-- Índice principal (busca de rotas por corrida)
CREATE INDEX IF NOT EXISTS idx_corrida_rotas_corrida_id ON corrida_rotas(corrida_id);

-- Índice para localizar rota selecionada rapidamente
CREATE INDEX IF NOT EXISTS idx_corrida_rotas_selecionada ON corrida_rotas(corrida_id, selecionada)
  WHERE selecionada = TRUE;
