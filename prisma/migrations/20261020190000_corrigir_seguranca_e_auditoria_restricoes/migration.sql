-- Migração corretiva e idempotente (Seções 3, 4 e 5 / Cenário F):
-- Garante que ambientes onde uma versão anterior de 20261020130000_add_indexes_and_constraints
-- já tenha sido aplicada recebam:
--   1. Validação de integridade de corridas ativas e bloqueio de conflitos ambíguos;
--   2. Validação de domínio e coerência em veiculos e corridas;
--   3. Saneamento auditável de eventuais reservas CONFIRMADA excedentes determinísticas;
--   4. Reconciliação de metadados de auditoria (preenchimento de atualizadaEm em dados_novos
--      e marcação de pendências já solucionadas como RESOLVIDO);
--   5. Verificação e criação idempotente dos índices e constraints sem recriar estruturas válidas.
DO $$
DECLARE
  v_agora TIMESTAMPTZ := CURRENT_TIMESTAMP;
  v_ativas_inconsistentes INTEGER;
  v_detalhes_ativas_inconsistentes TEXT;
  v_conflitos_ambiguos INTEGER;
  v_detalhes_ambiguos TEXT;
  v_veiculos_invalidos INTEGER;
  v_detalhes_veiculos_invalidos TEXT;
  v_corridas_invalidas INTEGER;
  v_detalhes_corridas_invalidas TEXT;
  v_conflitos_remanescentes INTEGER;
