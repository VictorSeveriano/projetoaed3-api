-- 1. Identificação, saneamento seguro de reservas CONFIRMADA excedentes e bloqueio de conflitos EM_ANDAMENTO ambíguos
-- Regra de integridade (Seção 5):
--   - Nenhuma corrida ativa (CONFIRMADA / EM_ANDAMENTO) é convertida em FINALIZADA ou CANCELADA.
--   - Se existirem conflitos envolvendo múltiplas corridas EM_ANDAMENTO no mesmo veículo (que não podem
--     ser resolvidos automaticamente com segurança), a migração interrompe a execução e lista os registros afetados.
--   - Reservas CONFIRMADA excedentes (ainda não iniciadas em veículo já ocupado por corrida titular)
--     são registradas na tabela de auditoria e retornam para SOLICITADA (veiculo_id = NULL, motorista_id = NULL).
DO $$
DECLARE
  v_conflitos_ambiguos INTEGER;
  v_detalhes_ambiguos TEXT;
BEGIN
  -- 1.1. Verifica se existem conflitos EM_ANDAMENTO que exigem resolução explícita
  WITH classificadas AS (
    SELECT
      id,
      veiculo_id,
      motorista_id,
      status,
      criada_em,
      ROW_NUMBER() OVER (
        PARTITION BY veiculo_id
        ORDER BY CASE WHEN status = 'EM_ANDAMENTO' THEN 0 ELSE 1 END, criada_em ASC, id ASC
      ) AS rn
    FROM "corridas"
    WHERE "status" IN ('CONFIRMADA', 'EM_ANDAMENTO')
      AND "veiculo_id" IS NOT NULL
  ),
  veiculos_com_excedente_em_andamento AS (
    SELECT DISTINCT veiculo_id
    FROM classificadas
    WHERE rn > 1 AND status = 'EM_ANDAMENTO'
  )
  SELECT
    COUNT(DISTINCT c.veiculo_id),
    STRING_AGG(
      FORMAT('corrida=%s (veiculo=%s, motorista=%s, status=%s)', c.id, c.veiculo_id, COALESCE(c.motorista_id::text, 'null'), c.status),
      '; ' ORDER BY c.veiculo_id, c.rn
    )
  INTO v_conflitos_ambiguos, v_detalhes_ambiguos
  FROM classificadas c
  INNER JOIN veiculos_com_excedente_em_andamento v ON v.veiculo_id = c.veiculo_id;

  IF v_conflitos_ambiguos > 0 THEN
    RAISE EXCEPTION 'Encontrados % veículo(s) com conflito ambíguo de corridas EM_ANDAMENTO que não podem ser resolvidos automaticamente. Registros afetados: [%]. Execute o saneamento explícito via src/database/saneamentoCorridasAtivas.js.', v_conflitos_ambiguos, v_detalhes_ambiguos;
  END IF;

  -- 1.2. Saneia com auditoria reservas CONFIRMADA excedentes (ainda não iniciadas)
  WITH classificadas AS (
    SELECT
      id,
      veiculo_id,
      motorista_id,
      status,
      atualizada_em,
      FIRST_VALUE(id) OVER (
        PARTITION BY veiculo_id
        ORDER BY CASE WHEN status = 'EM_ANDAMENTO' THEN 0 ELSE 1 END, criada_em ASC, id ASC
      ) AS titular_id,
      FIRST_VALUE(status) OVER (
        PARTITION BY veiculo_id
        ORDER BY CASE WHEN status = 'EM_ANDAMENTO' THEN 0 ELSE 1 END, criada_em ASC, id ASC
      ) AS titular_status,
      ROW_NUMBER() OVER (
        PARTITION BY veiculo_id
        ORDER BY CASE WHEN status = 'EM_ANDAMENTO' THEN 0 ELSE 1 END, criada_em ASC, id ASC
      ) AS rn
    FROM "corridas"
    WHERE "status" IN ('CONFIRMADA', 'EM_ANDAMENTO')
      AND "veiculo_id" IS NOT NULL
  ),
  excedentes_confirmadas AS (
    SELECT * FROM classificadas WHERE rn > 1 AND status = 'CONFIRMADA'
  ),
  registro_auditoria AS (
    INSERT INTO "auditoria" (
      "perfil",
      "acao",
      "modulo",
      "entidade",
      "entidade_id",
      "descricao",
      "dados_anteriores",
      "dados_novos",
      "resultado"
    )
    SELECT
      'SISTEMA',
      'SANEAMENTO_CONFLITO_VEICULO_ATIVO',
      'CORRIDAS',
      'Corrida',
      ec.id,
      FORMAT(
        'Saneamento de reserva duplicada na migração: veículo %s já estava alocado à corrida titular %s (%s). Corrida retornada para SOLICITADA sem alterar histórico de conclusão.',
        ec.veiculo_id,
        ec.titular_id,
        ec.titular_status
      ),
      jsonb_build_object(
        'status', ec.status,
        'motoristaId', ec.motorista_id,
        'veiculoId', ec.veiculo_id,
        'atualizadaEm', ec.atualizada_em
      ),
      jsonb_build_object(
        'status', 'SOLICITADA',
        'motoristaId', NULL,
        'veiculoId', NULL
      ),
      'SUCESSO'
    FROM excedentes_confirmadas ec
    RETURNING entidade_id
  )
  UPDATE "corridas" c
  SET
    "status" = 'SOLICITADA',
    "motorista_id" = NULL,
    "veiculo_id" = NULL,
    "atualizada_em" = CURRENT_TIMESTAMP
  WHERE c."id" IN (SELECT id FROM excedentes_confirmadas);
