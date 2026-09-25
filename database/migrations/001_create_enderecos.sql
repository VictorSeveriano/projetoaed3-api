-- ============================================================
-- 001_create_enderecos.sql
-- Tabela de endereços estruturados.
-- Usada por: usuarios (endereco_id), corridas (origem/destino).
-- ============================================================

CREATE TABLE IF NOT EXISTS enderecos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logradouro      VARCHAR(200),
  numero          VARCHAR(20),
  complemento     VARCHAR(150),
  bairro          VARCHAR(120),
  cidade          VARCHAR(120),
  estado          VARCHAR(120),
  uf              CHAR(2),
  cep             VARCHAR(8),
  pais            VARCHAR(80) DEFAULT 'Brasil',
  latitude        NUMERIC(10,7),
  longitude       NUMERIC(10,7),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para buscas por cidade/estado (dashboard, filtros)
CREATE INDEX IF NOT EXISTS idx_enderecos_cidade ON enderecos(cidade);
CREATE INDEX IF NOT EXISTS idx_enderecos_cep    ON enderecos(cep);
