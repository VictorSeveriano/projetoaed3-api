-- 1. Verificação de integridade antes de criar o índice único parcial de corridas ativas por veículo
-- Nenhuma corrida ativa (CONFIRMADA / EM_ANDAMENTO) é alterada para FINALIZADA ou CANCELADA na migração.
-- Caso existam alocações duplicadas, execute o saneamento auditável em src/database/saneamentoCorridasAtivas.js antes de aplicar a migração.
DO $$
DECLARE
  v_conflitos INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_conflitos
  FROM (
    SELECT "veiculo_id"
    FROM "corridas"
    WHERE "status" IN ('CONFIRMADA', 'EM_ANDAMENTO')
      AND "veiculo_id" IS NOT NULL
    GROUP BY "veiculo_id"
    HAVING COUNT(*) > 1
  ) duplicados;

  IF v_conflitos > 0 THEN
    RAISE EXCEPTION 'Encontrados % veículo(s) com múltiplas corridas ativas (CONFIRMADA/EM_ANDAMENTO). Execute o saneamento auditável (src/database/saneamentoCorridasAtivas.js) antes de criar uq_corridas_veiculo_ativo — corridas ativas nunca devem ser convertidas em FINALIZADA/CANCELADA sem comprovação.', v_conflitos;
  END IF;
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