END $$;

-- Sincronizar status dos veículos que possuem corrida ativa
UPDATE "veiculos" v
SET "status" = 'EM_CORRIDA',
    "atualizado_em" = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1
  FROM "corridas" c
  WHERE c."veiculo_id" = v."id"
    AND c."status" IN ('CONFIRMADA', 'EM_ANDAMENTO')
)
AND v."status" = 'DISPONIVEL';

-- 2. Índices compostos para consultas frequentes
CREATE INDEX IF NOT EXISTS "idx_veiculos_aprovacao_status_classe" ON "veiculos"("status_aprovacao", "status", "classe");
CREATE INDEX IF NOT EXISTS "idx_corridas_motorista_status" ON "corridas"("motorista_id", "status");
CREATE INDEX IF NOT EXISTS "idx_corridas_motorista_data_horario" ON "corridas"("motorista_id", "data_horario");
CREATE INDEX IF NOT EXISTS "idx_corridas_usuario_status" ON "corridas"("usuario_id", "status");

-- 3. Índice único parcial para impedir múltiplas corridas ativas no mesmo veículo
CREATE UNIQUE INDEX IF NOT EXISTS "uq_corridas_veiculo_ativo"
  ON "corridas"("veiculo_id")
  WHERE "status" IN ('CONFIRMADA', 'EM_ANDAMENTO') AND "veiculo_id" IS NOT NULL;

-- 4. Constraints de domínio e coerência em veiculos e corridas
ALTER TABLE "veiculos" DROP CONSTRAINT IF EXISTS "ck_veiculos_porte";
ALTER TABLE "veiculos" ADD CONSTRAINT "ck_veiculos_porte"
  CHECK ("porte" IN ('Pequeno', 'Medio', 'Grande'));

ALTER TABLE "veiculos" DROP CONSTRAINT IF EXISTS "ck_veiculos_classe";
ALTER TABLE "veiculos" ADD CONSTRAINT "ck_veiculos_classe"
  CHECK ("classe" IN ('BASICO', 'NORMAL', 'PREMIUM'));

ALTER TABLE "veiculos" DROP CONSTRAINT IF EXISTS "ck_veiculos_porte_classe";
ALTER TABLE "veiculos" ADD CONSTRAINT "ck_veiculos_porte_classe"
  CHECK (
    ("porte" = 'Pequeno' AND "classe" = 'BASICO') OR
    ("porte" = 'Medio' AND "classe" = 'NORMAL') OR
    ("porte" = 'Grande' AND "classe" = 'PREMIUM')
  );

ALTER TABLE "veiculos" DROP CONSTRAINT IF EXISTS "ck_veiculos_status";
ALTER TABLE "veiculos" ADD CONSTRAINT "ck_veiculos_status"
  CHECK ("status" IN ('DISPONIVEL', 'EM_CORRIDA', 'INDISPONIVEL'));

ALTER TABLE "veiculos" DROP CONSTRAINT IF EXISTS "ck_veiculos_status_aprovacao";
ALTER TABLE "veiculos" ADD CONSTRAINT "ck_veiculos_status_aprovacao"
  CHECK ("status_aprovacao" IN ('PENDENTE', 'APROVADO', 'REJEITADO', 'EXCLUIDO'));

ALTER TABLE "corridas" DROP CONSTRAINT IF EXISTS "ck_corridas_status";
ALTER TABLE "corridas" ADD CONSTRAINT "ck_corridas_status"
  CHECK ("status" IN ('SOLICITADA', 'CONFIRMADA', 'EM_ANDAMENTO', 'FINALIZADA', 'CANCELADA'));

ALTER TABLE "corridas" DROP CONSTRAINT IF EXISTS "ck_corridas_classe";
ALTER TABLE "corridas" ADD CONSTRAINT "ck_corridas_classe"
  CHECK ("classe" IN ('BASICO', 'NORMAL', 'PREMIUM'));

ALTER TABLE "corridas" DROP CONSTRAINT IF EXISTS "ck_corridas_forma_pagamento";
ALTER TABLE "corridas" ADD CONSTRAINT "ck_corridas_forma_pagamento"
  CHECK ("forma_pagamento" IN ('DINHEIRO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'PIX', 'VOUCHER'));
