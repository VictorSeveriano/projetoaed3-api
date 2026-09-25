-- ============================================================
-- 004_create_veiculos.sql
-- Veículos associados a motoristas APROVADOS.
-- motorista_id → usuarios.id (o veículo referencia o usuarioId do motorista,
-- conforme decisão de design original do projeto).
-- ============================================================

CREATE TABLE IF NOT EXISTS veiculos (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marca                       VARCHAR(80)   NOT NULL,
  modelo                      VARCHAR(100)  NOT NULL,
  ano                         INTEGER       NOT NULL,
  placa                       VARCHAR(10)   NOT NULL,
  cor                         VARCHAR(50),
  porte                       VARCHAR(50)   NOT NULL,
  classe                      VARCHAR(20)   NOT NULL,
  quilometragem               NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantidade_passageiros      INTEGER       NOT NULL DEFAULT 4,
  possui_ar_condicionado      BOOLEAN       NOT NULL DEFAULT FALSE,
  possui_extintor             BOOLEAN       NOT NULL DEFAULT FALSE,
  possui_cinto_seguranca      BOOLEAN       NOT NULL DEFAULT FALSE,
  documentacao_regularizada   BOOLEAN       NOT NULL DEFAULT FALSE,
  status_aprovacao            VARCHAR(20)   NOT NULL DEFAULT 'PENDENTE',
  status                      VARCHAR(20)   NOT NULL DEFAULT 'INDISPONIVEL',
  tarifa_base                 NUMERIC(10,2),
  motorista_id                UUID          NOT NULL,
  criado_em                   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  atualizado_em               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Placa única no sistema
  CONSTRAINT uq_veiculos_placa UNIQUE (placa),

  -- Relação: motorista_id → usuarios.id
  -- (Usuário deve ter perfil MOTORISTA — regra garantida no Service)
  CONSTRAINT fk_veiculos_motorista FOREIGN KEY (motorista_id)
    REFERENCES usuarios(id) ON DELETE RESTRICT,

  -- Status válidos
  CONSTRAINT ck_veiculos_status_aprovacao CHECK (
    status_aprovacao IN ('PENDENTE', 'APROVADO', 'REJEITADO')
  ),
  CONSTRAINT ck_veiculos_status CHECK (
    status IN ('DISPONIVEL', 'EM_CORRIDA', 'INDISPONIVEL')
  ),
  -- Classe válida (derivada do porte pelo Service)
  CONSTRAINT ck_veiculos_classe CHECK (
    classe IN ('BASICO', 'NORMAL', 'PREMIUM')
  ),
  -- Integridade numérica
  CONSTRAINT ck_veiculos_quilometragem CHECK (quilometragem >= 0),
  CONSTRAINT ck_veiculos_passageiros   CHECK (quantidade_passageiros > 0),
  CONSTRAINT ck_veiculos_ano           CHECK (ano >= 1900 AND ano <= 2100)
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_veiculos_motorista_id    ON veiculos(motorista_id);
CREATE INDEX IF NOT EXISTS idx_veiculos_status          ON veiculos(status);
CREATE INDEX IF NOT EXISTS idx_veiculos_status_aprovacao ON veiculos(status_aprovacao);
CREATE INDEX IF NOT EXISTS idx_veiculos_classe          ON veiculos(classe);