BEGIN
  -- 1. Verifica corridas ativas (CONFIRMADA / EM_ANDAMENTO) sem veículo ou sem motorista vinculado
  SELECT
    COUNT(*),
    STRING_AGG(
      FORMAT(
        'corrida=%s (status=%s, veiculo=%s, motorista=%s)',
        c.id,
        c.status,
        COALESCE(c.veiculo_id::text, 'null'),
        COALESCE(c.motorista_id::text, 'null')
      ),
      '; ' ORDER BY c.criada_em ASC, c.id ASC
    )
  INTO v_ativas_inconsistentes, v_detalhes_ativas_inconsistentes
  FROM "corridas" c
  WHERE c."status" IN ('CONFIRMADA', 'EM_ANDAMENTO')
    AND (c."veiculo_id" IS NULL OR c."motorista_id" IS NULL);

  IF v_ativas_inconsistentes > 0 THEN
    RAISE EXCEPTION 'Encontrada(s) % corrida(s) ativa(s) inconsistente(s) sem veículo ou motorista vinculado (conflito ambíguo que exige revisão manual). Registros afetados: [%].', v_ativas_inconsistentes, v_detalhes_ativas_inconsistentes;
  END IF;

  -- 2. Verifica conflitos ambíguos entre corridas ativas no mesmo veículo
  WITH classificadas AS (
    SELECT
      id,
      veiculo_id,
      motorista_id,
      status,
      criada_em,
      COUNT(*) OVER (PARTITION BY veiculo_id) AS total_ativas_veiculo,
      COUNT(*) FILTER (WHERE status = 'EM_ANDAMENTO') OVER (PARTITION BY veiculo_id) AS total_em_andamento_veiculo,
      MIN(criada_em) FILTER (WHERE status = 'CONFIRMADA') OVER (PARTITION BY veiculo_id) AS min_criada_em_confirmada,
      ROW_NUMBER() OVER (
        PARTITION BY veiculo_id
        ORDER BY CASE WHEN status = 'EM_ANDAMENTO' THEN 0 ELSE 1 END, criada_em ASC, id ASC
      ) AS rn
    FROM "corridas"
    WHERE "status" IN ('CONFIRMADA', 'EM_ANDAMENTO')
      AND "veiculo_id" IS NOT NULL
  ),
  empates_confirmada AS (
    SELECT veiculo_id
    FROM classificadas
    WHERE total_ativas_veiculo > 1
      AND total_em_andamento_veiculo = 0
      AND status = 'CONFIRMADA'
      AND criada_em = min_criada_em_confirmada
    GROUP BY veiculo_id
    HAVING COUNT(*) > 1
  ),
  veiculos_com_conflito_ambiguo AS (
    SELECT DISTINCT veiculo_id
    FROM classificadas
    WHERE rn > 1 AND status = 'EM_ANDAMENTO'
    UNION
    SELECT DISTINCT veiculo_id
    FROM empates_confirmada
  )
  SELECT
    COUNT(DISTINCT c.veiculo_id),
    STRING_AGG(
      FORMAT(
        'corrida=%s (veiculo=%s, motorista=%s, status=%s, criada_em=%s)',
        c.id,
        c.veiculo_id,
        COALESCE(c.motorista_id::text, 'null'),
        c.status,
        to_char(c.criada_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ),
      '; ' ORDER BY c.veiculo_id, c.rn
    )
  INTO v_conflitos_ambiguos, v_detalhes_ambiguos
  FROM classificadas c
  INNER JOIN veiculos_com_conflito_ambiguo v ON v.veiculo_id = c.veiculo_id;

  IF v_conflitos_ambiguos > 0 THEN
    RAISE EXCEPTION 'Encontrados % veículo(s) com conflito ambíguo de corridas EM_ANDAMENTO ou reservas sem precedência determinística que não podem ser resolvidos automaticamente. Registros afetados: [%]. Execute o saneamento explícito via src/database/saneamentoCorridasAtivas.js.', v_conflitos_ambiguos, v_detalhes_ambiguos;
  END IF;

  -- 3. Valida dados de veículos
  SELECT
    COUNT(*),
    STRING_AGG(
      FORMAT(
        'veiculo=%s (placa=%s, porte=%s, classe=%s, status=%s, status_aprovacao=%s)',
        v.id,
        COALESCE(v.placa, 'null'),
        COALESCE(v.porte, 'null'),
        COALESCE(v.classe, 'null'),
        COALESCE(v.status, 'null'),
        COALESCE(v.status_aprovacao, 'null')
      ),
      '; ' ORDER BY v.id ASC
    )
  INTO v_veiculos_invalidos, v_detalhes_veiculos_invalidos
  FROM "veiculos" v
  WHERE v."porte" IS NULL
     OR v."porte" NOT IN ('Pequeno', 'Medio', 'Grande')
     OR v."classe" IS NULL
     OR v."classe" NOT IN ('BASICO', 'NORMAL', 'PREMIUM')
     OR NOT (
       (v."porte" = 'Pequeno' AND v."classe" = 'BASICO') OR
       (v."porte" = 'Medio' AND v."classe" = 'NORMAL') OR
       (v."porte" = 'Grande' AND v."classe" = 'PREMIUM')
     )
     OR v."status" IS NULL
     OR v."status" NOT IN ('DISPONIVEL', 'EM_CORRIDA', 'INDISPONIVEL')
     OR v."status_aprovacao" IS NULL
     OR v."status_aprovacao" NOT IN ('PENDENTE', 'APROVADO', 'REJEITADO', 'EXCLUIDO');

  IF v_veiculos_invalidos > 0 THEN
    RAISE EXCEPTION 'Encontrado(s) % veículo(s) com dados incompatíveis com as restrições de integridade (porte/classe/status). Registros afetados: [%].', v_veiculos_invalidos, v_detalhes_veiculos_invalidos;
  END IF;

  -- 4. Valida dados de corridas
  SELECT
    COUNT(*),
    STRING_AGG(
      FORMAT(
        'corrida=%s (status=%s, classe=%s, forma_pagamento=%s)',
        c.id,
        COALESCE(c.status, 'null'),
        COALESCE(c.classe, 'null'),
        COALESCE(c.forma_pagamento, 'null')
      ),
      '; ' ORDER BY c.id ASC
    )
  INTO v_corridas_invalidas, v_detalhes_corridas_invalidas
  FROM "corridas" c
  WHERE c."status" IS NULL
     OR c."status" NOT IN ('SOLICITADA', 'CONFIRMADA', 'EM_ANDAMENTO', 'FINALIZADA', 'CANCELADA')
     OR c."classe" IS NULL
     OR c."classe" NOT IN ('BASICO', 'NORMAL', 'PREMIUM')
     OR c."forma_pagamento" IS NULL
     OR c."forma_pagamento" NOT IN ('DINHEIRO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'PIX', 'VOUCHER');

  IF v_corridas_invalidas > 0 THEN
    RAISE EXCEPTION 'Encontrada(s) % corrida(s) com dados incompatíveis com as restrições de domínio (status/classe/forma_pagamento). Registros afetados: [%].', v_corridas_invalidas, v_detalhes_corridas_invalidas;
  END IF;

  -- 5. Saneia eventuais reservas CONFIRMADA excedentes determinísticas
  WITH classificadas AS (
    SELECT
      id,
      veiculo_id,
      motorista_id,
      status,
      criada_em,
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
  corridas_atualizadas AS (
    UPDATE "corridas" c
    SET
      "status" = 'SOLICITADA',
      "motorista_id" = NULL,
      "veiculo_id" = NULL,
      "atualizada_em" = v_agora
    FROM excedentes_confirmadas ec
    WHERE c."id" = ec.id
      AND c."status" = 'CONFIRMADA'
      AND c."veiculo_id" = ec.veiculo_id
    RETURNING
      c."id",
      ec.veiculo_id AS veiculo_id_anterior,
      ec.motorista_id AS motorista_id_anterior,
      ec.status AS status_anterior,
      ec.criada_em AS criada_em_anterior,
      ec.atualizada_em AS atualizada_em_anterior,
      ec.titular_id,
      ec.titular_status
  ),
  pendencias_resolvidas AS (
    UPDATE "auditoria" a
    SET
      "resultado" = 'RESOLVIDO',
      "dados_novos" = jsonb_build_object(
        'status', 'SOLICITADA',
        'motoristaId', NULL,
        'veiculoId', NULL,
        'atualizadaEm', v_agora
      )
    FROM corridas_atualizadas ca
    WHERE a."entidade" = 'Corrida'
      AND a."entidade_id" = ca.id
      AND a."acao" = 'CONFLITO_VEICULO_ATIVO_NAO_RESOLVIDO'
      AND a."resultado" = 'PENDENTE'
    RETURNING a."id"
  )
  INSERT INTO "auditoria" (
    "perfil",
    "acao",
    "modulo",
    "entidade",
    "entidade_id",
    "descricao",
    "dados_anteriores",
    "dados_novos",
    "resultado",
    "criado_em"
  )
  SELECT
    'SISTEMA',
    'SANEAMENTO_CONFLITO_VEICULO_ATIVO',
    'CORRIDAS',
    'Corrida',
    ca.id,
    FORMAT(
      'Saneamento de reserva duplicada na migração: veículo %s já estava alocado à corrida titular %s (%s). Corrida retornada para SOLICITADA sem alterar histórico de conclusão.',
      ca.veiculo_id_anterior,
      ca.titular_id,
      ca.titular_status
    ),
    jsonb_build_object(
      'status', ca.status_anterior,
      'motoristaId', ca.motorista_id_anterior,
      'veiculoId', ca.veiculo_id_anterior,
      'criadaEm', ca.criada_em_anterior,
      'atualizadaEm', ca.atualizada_em_anterior,
      'corridaTitularId', ca.titular_id,
      'corridaTitularStatus', ca.titular_status
    ),
    jsonb_build_object(
      'status', 'SOLICITADA',
      'motoristaId', NULL,
      'veiculoId', NULL,
      'atualizadaEm', v_agora
    ),
    'SUCESSO',
    v_agora
  FROM corridas_atualizadas ca;

  -- 6. Reconcilia registros de auditoria gerados por revisões anteriores da migração
  UPDATE "auditoria" a
  SET "dados_novos" = a."dados_novos" || jsonb_build_object('atualizadaEm', a."criado_em")
  WHERE a."acao" = 'SANEAMENTO_CONFLITO_VEICULO_ATIVO'
    AND a."dados_novos" IS NOT NULL
    AND jsonb_typeof(a."dados_novos") = 'object'
    AND NOT (a."dados_novos" ? 'atualizadaEm');

  UPDATE "auditoria" a
  SET "resultado" = 'RESOLVIDO'
  WHERE a."entidade" = 'Corrida'
    AND a."acao" = 'CONFLITO_VEICULO_ATIVO_NAO_RESOLVIDO'
    AND a."resultado" = 'PENDENTE'
    AND EXISTS (
      SELECT 1
      FROM "corridas" c
      WHERE c."id" = a."entidade_id"
        AND (
          c."status" NOT IN ('CONFIRMADA', 'EM_ANDAMENTO')
          OR c."veiculo_id" IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM "corridas" c2
            WHERE c2."veiculo_id" = c."veiculo_id"
              AND c2."id" <> c."id"
              AND c2."status" IN ('CONFIRMADA', 'EM_ANDAMENTO')
          )
        )
    );

  -- 7. Sincroniza status EM_CORRIDA nos veículos que possuem corrida ativa legítima
  UPDATE "veiculos" v
  SET "status" = 'EM_CORRIDA',
      "atualizado_em" = v_agora
  WHERE EXISTS (
    SELECT 1
    FROM "corridas" c
    WHERE c."veiculo_id" = v."id"
      AND c."status" IN ('CONFIRMADA', 'EM_ANDAMENTO')
  )
  AND v."status" = 'DISPONIVEL';

  -- 8. Confirma ausência de qualquer conflito remanescente
  SELECT COUNT(*) INTO v_conflitos_remanescentes
  FROM (
    SELECT "veiculo_id"
    FROM "corridas"
    WHERE "status" IN ('CONFIRMADA', 'EM_ANDAMENTO')
      AND "veiculo_id" IS NOT NULL
    GROUP BY "veiculo_id"
    HAVING COUNT(*) > 1
  ) remanescentes;

  IF v_conflitos_remanescentes > 0 THEN
    RAISE EXCEPTION 'Permanecem % veículo(s) com múltiplas corridas ativas após etapa de saneamento; migração abortada por segurança.', v_conflitos_remanescentes;
  END IF;

  -- 9. Garante constraints de domínio e coerência sem dropar constraints válidas existentes
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'veiculos'::regclass AND conname = 'ck_veiculos_porte'
  ) THEN
    ALTER TABLE "veiculos" ADD CONSTRAINT "ck_veiculos_porte"
      CHECK ("porte" IN ('Pequeno', 'Medio', 'Grande'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'veiculos'::regclass AND conname = 'ck_veiculos_classe'
  ) THEN
    ALTER TABLE "veiculos" ADD CONSTRAINT "ck_veiculos_classe"
      CHECK ("classe" IN ('BASICO', 'NORMAL', 'PREMIUM'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'veiculos'::regclass AND conname = 'ck_veiculos_porte_classe'
  ) THEN
    ALTER TABLE "veiculos" ADD CONSTRAINT "ck_veiculos_porte_classe"
      CHECK (
        ("porte" = 'Pequeno' AND "classe" = 'BASICO') OR
        ("porte" = 'Medio' AND "classe" = 'NORMAL') OR
        ("porte" = 'Grande' AND "classe" = 'PREMIUM')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'veiculos'::regclass AND conname = 'ck_veiculos_status'
  ) THEN
    ALTER TABLE "veiculos" ADD CONSTRAINT "ck_veiculos_status"
      CHECK ("status" IN ('DISPONIVEL', 'EM_CORRIDA', 'INDISPONIVEL'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'veiculos'::regclass AND conname = 'ck_veiculos_status_aprovacao'
  ) THEN
    ALTER TABLE "veiculos" ADD CONSTRAINT "ck_veiculos_status_aprovacao"
      CHECK ("status_aprovacao" IN ('PENDENTE', 'APROVADO', 'REJEITADO', 'EXCLUIDO'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'corridas'::regclass AND conname = 'ck_corridas_status'
  ) THEN
    ALTER TABLE "corridas" ADD CONSTRAINT "ck_corridas_status"
      CHECK ("status" IN ('SOLICITADA', 'CONFIRMADA', 'EM_ANDAMENTO', 'FINALIZADA', 'CANCELADA'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'corridas'::regclass AND conname = 'ck_corridas_classe'
  ) THEN
    ALTER TABLE "corridas" ADD CONSTRAINT "ck_corridas_classe"
      CHECK ("classe" IN ('BASICO', 'NORMAL', 'PREMIUM'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'corridas'::regclass AND conname = 'ck_corridas_forma_pagamento'
  ) THEN
    ALTER TABLE "corridas" ADD CONSTRAINT "ck_corridas_forma_pagamento"
      CHECK ("forma_pagamento" IN ('DINHEIRO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'PIX', 'VOUCHER'));
  END IF;

  -- 10. Garante índices compostos e índice único parcial de corridas ativas por veículo
  CREATE INDEX IF NOT EXISTS "idx_veiculos_aprovacao_status_classe" ON "veiculos"("status_aprovacao", "status", "classe");
  CREATE INDEX IF NOT EXISTS "idx_corridas_motorista_status" ON "corridas"("motorista_id", "status");
  CREATE INDEX IF NOT EXISTS "idx_corridas_motorista_data_horario" ON "corridas"("motorista_id", "data_horario");
  CREATE INDEX IF NOT EXISTS "idx_corridas_usuario_status" ON "corridas"("usuario_id", "status");

  CREATE UNIQUE INDEX IF NOT EXISTS "uq_corridas_veiculo_ativo"
    ON "corridas"("veiculo_id")
    WHERE "status" IN ('CONFIRMADA', 'EM_ANDAMENTO') AND "veiculo_id" IS NOT NULL;
END $$;

